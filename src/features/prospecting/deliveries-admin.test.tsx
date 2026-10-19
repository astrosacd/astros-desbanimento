import { it, afterEach, expect, vi } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
const api = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock("./actions", () => ({ prospectAdminDeliveries: api.read }));
import { ProspectDeliveriesAdmin } from "./deliveries-admin";
const id = "00000000-0000-4000-8000-000000000001";
const data = {
  summary: { deliveries: 1, accounts: 1, businesses: 1, requests: 1 },
  hasMore: false,
  asOf: "2026-10-19T13:00:00Z",
  deliveries: [
    {
      id: "delivery-1",
      createdAt: "2026-10-19T12:00:00Z",
      stage: "contacted",
      client: { id: "owner", name: "Cliente Ana", email: "ana@example.com" },
      request: {
        id,
        state: "completed",
        unitCents: 10,
        quantity: 5,
        delivered: 5,
        chargedCents: 50,
        niche: "dentistas",
        city: "fortaleza",
        country: "BR",
      },
      snapshot: {
        id: "pid:1",
        name: "Nome entregue originalmente",
        phone: "85999999999",
        address: "Rua Exemplo, 10",
        website: "",
        websiteStatus: "missing",
        websiteReason: "Sem site na coleta",
        collectedAt: "2026-10-19T11:00:00Z",
        siteEmails: ["contato@empresa.com.br"],
      },
    },
  ],
};
function mount(requestId = "") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(
    <QueryClientProvider client={client}>
      <div className="prospect-page">
        <ProspectDeliveriesAdmin
          adminId="admin"
          scope={{ queryId: "", businessId: "", label: "Todas", email: "", requestId }}
          onBack={vi.fn()}
        />
      </div>
    </QueryClientProvider>,
  );
  return client;
}
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
it("shows recipients and exactly what was delivered, with the original snapshot in the dialog", async () => {
  api.read.mockResolvedValue(data);
  mount();
  await screen.findByText("Cliente Ana");
  expect(screen.getByText("ana@example.com")).toBeTruthy();
  expect(screen.getByText("Nome entregue originalmente")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Ver dados entregues" }));
  const dialog = screen.getByRole("dialog");
  expect(within(dialog).getByText("Rua Exemplo, 10")).toBeTruthy();
  expect(within(dialog).getByText(/Total da busca: R\$ 0,50/)).toBeTruthy();
  expect(within(dialog).getByRole("link", { name: /contato@empresa.com.br/ })).toBeTruthy();
});
it("applies a search reference on the initial request and lets the admin filter by recipient and company", async () => {
  api.read.mockResolvedValue(data);
  mount(id);
  await screen.findByText("Cliente Ana");
  expect(api.read).toHaveBeenLastCalledWith({
    data: { email: "", company: "", requestId: id, queryId: "", businessId: "", page: 0 },
  });
  fireEvent.change(screen.getByLabelText("E-mail do destinatário"), {
    target: { value: "ana@example.com" },
  });
  fireEvent.change(screen.getByLabelText("Empresa entregue"), {
    target: { value: "Nome entregue" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Pesquisar entregas" }));
  await screen.findByText("Cliente Ana");
  expect(api.read).toHaveBeenLastCalledWith({
    data: {
      email: "ana@example.com",
      company: "Nome entregue",
      requestId: id,
      queryId: "",
      businessId: "",
      page: 0,
    },
  });
});
it("does not convert a failed read into fake empty counts", async () => {
  api.read.mockRejectedValue(Error("Instalação pendente"));
  mount();
  await screen.findByText("Não foi possível consultar as entregas.");
  expect(screen.queryByText("Nenhuma entrega encontrada para esses filtros.")).toBeNull();
  expect(screen.queryByLabelText("Totais das entregas filtradas")).toBeNull();
});
