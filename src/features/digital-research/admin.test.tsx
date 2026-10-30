import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
const api = vi.hoisted(() => ({ usage: vi.fn() }));
vi.mock("./actions", () => ({ digitalAdminUsage: api.usage }));
import { Settings, Usage } from "./admin";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
const config = {
  installed: true,
  enabled: true,
  version: 1,
  pilot: true,
  tools: {
    instagram_search: { enabled: false, unitCents: 0, maxQuantity: 20, maxUsdCents: 20 },
    instagram_profile: { enabled: true, unitCents: 0, maxQuantity: 1, maxUsdCents: 20 },
    instagram_followers: { enabled: false, unitCents: 0, maxQuantity: 50, maxUsdCents: 30 },
  },
};
afterEach(cleanup);
it("shows invalid-price feedback next to save without sending configuration", () => {
  const save = vi.fn();
  render(<Settings config={config} busy={false} saveError="" message="" onSave={save} />);
  const button = screen.getByRole("button", { name: "Salvar configuração" });
  fireEvent.click(button);
  expect(within(button.parentElement!).getByRole("alert")).toHaveTextContent(
    "preço maior que zero",
  );
  expect(save).not.toHaveBeenCalled();
});
it("keeps remote errors and confirmed success beside save; blocks while saving", () => {
  const props = {
    config,
    busy: false,
    saveError: "Configuração alterada.",
    message: "",
    onSave: vi.fn(),
  };
  const { rerender } = render(<Settings {...props} />);
  const button = screen.getByRole("button", { name: "Salvar configuração" });
  expect(within(button.parentElement!).getByRole("alert")).toHaveTextContent(
    "Configuração alterada.",
  );
  rerender(<Settings {...props} saveError="" message="Configuração salva." />);
  expect(within(button.parentElement!).getByRole("status")).toHaveTextContent(
    "Configuração salva.",
  );
  rerender(<Settings {...props} saveError="" busy />);
  expect(screen.getByRole("button", { name: "Salvando…" })).toBeDisabled();
});

it("explains shared budget, per-run limits, currency units and pilot rules next to inputs", () => {
  render(<Settings config={config} busy={false} saveError="" message="" onSave={vi.fn()} />);
  expect(screen.getByRole("group", { name: "2. Limites da plataforma" })).toHaveTextContent(
    "mesmo que as execuções custem menos",
  );
  expect(screen.getByRole("group", { name: "1. Acesso e integração" })).toHaveTextContent(
    "o piloto estiver ativo",
  );
  expect(
    screen.getByRole("group", { name: "Consultar perfis e contatos públicos" }),
  ).toHaveTextContent("100 = R$ 1,00");
});

it("requires an explicit block/allow choice for the exact account and resets that choice when the email changes", () => {
  api.usage.mockResolvedValue({
    reservedUsdCents: 0,
    pending: 0,
    review: 0,
    reservedCents: 0,
    chargedCents: 0,
    delivered: 0,
  });
  const apply = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <Usage adminId="admin" busy={false} feedbackError="" feedbackMessage="" onAccess={apply} />
    </QueryClientProvider>,
  );
  const button = screen.getByRole("button", { name: "Aplicar ao cliente" });
  expect(button).toBeDisabled();
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "cliente@example.com" } });
  expect(button).toBeDisabled();
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "block" } });
  fireEvent.click(button);
  expect(apply).toHaveBeenCalledExactlyOnceWith("cliente@example.com", false);
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "allow" } });
  fireEvent.click(button);
  expect(apply).toHaveBeenLastCalledWith("cliente@example.com", true);
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "outro@example.com" } });
  expect(button).toBeDisabled();
});
