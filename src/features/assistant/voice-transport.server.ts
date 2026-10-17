import { createServerOnlyFn } from "@tanstack/react-start";
import { Buffer } from "node:buffer";
// OpenAI-compatible speech contract verified against @tanstack/ai-lovable 0.6.0, adapters/tts.ts.
// Uses the existing project key; never accepts a caller-supplied model, URL or credential.
export const synthesizeAssistantVoice = createServerOnlyFn(
  async (text: string): Promise<{ base64: string; mimeType: "audio/wav" }> => {
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) throw Error("A voz natural precisa da chave de IA no servidor.");
    if (!text.trim() || text.length > 1200) throw Error("Texto de voz fora do limite.");
    const r = await fetch("https://ai.gateway.lovable.dev/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + key,
        "Lovable-API-Key": key,
        "X-Lovable-AIG-SDK": "tanstack-ai",
        "Content-Type": "application/json",
      },
      redirect: "error",
      signal: AbortSignal.timeout(30_000),
      body: JSON.stringify({
        model: "openai/gpt-4o-mini-tts",
        input: text,
        voice: "onyx",
        response_format: "wav",
        instructions:
          "Fale em português brasileiro, com voz masculina acolhedora e natural de assistente pessoal. Tom conversacional, ritmo moderado, pausas curtas e entonação humana. Diga somente o texto recebido, sem ler instruções.",
      }),
    }).catch(() => {
      throw Error("Não foi possível gerar a voz: conexão interrompida ou tempo esgotado. (V-CONEXAO)");
    });
    if (!r.ok) {
      await r.body?.cancel();
      throw Error(
        r.status === 402
          ? "Os créditos de IA para voz estão indisponíveis."
          : r.status === 429
            ? "O limite temporário de voz foi atingido."
            : r.status === 401 || r.status === 403
              ? "A integração de voz precisa de configuração no Lovable."
              : `Não foi possível gerar a voz natural agora. (V-HTTP-${r.status})`,
      );
    }
    const chunks: Uint8Array[] = [];
    let size = 0;
    const reader = r.body?.getReader();
    if (!reader) throw Error("A voz não retornou áudio.");
    try {
      while (true) {
        const v = await reader.read();
        if (v.done) break;
        size += v.value.length;
        if (size > 4 * 1024 * 1024) {
          await reader.cancel();
          throw Error("Áudio acima do limite. Faça uma pergunta mais específica.");
        }
        chunks.push(v.value);
      }
    } finally {
      reader.releaseLock();
    }
    const bytes = Buffer.concat(chunks);
    if (
      bytes.length < 44 ||
      bytes.toString("ascii", 0, 4) !== "RIFF" ||
      bytes.toString("ascii", 8, 12) !== "WAVE"
    )
      throw Error("A voz retornou um formato de áudio não confirmado.");
    return { base64: bytes.toString("base64"), mimeType: "audio/wav" };
  },
);
