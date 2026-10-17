const audioMock = vi.hoisted(() => ({ play: vi.fn().mockResolvedValue(true) }));
vi.mock("./audio-player", () => ({
  NaturalVoicePlayer: class {
    unlock = vi.fn().mockResolvedValue(undefined);
    stop = vi.fn();
    close = vi.fn();
    play = audioMock.play;
  },
}));
import { it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
vi.mock("./face", () => ({ AssistantFace: () => <div>Rosto digital</div> }));
vi.mock("./actions", () => ({
  askAssistant: vi.fn().mockResolvedValue({
    text: "Entraram duas recargas.",
    from: "2026-10-16",
    until: "2026-10-16",
    generatedAt: "2026-10-16T20:00:00Z",
    sources: [{ name: "Supabase", available: true }],
  }),
}));
import { AssistantAdmin } from "./page";
import { askAssistant } from "./actions";
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
it("does not query on mount, sends only on request and prevents double submission", async () => {
  Element.prototype.scrollIntoView = vi.fn();
  render(<AssistantAdmin />);
  expect(askAssistant).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("Sua pergunta para a ASTRA"), {
    target: { value: "Quem pagou hoje?" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Enviar" }));
  fireEvent.click(screen.getByRole("button", { name: /Consultando/ }));
  await screen.findByText("Entraram duas recargas.");
  expect(askAssistant).toHaveBeenCalledTimes(1);
  expect(screen.getByText(/Consulta:/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Limpar conversa" }));
  expect(screen.queryByText("Entraram duas recargas.")).toBeNull();
});
it("keeps failed questions editable without a fabricated answer", async () => {
  Element.prototype.scrollIntoView = vi.fn();
  vi.mocked(askAssistant).mockRejectedValueOnce(Error("Fonte indisponível"));
  render(<AssistantAdmin />);
  fireEvent.change(screen.getByLabelText("Sua pergunta para a ASTRA"), {
    target: { value: "Resumo de hoje" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Enviar" }));
  await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Fonte indisponível"));
  expect(screen.getByLabelText("Sua pergunta para a ASTRA")).toHaveValue("Resumo de hoje");
});
it("requests and plays natural audio without the browser speech engine", async () => {
  Element.prototype.scrollIntoView = vi.fn();
  const naturalAudio = {
    base64: "fixture",
    mimeType: "audio/wav" as const,
    spokenText: "Hoje, dez reais.",
    shortened: false,
  };
  vi.mocked(askAssistant).mockResolvedValueOnce({
    text: "Hoje **R$ 10,00**.",
    from: "2026-10-16",
    until: "2026-10-16",
    generatedAt: "2026-10-16T20:00:00Z",
    sources: [],
    naturalAudio,
  });
  render(<AssistantAdmin />);
  fireEvent.click(screen.getByRole("button", { name: "Ativar resposta por voz" }));
  fireEvent.change(screen.getByLabelText("Sua pergunta para a ASTRA"), {
    target: { value: "Quanto entrou hoje?" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Enviar" }));
  await waitFor(() => expect(audioMock.play).toHaveBeenCalledTimes(1));
  expect(askAssistant).toHaveBeenCalledWith({
    data: expect.objectContaining({ voiceRequested: true }),
  });
  expect(audioMock.play.mock.calls[0]![0]).toEqual(naturalAudio);
});
it("keeps the written answer visible if natural voice is unavailable", async () => {
  Element.prototype.scrollIntoView = vi.fn();
  vi.mocked(askAssistant).mockResolvedValueOnce({
    text: "Nenhuma recarga hoje.",
    from: "2026-10-16",
    until: "2026-10-16",
    generatedAt: "2026-10-16T20:00:00Z",
    sources: [],
    voiceError: "Créditos de voz indisponíveis.",
  });
  render(<AssistantAdmin />);
  fireEvent.click(screen.getByRole("button", { name: "Ativar resposta por voz" }));
  fireEvent.change(screen.getByLabelText("Sua pergunta para a ASTRA"), {
    target: { value: "Resumo" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Enviar" }));
  await screen.findByText("Nenhuma recarga hoje.");
  expect(screen.getByRole("alert").textContent).toContain("Créditos de voz");
});

it("sends a reported error with its module and screen and can clear the context", async () => {
  Element.prototype.scrollIntoView = vi.fn();
  render(<AssistantAdmin />);
  fireEvent.change(screen.getByLabelText("Módulo"), { target: { value: "sms" } });
  fireEvent.change(screen.getByLabelText("Tela onde aconteceu"), {
    target: { value: "Comprar número" },
  });
  fireEvent.change(screen.getByLabelText("Mensagem do erro"), {
    target: { value: "BALANCE_ERROR api_key=private-key" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Analisar erro" }));
  await waitFor(() => expect(askAssistant).toHaveBeenCalledTimes(1));
  const data = vi.mocked(askAssistant).mock.calls[0]![0].data;
  expect(data.reportedError).toMatchObject({ module: "sms", screen: "Comprar número" });
  expect(JSON.stringify(data)).not.toContain("private-key");
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Limpar contexto" })).not.toBeDisabled(),
  );
  fireEvent.click(screen.getByRole("button", { name: "Limpar contexto" }));
  expect(screen.getByLabelText("Mensagem do erro")).toHaveValue("");
});
