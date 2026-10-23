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
it("saves incident progress, impact and next update in Brasília time", async () => {
  mocks.read.mockResolvedValue({
    ...data,
    settings: data.settings.map((s) => ({
      ...s,
      notice_phase: "investigating",
      impact: "",
      next_update: null,
      starts_at: null,
    })),
  });
  setup();
  fireEvent.change(await screen.findByLabelText("Serviço"), { target: { value: "sms" } });
  fireEvent.change(screen.getByLabelText("Status público"), { target: { value: "unavailable" } });
  fireEvent.change(screen.getByLabelText("Andamento do incidente"), {
    target: { value: "identified" },
  });
  fireEvent.change(screen.getByLabelText("Mensagem para os clientes"), {
    target: { value: "Estamos corrigindo a conexão." },
  });
  fireEvent.change(screen.getByLabelText("Impacto para o cliente"), {
    target: { value: "Novas ativações indisponíveis." },
  });
  fireEvent.change(screen.getByLabelText("Próxima atualização — horário de Brasília (opcional)"), {
    target: { value: "2099-01-01T12:00" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Publicar aviso" }));
  await waitFor(() => expect(mocks.save).toHaveBeenCalledOnce());
  expect(mocks.save.mock.calls[0][0].data.details).toEqual({
    phase: "identified",
    impact: "Novas ativações indisponíveis.",
    startsAt: null,
    nextUpdate: "2099-01-01T15:00:00.000Z",
  });
});
it("validates the future maintenance window before saving", async () => {
  mocks.read.mockResolvedValue({
    ...data,
    settings: data.settings.map((s) => ({
      ...s,
      notice_phase: "investigating",
      impact: "",
      next_update: null,
      starts_at: null,
    })),
  });
  setup();
  fireEvent.change(await screen.findByLabelText("Serviço"), { target: { value: "sms" } });
  fireEvent.change(screen.getByLabelText("Mensagem para os clientes"), {
    target: { value: "Manutenção programada." },
  });
  fireEvent.click(screen.getByLabelText("Agendar para uma data futura"));
  fireEvent.change(screen.getByLabelText("Início da manutenção — Brasília"), {
    target: { value: "2099-01-01T14:00" },
  });
  fireEvent.change(screen.getByLabelText("Término previsto — Brasília"), {
    target: { value: "2099-01-01T13:00" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Publicar aviso" }));
  expect(await screen.findByText(/Informe uma manutenção com início futuro/)).toBeInTheDocument();
  expect(mocks.save).not.toHaveBeenCalled();
});
