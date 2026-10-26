import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
const api = vi.hoisted(() => ({
  followupRead: vi.fn(),
  followupSave: vi.fn(),
  getAgenda: vi.fn(),
  getActivities: vi.fn(),
  markActivities: vi.fn(),
  getStatement: vi.fn(),
}));
vi.mock("./actions", () => api);
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, ...props }: any) => (
    <a
      href={to}
      {...props}
      onClick={(e) => {
        e.preventDefault();
        props.onClick?.(e);
      }}
    >
      {children}
    </a>
  ),
}));
import { LeadFollowup, FollowupAgenda } from "./followups";
import { ActivityFeed, ActivityCount } from "./notifications";
import { StatementExport } from "./statement";
const id = "00000000-0000-4000-8000-000000000001",
  clients: QueryClient[] = [];
function mount(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  clients.push(qc);
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}
beforeEach(() => {
  vi.resetAllMocks();
  api.followupRead.mockResolvedValue({
    installed: true,
    data: { note: "Texto salvo", dueOn: "2026-10-26", done: false, version: 2 },
  });
  api.followupSave.mockResolvedValue({
    note: "Texto novo",
    dueOn: "2026-10-26",
    done: false,
    version: 3,
  });
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((q) => q.clear());
});
it("keeps a dirty draft and sends the saved version instead of overwriting a concurrent change", async () => {
  mount(<LeadFollowup userId="owner" leadId={id} source="cnpj" name="Empresa" />);
  const field = await screen.findByLabelText("Sua anotação");
  fireEvent.change(field, { target: { value: "Texto novo" } });
  api.followupSave.mockRejectedValueOnce(
    Error("Esta anotação foi alterada em outra aba. Recarregue antes de salvar"),
  );
  fireEvent.click(screen.getByRole("button", { name: "Salvar acompanhamento" }));
  await screen.findByRole("button", { name: "Recarregar anotação salva" });
  expect(field).toHaveValue("Texto novo");
  expect(screen.getByRole("button", { name: "Salvar acompanhamento" })).toBeDisabled();
  expect(api.followupSave).toHaveBeenCalledWith({
    data: {
      leadId: id,
      source: "cnpj",
      note: "Texto novo",
      dueOn: "2026-10-26",
      done: false,
      version: 2,
    },
  });
  api.followupRead.mockResolvedValueOnce({
    installed: true,
    data: { note: "Outra aba", dueOn: null, done: true, version: 3 },
  });
  fireEvent.click(screen.getByRole("button", { name: "Recarregar anotação salva" }));
  await waitFor(() => expect(field).toHaveValue("Outra aba"));
});
it("never turns a missing optional installation into fake saved data", async () => {
  api.followupRead.mockResolvedValue({ installed: false });
  mount(<LeadFollowup userId="owner" leadId={id} source="maps" name="Empresa" />);
  await screen.findByText("Anotações e retornos ainda não estão disponíveis.");
  expect(screen.queryByRole("button", { name: "Salvar acompanhamento" })).toBeNull();
  expect(api.followupSave).not.toHaveBeenCalled();
});
it("agenda changes its period and explains an empty real response", async () => {
  api.getAgenda.mockResolvedValue({
    installed: true,
    data: { today: "2026-10-26", total: 0, rows: [] },
  });
  mount(<FollowupAgenda userId="owner" />);
  await screen.findByText(/Nenhum retorno pendente/);
  fireEvent.change(screen.getByLabelText("Mostrar"), { target: { value: "overdue" } });
  await waitFor(() =>
    expect(api.getAgenda).toHaveBeenLastCalledWith({ data: { period: "overdue" } }),
  );
  expect(api.followupSave).not.toHaveBeenCalled();
});
it("shares the unread badge with the feed and closes it on navigation without issuing a purchase", async () => {
  const go = vi.fn();
  let read = false;
  api.getActivities.mockImplementation(async () => ({
    installed: true,
    data: {
      rows: [
        {
          key: "sms:" + id + ":received",
          title: "SMS recebido",
          target: "/ativacoes-sms",
          date: "2026-10-26T12:00:00Z",
          area: "sms",
          read,
        },
      ],
      windowDays: 30,
      limit: 50,
    },
  }));
  api.markActivities.mockImplementation(async () => {
    read = true;
    return { success: true };
  });
  mount(
    <>
      <ActivityCount userId="owner" />
      <ActivityFeed userId="owner" onNavigate={go} />
    </>,
  );
  await screen.findByText("SMS recebido");
  expect(screen.getByLabelText("1 atividades recentes não lidas")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Marcar como lida", exact: true }));
  await waitFor(() =>
    expect(screen.queryByLabelText("1 atividades recentes não lidas")).toBeNull(),
  );
  expect(api.markActivities).toHaveBeenCalledWith({ data: { keys: ["sms:" + id + ":received"] } });
  fireEvent.click(screen.getByRole("link", { name: "Ver histórico" }));
  expect(go).toHaveBeenCalledOnce();
});
it("does not download an empty or failed statement", async () => {
  api.getStatement.mockResolvedValue({
    rows: [],
    from: "2026-10-01",
    until: "2026-10-26",
    timezone: "America/Fortaleza",
  });
  mount(<StatementExport />);
  fireEvent.click(screen.getByRole("button", { name: "Baixar extrato CSV" }));
  await screen.findByText("Nenhuma movimentação neste período.");
  api.getStatement.mockRejectedValueOnce(Error("Escolha um período menor"));
  fireEvent.click(screen.getByRole("button", { name: "Baixar extrato CSV" }));
  await screen.findByText("Escolha um período menor");
});
