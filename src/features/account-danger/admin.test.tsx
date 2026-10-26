import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
const api = vi.hoisted(() => ({
  deletionAccess: vi.fn(),
  previewDeletion: vi.fn(),
  executeDeletion: vi.fn(),
}));
vi.mock("./actions", () => api);
import { AccountDanger } from "./admin";
const clientId = "00000000-0000-4000-8000-000000000002",
  adminId = "00000000-0000-4000-8000-000000000001";
let clients: QueryClient[] = [];
const deleted = vi.fn(),
  busy = vi.fn();
function mount(role = "cliente") {
  const q = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  clients.push(q);
  return render(
    <QueryClientProvider client={q}>
      <AccountDanger
        adminId={adminId}
        clientId={clientId}
        email="duplicate@example.com"
        role={role}
        onBusy={busy}
        onDeleted={deleted}
      />
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  vi.resetAllMocks();
  api.deletionAccess.mockResolvedValue({ allowed: true });
  api.previewDeletion.mockResolvedValue({
    clientId,
    email: "duplicate@example.com",
    name: "Conta",
    balanceCents: 1442,
    records: [{ table: "backup_desbanimento", count: 12 }],
    blockers: [],
    previewId: "10000000-0000-4000-8000-000000000001",
    expiresAt: "2026-10-26T23:00:00Z",
  });
  api.executeDeletion.mockResolvedValue({ success: true, repeated: false, removed: [] });
});
afterEach(() => {
  cleanup();
  for (const q of clients) q.clear();
  clients = [];
});
async function inspect() {
  fireEvent.click(await screen.findByRole("button", { name: "Conferir conta antes de excluir" }));
  await screen.findByRole("button", { name: "Continuar com a exclusão" });
}
async function confirm() {
  await inspect();
  fireEvent.click(screen.getByRole("button", { name: "Continuar com a exclusão" }));
  fireEvent.click(screen.getByLabelText(/Já resolvi o destino/));
  fireEvent.click(screen.getByLabelText(/Conferi os vínculos externos/));
  fireEvent.change(screen.getByLabelText("Digite exatamente o e-mail da conta"), {
    target: { value: "duplicate@example.com" },
  });
  fireEvent.change(screen.getByLabelText("Sua senha de proprietário"), {
    target: { value: "password" },
  });
}
it("never previews or deletes on mount", async () => {
  mount();
  await screen.findByRole("button", { name: "Conferir conta antes de excluir" });
  expect(api.previewDeletion).not.toHaveBeenCalled();
  expect(api.executeDeletion).not.toHaveBeenCalled();
});
it("does not offer deletion to employees", async () => {
  api.deletionAccess.mockResolvedValue({ allowed: false });
  mount();
  await screen.findByText(/restrita ao proprietário/);
  expect(
    screen.queryByRole("button", { name: "Conferir conta antes de excluir" }),
  ).not.toBeInTheDocument();
});
it("shows blockers and no destructive continuation", async () => {
  api.previewDeletion.mockResolvedValueOnce({
    clientId,
    email: "duplicate@example.com",
    name: "Conta",
    balanceCents: 0,
    records: [],
    blockers: ["Há ativação SMS pendente."],
    previewId: "10000000-0000-4000-8000-000000000001",
    expiresAt: "2026-10-26T23:00:00Z",
  });
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "Conferir conta antes de excluir" }));
  await screen.findByText("Há ativação SMS pendente.");
  expect(
    screen.queryByRole("button", { name: "Continuar com a exclusão" }),
  ).not.toBeInTheDocument();
});
it("requires exact email, balance disposition, external acknowledgement and password", async () => {
  mount();
  await inspect();
  fireEvent.click(screen.getByRole("button", { name: "Continuar com a exclusão" }));
  expect(screen.getByRole("button", { name: "Excluir permanentemente" })).toBeDisabled();
  expect(api.executeDeletion).not.toHaveBeenCalled();
});
it("submits one stable preview and clears password after use", async () => {
  mount();
  await confirm();
  fireEvent.click(screen.getByRole("button", { name: "Excluir permanentemente" }));
  await waitFor(() => expect(deleted).toHaveBeenCalledOnce());
  expect(api.executeDeletion.mock.calls[0]![0].data).toMatchObject({
    clientId,
    previewId: "10000000-0000-4000-8000-000000000001",
    password: "password",
    acknowledgeBalance: true,
    acknowledgeExternal: true,
  });
});
it("an uncertain request retains its reference, clears password and permits safe same-ticket recovery", async () => {
  api.executeDeletion.mockRejectedValueOnce(Error("Resultado não confirmado."));
  mount();
  await confirm();
  fireEvent.click(screen.getByRole("button", { name: "Excluir permanentemente" }));
  await screen.findByText("Resultado não confirmado.");
  expect(deleted).not.toHaveBeenCalled();
  expect(screen.getByLabelText("Sua senha de proprietário")).toHaveValue("");
  fireEvent.change(screen.getByLabelText("Sua senha de proprietário"), {
    target: { value: "password-again" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Conferir mesma exclusão" }));
  await waitFor(() => expect(deleted).toHaveBeenCalledOnce());
  expect(api.executeDeletion.mock.calls[0]![0].data.previewId).toBe(
    api.executeDeletion.mock.calls[1]![0].data.previewId,
  );
});
