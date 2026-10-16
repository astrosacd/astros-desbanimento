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
it("sends plain text rather than Markdown to the speech engine", async () => {
  Element.prototype.scrollIntoView = vi.fn();
  const speak = vi.fn(),
    cancel = vi.fn();
  vi.stubGlobal("speechSynthesis", { speak, cancel, getVoices: () => [] });
  vi.stubGlobal(
    "SpeechSynthesisUtterance",
    class {
      text: string;
      constructor(text: string) {
        this.text = text;
      }
    },
  );
  vi.mocked(askAssistant).mockResolvedValueOnce({
    text: "Hoje **16/10/2026**: **R$ 10,00**.",
    from: "2026-10-16",
    until: "2026-10-16",
    generatedAt: "2026-10-16T20:00:00Z",
    sources: [],
  });
  render(<AssistantAdmin />);
  fireEvent.click(screen.getByRole("button", { name: "Ativar resposta por voz" }));
  fireEvent.change(screen.getByLabelText("Sua pergunta para a ASTRA"), {
    target: { value: "Quanto entrou hoje?" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Enviar" }));
  await waitFor(() => expect(speak).toHaveBeenCalledTimes(1));
  const utterance = speak.mock.calls[0]![0];
  expect(utterance.text).not.toContain("*");
  expect(utterance.text).toContain("16 de outubro de 2026");
  expect(utterance.text).toContain("10,00 reais");
  cleanup();
  vi.unstubAllGlobals();
});
