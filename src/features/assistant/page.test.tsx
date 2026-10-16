import { it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
vi.mock("./face", () => ({ AssistantFace: () => <div>Rosto digital</div> }));
vi.mock("./actions", () => ({
  askAssistant: vi
    .fn()
    .mockResolvedValue({
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
