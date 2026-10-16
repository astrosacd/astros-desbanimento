import { it, expect, vi, afterEach } from "vitest";
vi.mock("@tanstack/react-start", () => ({ createServerOnlyFn: (f: unknown) => f }));
import { synthesizeAssistantVoice } from "./voice-transport.server";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
it("uses the documented speech endpoint with only bounded text and returns validated WAV", async () => {
  vi.stubEnv("LOVABLE_API_KEY", "private-voice-key");
  const wav = new Uint8Array(48);
  wav.set(new TextEncoder().encode("RIFF"), 0);
  wav.set(new TextEncoder().encode("WAVE"), 8);
  const fetch = vi.fn().mockResolvedValue(new Response(wav));
  vi.stubGlobal("fetch", fetch);
  const r = await synthesizeAssistantVoice("Olá, tudo bem?");
  expect(r.mimeType).toBe("audio/wav");
  expect(JSON.stringify(r)).not.toContain("private-voice-key");
  const [url, opts] = fetch.mock.calls[0]!;
  expect(url).toBe("https://ai.gateway.lovable.dev/v1/audio/speech");
  expect(JSON.parse(opts.body)).toMatchObject({
    model: "google/gemini-2.5-flash-tts",
    response_format: "wav",
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
