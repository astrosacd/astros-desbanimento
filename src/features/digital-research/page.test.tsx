import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within, cleanup, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
const api = vi.hoisted(() => ({
  config: vi.fn(),
  start: vi.fn(),
  history: vi.fn(),
  collections: vi.fn(),
  status: vi.fn(),
  refresh: vi.fn(),
  save: vi.fn(),
  unsave: vi.fn(),
}));
vi.mock("./actions", () => ({
  digitalConfig: api.config,
  digitalStart: api.start,
  digitalHistory: api.history,
  digitalCollections: api.collections,
  digitalStatus: api.status,
  digitalRefresh: api.refresh,
  digitalSave: api.save,
  digitalUnsave: api.unsave,
}));
vi.mock("../payments/balance-summary", () => ({
  BalanceSummary: () => <div>Carteira compartilhada</div>,
}));
import { DigitalResearchPage } from "./page";
const id = "22222222-2222-4222-8222-222222222222";
const defaults = {
  installed: true,
  enabled: true,
  version: 1,
  tools: {
    instagram_search: { enabled: true, unitCents: 10, maxQuantity: 20, maxUsdCents: 20 },
    instagram_profile: { enabled: true, unitCents: 10, maxQuantity: 10, maxUsdCents: 20 },
    instagram_followers: { enabled: true, unitCents: 10, maxQuantity: 50, maxUsdCents: 20 },
  },
};
beforeEach(() => {
  vi.resetAllMocks();
  api.config.mockResolvedValue(defaults);
  api.history.mockResolvedValue({ rows: [] });
  api.collections.mockResolvedValue({ rows: [] });
  api.start.mockResolvedValue({
    id,
    tool: "instagram_search",
    query: "dentistas",
    quantity: 10,
    state: "running",
    reserved_cents: 100,
    charged_cents: 0,
    delivered: 0,
    created_at: new Date().toISOString(),
    rows: [],
  });
});
afterEach(cleanup);
const show = () =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
        })
      }
    >
      <DigitalResearchPage userId="own-user" />
    </QueryClientProvider>,
  );
async function prepare() {
  show();
  await waitFor(() =>
    expect(screen.getAllByRole("button", { name: /Usar ferramenta/ })[0]).not.toBeDisabled(),
  );
  fireEvent.click(screen.getAllByRole("button", { name: /Usar ferramenta/ })[0]!);
  fireEvent.change(screen.getByLabelText("Palavra-chave"), { target: { value: "dentistas" } });
  fireEvent.click(screen.getByRole("button", { name: "Conferir e continuar" }));
}
it("opening a module only reads configuration and does not run or poll a provider", async () => {
  show();
  await screen.findByText("Buscar perfis");
  expect(api.start).not.toHaveBeenCalled();
  expect(api.refresh).not.toHaveBeenCalled();
  expect(api.history).not.toHaveBeenCalled();
  expect(api.collections).not.toHaveBeenCalled();
});
it("requires a price confirmation and blocks rapid double submission", async () => {
  await prepare();
  expect(api.start).not.toHaveBeenCalled();
  const modal = screen.getByRole("dialog");
  expect(within(modal).getByText("R$ 1,00")).toBeTruthy();
  const button = within(modal).getByRole("button", { name: "Confirmar e pesquisar" });
  fireEvent.click(button);
  fireEvent.click(button);
  await waitFor(() => expect(api.start).toHaveBeenCalledTimes(1));
  expect(api.start.mock.calls[0][0].data).toMatchObject({
    tool: "instagram_search",
    query: "dentistas",
    quantity: 10,
    unitCents: 10,
    version: 1,
  });
});
it("keeps the exact same request and input when the response is lost", async () => {
  api.start.mockRejectedValueOnce(Error("Resposta perdida"));
  await prepare();
  fireEvent.click(
    within(screen.getByRole("dialog")).getByRole("button", { name: "Confirmar e pesquisar" }),
  );
  await screen.findByText("Resposta perdida");
  const first = api.start.mock.calls[0][0].data;
  fireEvent.click(screen.getByRole("button", { name: "Conferir a mesma tentativa" }));
  await waitFor(() => expect(api.start).toHaveBeenCalledTimes(2));
  expect(api.start.mock.calls[1][0].data).toEqual(first);
});
it("missing optional backend disables starts while keeping navigation accessible", async () => {
  api.config.mockResolvedValue({ installed: false, enabled: false, version: 1, tools: {} });
  show();
  await screen.findByText(/As ferramentas estão em preparação/);
  for (const button of screen.getAllByRole("button", { name: /Usar ferramenta/ }))
    expect(button).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Minhas pesquisas" }));
  await screen.findByText("Você ainda não tem pesquisas nesta página.");
  expect(api.start).not.toHaveBeenCalled();
});
it("validates a single keyword before creating any reservation", async () => {
  show();
  await waitFor(() =>
    expect(screen.getAllByRole("button", { name: /Usar ferramenta/ })[0]).not.toBeDisabled(),
  );
  fireEvent.click(screen.getAllByRole("button", { name: /Usar ferramenta/ })[0]!);
  fireEvent.change(screen.getByLabelText("Palavra-chave"), { target: { value: "a,b" } });
  fireEvent.click(screen.getByRole("button", { name: "Conferir e continuar" }));
  await screen.findByText("Informe uma única palavra-chave ou expressão.");
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(api.start).not.toHaveBeenCalled();
});

it("history refresh stays read-only; explicit check retrieves the original run once", async () => {
  const row = {
    id,
    tool: "instagram_profile",
    query: "example",
    quantity: 1,
    state: "running",
    reserved_cents: 1,
    charged_cents: 0,
    delivered: 0,
    created_at: new Date().toISOString(),
    rows: [],
  };
  api.history.mockResolvedValue({ rows: [row] });
  api.refresh.mockResolvedValue({ ...row, state: "completed", delivered: 1, charged_cents: 1 });
  show();
  fireEvent.click(screen.getByRole("button", { name: "Minhas pesquisas" }));
  await screen.findByText("example");
  fireEvent.click(screen.getByRole("button", { name: "Atualizar lista" }));
  await waitFor(() => expect(api.history).toHaveBeenCalledTimes(2));
  expect(api.refresh).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Conferir andamento" }));
  await waitFor(() => expect(api.refresh).toHaveBeenCalledTimes(1));
  expect(api.refresh).toHaveBeenCalledWith({ data: { id } });
  expect(api.start).not.toHaveBeenCalled();
  expect(await screen.findByRole("dialog")).toHaveTextContent("Concluída");
});
