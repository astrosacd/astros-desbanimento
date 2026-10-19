import { afterEach, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
const api = vi.hoisted(() => ({ report: vi.fn() }));
vi.mock("./actions", () => ({ prospectAdminBase: api.report }));
import { ProspectBaseAdmin } from "./base-admin";
const query = {
  id: "a".repeat(32),
  niche: "dentistas",
  city: "Fortaleza",
  region: "CE",
  country: "BR",
  saved: 20,
  fresh: 20,
  deliveries: 5,
  neverDelivered: 15,
  accountDelivered: 5,
  accountAvailable: 15,
  lastSeen: "2026-10-19T12:00:00Z",
};
const data = {
  totals: { businesses: 20, queries: 1, deliveries: 5, accounts: 1 },
  queries: [query],
  queryCount: 1,
  queryHasMore: false,
  businesses: [
    {
      id: "pid:1",
      name: "Empresa Teste",
      phone: "85999999999",
      website: "",
      websiteStatus: "missing",
      lastSeen: "2026-10-19T12:00:00Z",
      fresh: true,
      deliveries: 0,
      deliveredToAccount: false,
    },
  ],
  businessCount: 20,
  businessHasMore: false,
  target: { id: "owner", name: "Conta Teste", email: "test@example.com" },
  targetRequested: true,
  cacheDays: 7,
  asOf: "2026-10-19T12:00:00Z",
};
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(
    <QueryClientProvider client={client}>
      <ProspectBaseAdmin adminId="admin" />
    </QueryClientProvider>,
  );
  return client;
}
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
it("shows inventory and per-account remainder, opens saved businesses, and sends applied filters", async () => {
  api.report.mockImplementation(async ({ data: input }) => ({
    ...data,
    target: input.email ? data.target : null,
    targetRequested: !!input.email,
  }));
  mount();
  await screen.findByText("dentistas");
  fireEvent.change(screen.getByLabelText("E-mail da conta (opcional)"), {
    target: { value: "test@example.com" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Consultar base" }));
  await screen.findByText("Conta em análise: Conta Teste");
  expect(screen.getByText("Válidas e ainda não entregues à conta")).toBeTruthy();
  expect(api.report).toHaveBeenLastCalledWith({
    data: { search: "", email: "test@example.com", page: 0, queryId: "", businessPage: 0 },
  });
  fireEvent.click(screen.getByRole("button", { name: "Ver empresas salvas" }));
  await screen.findByText("Empresa Teste");
  expect(screen.getByText("Ainda não entregue à conta selecionada")).toBeTruthy();
  expect(api.report).toHaveBeenLastCalledWith({
    data: { search: "", email: "test@example.com", page: 0, queryId: query.id, businessPage: 0 },
  });
});
it("does not manufacture zeros or individual availability when installation fails", async () => {
  api.report.mockRejectedValue(Error("SQL indisponível"));
  mount();
  await screen.findByText("Não foi possível consultar a base.");
  expect(screen.queryByText("Empresas únicas salvas")).toBeNull();
  expect(screen.queryByText("0")).toBeNull();
});
