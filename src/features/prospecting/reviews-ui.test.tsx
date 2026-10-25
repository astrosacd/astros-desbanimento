import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LeadReviews, ReviewsAdmin } from "./reviews";
import type { Lead } from "./types";
const mock = vi.hoisted(() => ({
  read: vi.fn(),
  consult: vi.fn(),
  config: vi.fn(),
  save: vi.fn(),
}));
vi.mock("./actions", () => ({
  reviewsRead: mock.read,
  reviewsConsult: mock.consult,
  reviewsAdminConfig: mock.config,
  reviewsAdminSave: mock.save,
}));
const lead = {
  id: "00000000-0000-4000-8000-000000000001",
  snapshot: { name: "Company", source: "maps" },
} as Lead;
const empty = { installed: true, enabled: true, eligible: true, request: { state: "none" } };
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
  mock.read.mockResolvedValue(empty);
  mock.config.mockResolvedValue({
    installed: true,
    enabled: false,
    dailyCalls: 5,
    userDaily: 2,
    reserveCalls: 10,
  });
  vi.stubGlobal("crypto", { randomUUID: () => "00000000-0000-4000-8000-000000000002" });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("never loads the complement for CNPJ", () => {
  mount(
    <LeadReviews
      lead={{ ...lead, snapshot: { ...lead.snapshot, source: "cnpj" } }}
      userId="owner"
    />,
  );
  expect(mock.read).not.toHaveBeenCalled();
  expect(mock.consult).not.toHaveBeenCalled();
});
it("opening is read-only; only explicit click dispatches with stable reference", async () => {
  mock.consult.mockRejectedValue(Error("Incerto"));
  mount(<LeadReviews lead={lead} userId="owner" />);
  const button = await screen.findByRole("button", { name: "Consultar avaliações" });
  expect(mock.consult).not.toHaveBeenCalled();
  fireEvent.click(button);
  await screen.findByRole("alert");
  fireEvent.click(button);
  await waitFor(() => expect(mock.consult).toHaveBeenCalledTimes(2));
  expect(mock.consult.mock.calls[0][0]).toEqual(mock.consult.mock.calls[1][0]);
});
it("missing SQL hides only the additional section", async () => {
  mock.read.mockResolvedValue({ installed: false, enabled: false, request: { state: "none" } });
  mount(
    <>
      <p>Dados originais</p>
      <LeadReviews lead={lead} userId="owner" />
    </>,
  );
  await waitFor(() => expect(screen.queryByText(/Conferindo complemento/)).toBeNull());
  expect(screen.getByText("Dados originais")).toBeInTheDocument();
  expect(screen.queryByText("Avaliações no Google")).toBeNull();
});
it("saved empty sample is explicit and refresh reads without another consultation", async () => {
  mock.read.mockResolvedValue({
    ...empty,
    request: {
      state: "completed",
      requestedAt: new Date().toISOString(),
      result: {
        name: "Company",
        rating: null,
        total: 0,
        reviews: [],
        queriedAt: new Date().toISOString(),
        url: "https://www.google.com/maps",
      },
    },
  });
  mount(<LeadReviews lead={lead} userId="owner" />);
  await screen.findByText("Nenhuma avaliação do Google disponível nesta resposta.");
  expect(screen.getByRole("button", { name: "Consultar avaliações" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Atualizar avaliações salvas" }));
  await waitFor(() => expect(mock.read).toHaveBeenCalledTimes(2));
  expect(mock.consult).not.toHaveBeenCalled();
});
it("admin begins disabled and saving does not trigger a provider consultation", async () => {
  mock.save.mockResolvedValue({ saved: true });
  mount(<ReviewsAdmin adminId="admin" />);
  expect(
    await screen.findByRole("checkbox", { name: "Liberar consulta de avaliações" }),
  ).not.toBeChecked();
  fireEvent.click(screen.getByRole("button", { name: "Salvar configuração de avaliações" }));
  await waitFor(() =>
    expect(mock.save).toHaveBeenCalledWith({
      data: { enabled: false, dailyCalls: 5, userDaily: 2, reserveCalls: 10 },
    }),
  );
  expect(mock.consult).not.toHaveBeenCalled();
});
