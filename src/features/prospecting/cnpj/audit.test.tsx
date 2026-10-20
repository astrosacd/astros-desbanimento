import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
const api = vi.hoisted(() => ({ audit: vi.fn(), config: vi.fn() }));
vi.mock("../actions", () => ({ cnpjAdminAudit: api.audit, cnpjConfig: api.config }));
import { CnpjAudit } from "./audit";
const item = {
  id: "business",
  snapshot: {
    id: "cnpj:11222333000181",
    source: "cnpj",
    cnpj: "11222333000181",
    name: "Empresa exemplo",
    phone: "85933334444",
    address: "Rua Exemplo",
  },
  deliveryCount: 2,
  client: { name: "Cliente exemplo", email: "cliente@example.test" },
  requestId: "request",
  createdAt: "2026-10-20T18:00:00Z",
  stage: "new",
};
function mount(props = {}) {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <CnpjAudit adminId="admin" {...props} />
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  api.audit.mockResolvedValue({ items: [item], total: 21, hasMore: true });
});
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
it("reads the selected research, filters formatted CNPJ and paginates without provider searches", async () => {
  mount({ requestId: "selected-request" });
  await screen.findByText("Empresa exemplo");
  expect(api.audit).toHaveBeenLastCalledWith({
    data: expect.objectContaining({ requestId: "selected-request", view: "businesses", page: 0 }),
  });
  fireEvent.change(screen.getByLabelText("Empresa ou CNPJ"), {
    target: { value: "11.222.333/0001-81" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Pesquisar" }));
  await waitFor(() =>
    expect(api.audit).toHaveBeenLastCalledWith({
      data: expect.objectContaining({ search: "11222333000181", page: 0 }),
    }),
  );
  fireEvent.click(await screen.findByRole("button", { name: "Próxima" }));
  await waitFor(() =>
    expect(api.audit).toHaveBeenLastCalledWith({ data: expect.objectContaining({ page: 1 }) }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Ver entregas", exact: true }));
  await screen.findByText(/cliente@example.test/);
  expect(api.audit).toHaveBeenLastCalledWith({
    data: expect.objectContaining({ view: "deliveries", page: 0, requestId: "selected-request" }),
  });
});
it("opens read-only business details without a customer refresh, quota read or editable stage", async () => {
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "Ver dados da empresa" }));
  expect(await screen.findByRole("dialog")).toHaveTextContent("Razão social");
  expect(screen.queryByRole("button", { name: "Atualizar dados cadastrais" })).toBeNull();
  expect(api.config).not.toHaveBeenCalled();
});
it("keeps filters visible and reports a failed audit without fake empty results", async () => {
  api.audit.mockRejectedValue(Error("unavailable"));
  mount();
  expect(await screen.findByRole("alert")).toHaveTextContent("SQL CNPJ");
  expect(screen.queryByText("Nenhum registro encontrado para estes filtros.")).toBeNull();
});
