import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ read: vi.fn(), save: vi.fn() }));
vi.mock("./actions", () => ({ getStatusAdmin: mocks.read, saveStatus: mocks.save }));
import { StatusAdmin } from "./admin";
const date = new Date().toISOString();
const keys = ["panel", "auth", "desbanimento", "sms", "social", "prospect_maps", "prospect_cnpj"];
const data = {
  public: {
    generatedAt: date,
    components: keys.map((key) => ({
      key,
      label: key,
      status: "operational",
      source: "automatic",
      message: "",
      checkedAt: date,
    })),
    events: [],
  },
  settings: keys.map((key) => ({
    key,
    label: key,
    automatic: "operational",
    checked_at: date,
    diagnostic: "ok",
    manual: null,
    message: "",
    expires_at: null,
  })),
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.read.mockResolvedValue(data);
  mocks.save.mockResolvedValue({ saved: true });
});
afterEach(cleanup);
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <StatusAdmin adminId="admin" />
    </QueryClientProvider>,
  );
}
it("publishes a notice for only the selected component with an expiry", async () => {
  setup();
  fireEvent.change(await screen.findByLabelText("Serviço"), { target: { value: "sms" } });
  fireEvent.change(screen.getByLabelText("Mensagem para os clientes"), {
    target: { value: "Manutenção programada para SMS" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Publicar aviso" }));
  await waitFor(() => expect(mocks.save).toHaveBeenCalledOnce());
  const saved = mocks.save.mock.calls[0][0].data;
  expect(saved).toMatchObject({
    key: "sms",
    status: "maintenance",
    message: "Manutenção programada para SMS",
  });
  expect(Date.parse(saved.expires)).toBeGreaterThan(Date.now() + 7100000);
  expect(
    await screen.findByText(
      "Aviso salvo. A publicação no Better Stack será confirmada pela sincronização.",
    ),
  ).toBeInTheDocument();
});
it("returning to automatic clears only the public override", async () => {
  setup();
  await screen.findByLabelText("Serviço");
  fireEvent.click(screen.getByRole("button", { name: "Voltar ao automático" }));
  await waitFor(() =>
    expect(mocks.save).toHaveBeenCalledWith({
      data: { key: "panel", status: null, message: "", expires: null },
    }),
  );
  expect(await screen.findByText("Monitoramento automático retomado.")).toBeInTheDocument();
});
