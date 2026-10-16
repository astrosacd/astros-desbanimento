import { beforeEach, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  stream: vi.fn(),
  provider: vi.fn(),
  responses: vi.fn(() => "model"),
}));
vi.mock("@tanstack/react-start", () => ({ createServerOnlyFn: (fn: unknown) => fn }));
vi.mock("@ai-sdk/openai", () => ({ createOpenAI: mocks.provider }));
vi.mock("ai", () => ({
  streamText: mocks.stream,
  APICallError: { isInstance: (e: any) => e?.upstream === true },
}));
import { completeAssistant } from "./lovable.server";
const messages = [
  { role: "system" as const, content: "Use só o resumo." },
  { role: "user" as const, content: "Resumo de hoje" },
];
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("LOVABLE_API_KEY", "test-private-key");
  mocks.provider.mockReturnValue({ responses: mocks.responses });
  mocks.stream.mockImplementation(() => ({
    fullStream: (async function* () {
      yield { type: "text-delta", text: "Duas recargas." };
      yield { type: "finish", finishReason: "stop" };
    })(),
  }));
});
it("keeps credentials in server transport and bounds model output without retries", async () => {
  expect(await completeAssistant(messages)).toBe("Duas recargas.");
  expect(mocks.stream.mock.calls[0]![0]).toMatchObject({
    maxOutputTokens: 1000,
    maxRetries: 0,
    instructions: "Use só o resumo.",
  });
  expect(mocks.stream.mock.calls[0]![0].messages).toEqual([messages[1]]);
});
it("fails before upstream when the server key is missing", async () => {
  vi.stubEnv("LOVABLE_API_KEY", "");
  await expect(completeAssistant(messages)).rejects.toThrow("não está configurada");
  expect(mocks.stream).not.toHaveBeenCalled();
});
it("does not echo private keys from provider errors or generated output", async () => {
  mocks.stream.mockReturnValueOnce({
    fullStream: (async function* () {
      yield {
        type: "error",
        error: {
          upstream: true,
          statusCode: 402,
          responseBody: JSON.stringify({ message: "test-private-key" }),
        },
      };
    })(),
  });
  await expect(completeAssistant(messages)).rejects.toThrow("créditos");
  mocks.stream.mockReturnValueOnce({
    fullStream: (async function* () {
      yield { type: "text-delta", text: "test-private-key" };
    })(),
  });
  await expect(completeAssistant(messages)).rejects.toThrow("bloqueada");
});
it("does not turn empty or failed streams into a valid response", async () => {
  mocks.stream.mockReturnValueOnce({
    fullStream: (async function* () {
      yield { type: "finish", finishReason: "stop" };
    })(),
  });
  await expect(completeAssistant(messages)).rejects.toThrow("não retornou");
});
