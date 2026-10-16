import { getCookie, setResponseHeader } from "@tanstack/react-start/server";
import { requireAdmin, request } from "../admin/auth.server";
import { assistantInput, assistantSystem, resolvePeriod } from "./validation";
export async function answerAssistant(input: unknown) {
  await requireAdmin();
  setResponseHeader("Cache-Control", "private, no-store");
  const data = assistantInput.parse(input),
    period = resolvePeriod(data.question, data.from, data.until);
  const token = getCookie("astros_admin_session");
  if (!token) throw Error("Entre novamente na administração.");
  const gate = await request("/rest/v1/rpc/astros_assistant_gate", token, {
    method: "POST",
    body: "{}",
  });
  if (!gate.ok) throw Error("Ative o SQL do assistente no Supabase antes de consultar.");
  if ((await gate.json()) !== true) throw Error("Limite de consultas atingido. Aguarde um minuto.");
  const response = await request("/functions/v1/astros-admin-context", token, {
    method: "POST",
    body: JSON.stringify({ ...period, clientSearch: data.clientSearch }),
    signal: AbortSignal.timeout(45000),
  });
  if (!response.ok)
    throw Error(
      "Não foi possível consultar as fontes do assistente. Confira a função astros-admin-context.",
    );
  const context = await response.json();
  if (!context?.snapshot?.generatedAt) throw Error("A consulta retornou dados incompletos.");
  const payload = JSON.stringify(context);
  if (payload.length > 45000)
    throw Error("A consulta ficou grande demais. Restrinja o período ou o cliente.");
  const { completeAssistant } = await import("./lovable.server");
  const text = await completeAssistant([
    { role: "system", content: assistantSystem },
    {
      role: "user",
      content: JSON.stringify({
        question: data.question,
        previousConversation: data.history,
        verifiedSnapshot: context,
      }),
    },
  ]);
  if (typeof text !== "string" || !text.trim() || text.length > 12000)
    throw Error("O modelo não retornou uma resposta válida. Tente uma pergunta mais específica.");
  return {
    text,
    from: period.from,
    until: period.until,
    generatedAt: String(context.snapshot.generatedAt),
    sources: context.sources as Array<{ name: string; available: boolean }>,
  };
}
