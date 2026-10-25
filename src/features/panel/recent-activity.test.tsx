import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
const api = vi.hoisted(() => ({
  submissions: vi.fn(),
  sms: vi.fn(),
  social: vi.fn(),
  maps: vi.fn(),
  cnpj: vi.fn(),
  wallet: vi.fn(),
}));
vi.mock("@tanstack/react-router", () => ({
  useRouteContext: () => ({ client: { id: "own-account" } }),
  Link: ({ children, to, ...props }: any) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("../submissions/actions", () => ({ getSubmissionHistory: api.submissions }));
vi.mock("../sms/actions", () => ({ smsHistory: api.sms }));
vi.mock("../social/actions", () => ({ socialHistory: api.social }));
vi.mock("../prospecting/actions", () => ({ prospectRequests: api.maps, cnpjHistory: api.cnpj }));
vi.mock("../payments/actions", () => ({ getWallet: api.wallet }));
import { RecentActivity } from "./recent-activity";
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(
    <QueryClientProvider client={client}>
      <RecentActivity />
    </QueryClientProvider>,
  );
  return client;
}
beforeEach(() => {
  vi.resetAllMocks();
  api.submissions.mockResolvedValue([]);
  api.sms.mockResolvedValue({ orders: [] });
  api.social.mockResolvedValue({ orders: [] });
  api.maps.mockResolvedValue({ requests: [] });
  api.cnpj.mockResolvedValue({ requests: [] });
  api.wallet.mockResolvedValue({ movements: [] });
});
afterEach(cleanup);
it("shows real order states, filters by module and projects out SMS codes and phone numbers", async () => {
  api.sms.mockResolvedValue({
    orders: [
      {
        id: "sms-1",
        service: "WhatsApp Brasil",
        state: "pending",
        createdAt: "2026-10-25T12:00:00Z",
        code: "SECRET-CODE",
        phone: "PRIVATE-PHONE",
      },
    ],
  });
  api.social.mockResolvedValue({
    orders: [
      {
        id: "social-1",
        title: "Visualizações Instagram",
        state: "completed",
        createdAt: "2026-10-25T11:00:00Z",
      },
    ],
  });
  const client = mount();
  expect(await screen.findByText("WhatsApp Brasil")).toBeTruthy();
  expect(screen.getByText("Aguardando SMS")).toBeTruthy();
  expect(await screen.findByText("Visualizações Instagram")).toBeTruthy();
  const cached = client.getQueryData(["home-orders", "own-account", "sms"]);
  expect(JSON.stringify(cached)).not.toContain("SECRET-CODE");
  expect(JSON.stringify(cached)).not.toContain("PRIVATE-PHONE");
  fireEvent.change(screen.getByLabelText("Filtrar por área"), { target: { value: "social" } });
  expect(screen.queryByText("WhatsApp Brasil")).toBeNull();
  expect(screen.getByRole("link", { name: "Acompanhar Visualizações Instagram" })).toHaveAttribute(
    "href",
    "/redes-sociais",
  );
});
it("retains successful modules and reports a partial history failure rather than claiming an empty account", async () => {
  api.sms.mockRejectedValue(Error("private supplier error"));
  api.maps.mockResolvedValue({
    requests: [
      {
        id: "maps-1",
        state: "queued",
        created_at: "2026-10-25T10:00:00Z",
        criteria: { niche: "Clínicas" },
      },
    ],
  });
  mount();
  expect(await screen.findByText("Maps · Clínicas")).toBeTruthy();
  await waitFor(() => expect(screen.getByText(/Parte do histórico/)).toBeTruthy());
  expect(screen.getByText("Na fila")).toBeTruthy();
  expect(screen.queryByText("private supplier error")).toBeNull();
});
it("links each wallet activity to the wallet without presenting a debit as a completed order", async () => {
  api.wallet.mockResolvedValue({
    movements: [
      {
        id: "movement-1",
        kind: "credit",
        reference: "affiliate:one",
        amount_cents: 30,
        created_at: "2026-10-25T10:00:00Z",
      },
    ],
  });
  mount();
  expect(await screen.findByText("Comissão de indicação")).toBeTruthy();
  expect(screen.getByText(/\+R\$\s*0,30/)).toBeTruthy();
  expect(screen.getByRole("link", { name: "Ver carteira completa" })).toHaveAttribute(
    "href",
    "/carteira",
  );
});
