import { diagnosticGuide } from "./diagnostics";
import { redactDiagnosticText, redactDiagnosticValue } from "./privacy";
import { speechPlainText } from "./voice";
import type { NaturalAudio } from "./audio-player";
import { supplierBalance, extendedContext, diagnosticContext } from "./sources.server";
import { getCookie, setResponseHeader } from "@tanstack/react-start/server";
import { requireAdmin, request } from "../admin/auth.server";
import {
  assistantInput,
  assistantSystem,
  resolvePeriod,
  diagnosisInstructions,
} from "./validation";
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
  const clientSearch =
    data.clientSearch || data.question.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || "";
  const requestedReference =
    data.reportedError?.reference ||
    data.question.match(
      /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i,
    )?.[0] ||
    data.question.match(/\bref(?:er[eê]ncia)?\s*#?\s*(\d{1,12})\b/i)?.[1] ||
    "";
  const reference = redactDiagnosticText(requestedReference).slice(0, 100);
  const [response, socialBalance, smsBalance, extended, diagnostics] = await Promise.all([
    request("/functions/v1/astros-admin-context", token, {
      method: "POST",
      body: JSON.stringify({ ...period, clientSearch }),
      signal: AbortSignal.timeout(45000),
    }),
    supplierBalance(token, "social"),
    supplierBalance(token, "sms"),
    extendedContext(token, period.from, period.until, clientSearch),
    diagnosticContext(
      token,
      period.from,
      period.until,
      clientSearch,
      data.reportedError?.module,
      reference,
    ),
  ]);
  if (!response.ok)
    throw Error(
      "Não foi possível consultar as fontes do assistente. Confira a função astros-admin-context.",
    );
  const context = await response.json();
  if (!context?.snapshot?.generatedAt) throw Error("A consulta retornou dados incompletos.");
  context.supplierBalances = { social: socialBalance, sms: smsBalance };
  context.extended = extended;
  context.diagnostics = diagnostics;
  context.technicalGuide = diagnosticGuide;
  context.sources = [
    ...(context.sources || []),
    { name: "SMMRaja · saldo externo", available: socialBalance.available },
    { name: "SMSPool · saldo externo", available: smsBalance.available },
    { name: "Supabase · consultas ampliadas", available: extended.available },
    { name: "Diagnósticos operacionais", available: diagnostics.available },
  ];
  const safeContext = redactDiagnosticValue(context);
  const payload = JSON.stringify(safeContext);
  if (payload.length > 65000)
    throw Error("A consulta ficou grande demais. Restrinja o período ou o cliente.");
  const { completeAssistant } = await import("./lovable.server");
  const text = await completeAssistant([
    { role: "system", content: assistantSystem + "\n" + diagnosisInstructions },
    {
      role: "user",
      content: JSON.stringify({
        question: redactDiagnosticText(data.question),
        reportedError: redactDiagnosticValue(data.reportedError ?? null),
        previousConversation: redactDiagnosticValue(data.history),
        verifiedSnapshot: safeContext,
      }),
    },
  ]);
  if (typeof text !== "string" || !text.trim() || text.length > 12000)
    throw Error("O modelo não retornou uma resposta válida. Tente uma pergunta mais específica.");
  const voiceResult: { naturalAudio?: NaturalAudio; voiceError?: string } = {};
  if (data.voiceRequested) {
    const clean = speechPlainText(text);
    const shortened = clean.length > 1000;
    let spokenText = clean;
    if (shortened) {
      const start = clean.slice(0, 850),
        stop = Math.max(start.lastIndexOf(". "), start.lastIndexOf("! "), start.lastIndexOf("? "));
      spokenText =
        (stop > 400 ? start.slice(0, stop + 1) : start) +
        " Os demais detalhes estão na resposta escrita.";
    }
    try {
      const { synthesizeAssistantVoice } = await import("./voice-transport.server");
      voiceResult.naturalAudio = {
        ...(await synthesizeAssistantVoice(spokenText)),
        spokenText,
        shortened,
      };
    } catch (e) {
      voiceResult.voiceError =
        e instanceof Error &&
        /^(A voz natural precisa|Os créditos de IA|O limite temporário|A integração de voz|Não foi possível gerar a voz|A voz retornou|Áudio acima|Texto de voz)/.test(
          e.message,
        )
          ? e.message
          : "Não foi possível gerar a voz natural agora. A resposta está disponível por escrito.";
    }
  }
  return {
    text,
    ...voiceResult,
    from: period.from,
    until: period.until,
    generatedAt: String(context.snapshot.generatedAt),
    sources: context.sources as Array<{ name: string; available: boolean }>,
  };
}
