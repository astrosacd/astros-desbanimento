import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { InstagramLead, InstagramAdmin } from "./instagram";
import type { Lead } from "./types";
const mock = vi.hoisted(() => ({
  read: vi.fn(),
  consult: vi.fn(),
  config: vi.fn(),
  save: vi.fn(),
}));
vi.mock("./actions", () => ({
  instagramRead: mock.read,
  instagramConsult: mock.consult,
  instagramAdminConfig: mock.config,
  instagramAdminSave: mock.save,
}));
const lead = {
  id: "00000000-0000-4000-8000-000000000001",
  snapshot: { name: "Company", source: "maps" },
} as Lead;
const fresh = { installed: true, enabled: true, candidates: ["acme"], request: { state: "none" } };
function mount(element: React.ReactNode) {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {element}
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  mock.read.mockResolvedValue(fresh);
  mock.config.mockResolvedValue({
    installed: true,
    enabled: false,
    dailyCalls: 20,
    userDaily: 5,
    reserveCalls: 10,
  });
  vi.stubGlobal("crypto", { randomUUID: () => "00000000-0000-4000-8000-000000000002" });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("does not consult provider on opening details; explicit click uses discovered profile", async () => {
  mock.consult.mockResolvedValue({
    ...fresh,
    request: { state: "completed", profileId: "acme", requestedAt: new Date().toISOString() },
  });
  mount(<InstagramLead lead={lead} userId="owner" />);
  const button = await screen.findByRole("button", { name: "Consultar informações do Instagram" });
  expect(mock.consult).not.toHaveBeenCalled();
  fireEvent.click(button);
  await waitFor(() =>
    expect(mock.consult).toHaveBeenCalledWith({
      data: {
        leadId: lead.id,
        source: "maps",
        profileId: "acme",
        requestId: "00000000-0000-4000-8000-000000000002",
      },
    }),
  );
});
it("does not guess a handle when no published profile exists", async () => {
  mock.read.mockResolvedValue({ ...fresh, candidates: [] });
  mount(<InstagramLead lead={lead} userId="owner" />);
  await screen.findByText(/Nenhum link de perfil/);
  expect(screen.queryByRole("button", { name: "Consultar informações do Instagram" })).toBeNull();
  expect(mock.consult).not.toHaveBeenCalled();
});
it("missing SQL stays invisible without disabling original lead content", async () => {
  mock.read.mockResolvedValue({
    installed: false,
    enabled: false,
    candidates: [],
    request: { state: "none" },
  });
  mount(
    <>
      <p>Company original</p>
      <InstagramLead lead={lead} userId="owner" />
    </>,
  );
  await waitFor(() => expect(screen.queryByText(/Conferindo complemento/)).toBeNull());
  expect(screen.getByText("Company original")).toBeInTheDocument();
  expect(screen.queryByText("Instagram · complemento do lead")).toBeNull();
});
it("transport retry keeps stable request ID and refresh only reads saved result", async () => {
  mock.consult.mockRejectedValue(Error("Incerto"));
  mount(<InstagramLead lead={lead} userId="owner" />);
  const button = await screen.findByRole("button", { name: "Consultar informações do Instagram" });
  fireEvent.click(button);
  await screen.findByRole("alert");
  fireEvent.click(button);
  await waitFor(() => expect(mock.consult).toHaveBeenCalledTimes(2));
  expect(mock.consult.mock.calls[0][0].data.requestId).toBe(
    mock.consult.mock.calls[1][0].data.requestId,
  );
});
it("admin starts disabled and saving only changes new configuration", async () => {
  mock.save.mockResolvedValue({ saved: true });
  mount(<InstagramAdmin adminId="admin" />);
  const checkbox = await screen.findByRole("checkbox", {
    name: "Liberar consulta adicional ao Instagram",
  });
  expect(checkbox).not.toBeChecked();
  fireEvent.click(screen.getByRole("button", { name: "Salvar configuração Instagram" }));
  await waitFor(() =>
    expect(mock.save).toHaveBeenCalledWith({
      data: { enabled: false, dailyCalls: 20, userDaily: 5, reserveCalls: 10 },
    }),
  );
  expect(mock.consult).not.toHaveBeenCalled();
});
