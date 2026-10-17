import { it, expect, vi, afterEach } from "vitest";
vi.mock("@tanstack/react-start", () => ({ createServerOnlyFn: (f: unknown) => f }));
import { synthesizeAssistantVoice } from "./voice-transport.server";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
it("uses the documented speech endpoint with only bounded text and returns validated MP3", async () => {
  vi.stubEnv("LOVABLE_API_KEY", "private-voice-key");
  const wav = new Uint8Array(48);
  wav.set(new TextEncoder().encode("ID3"), 0);
  const fetch = vi.fn().mockResolvedValue(new Response(wav));
  vi.stubGlobal("fetch", fetch);
  const r = await synthesizeAssistantVoice("Olá, tudo bem?");
  expect(r.mimeType).toBe("audio/mpeg");
  expect(JSON.stringify(r)).not.toContain("private-voice-key");
  const [url, opts] = fetch.mock.calls[0]!;
  expect(url).toBe("https://ai.gateway.lovable.dev/v1/audio/speech");
  expect(JSON.parse(opts.body)).toMatchObject({
    model: "openai/gpt-4o-mini-tts",
    voice: "onyx",
    response_format: "mp3",
    input: "Olá, tudo bem?",
  });
  expect(opts.redirect).toBe("error");
});
it("rejects error and non-audio responses without echoing private provider data", async () => {
  vi.stubEnv("LOVABLE_API_KEY", "secret");
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(new Response("secret upstream details", { status: 402 }))
      .mockResolvedValueOnce(new Response("this is not wav")),
  );
  await expect(synthesizeAssistantVoice("Olá")).rejects.toThrow("créditos");
  await expect(synthesizeAssistantVoice("Olá")).rejects.toThrow("formato");
});
it("does not call a provider without credentials or with excessive text", async () => {
  vi.stubEnv("LOVABLE_API_KEY", "");
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  await expect(synthesizeAssistantVoice("Olá")).rejects.toThrow("chave");
  vi.stubEnv("LOVABLE_API_KEY", "secret");
  await expect(synthesizeAssistantVoice("a".repeat(1201))).rejects.toThrow("limite");
  expect(fetch).not.toHaveBeenCalled();
});

it("exposes a safe status code and preserves no upstream error body", async () => {
  vi.stubEnv("LOVABLE_API_KEY", "secret");
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response("secret upstream", { status: 400 })),
  );
  await expect(synthesizeAssistantVoice("Olá")).rejects.toThrow("V-HTTP-400");
});
it("bounds failed connections without disclosing request credentials", async () => {
  vi.stubEnv("LOVABLE_API_KEY", "secret");
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(Error("secret upstream")));
  await expect(synthesizeAssistantVoice("Olá")).rejects.toThrow("V-CONEXAO");
});

it("distinguishes timeout from network failure without exposing the raw error", async () => {
  vi.stubEnv("LOVABLE_API_KEY", "secret");
  vi.stubGlobal(
    "fetch",
    vi.fn().mockRejectedValue(new DOMException("secret upstream", "TimeoutError")),
  );
  await expect(synthesizeAssistantVoice("Olá")).rejects.toThrow("V-TEMPO");
});
