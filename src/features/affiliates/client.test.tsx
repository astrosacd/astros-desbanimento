import { render, screen, cleanup } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import type { AffiliateOverview } from "./validation";
vi.mock("./actions", () => ({ getAffiliation: vi.fn(), getAdminAffiliation: vi.fn() }));
import { AffiliateHistory } from "./client";
beforeEach(cleanup);
it("explains confirmed refunds, protected referral identity and exact pending adjustment to the affiliate", () => {
  const data = {
    events: [
      {
        id: "event",
        kind: "refund",
        amountCents: 1000,
        rechargeCents: 10000,
        refundedCents: 10000,
        rateBps: 1000,
        afterCents: -1000,
        createdAt: "2026-10-24T12:00:00Z",
        orderId: "order-reference",
        referredLabel: "Indicado abc12345",
      },
    ],
  } as AffiliateOverview;
  render(<AffiliateHistory data={data} />);
  expect(screen.getByText("Comissão estornada — reembolso confirmado")).toBeTruthy();
  expect(screen.getByText(/Indicado abc12345: a recarga/)).toBeTruthy();
  expect(screen.getByText(/Ajuste pendente após este lançamento/)).toBeTruthy();
  expect(screen.getByText("order-reference")).toBeTruthy();
});
it("compensation history never presents a new charge or a cash withdrawal", () => {
  const data = {
    events: [
      {
        id: "comp",
        kind: "compensation",
        amountCents: 1000,
        createdAt: "2026-10-24T12:00:00Z",
        orderId: null,
      },
    ],
  } as AffiliateOverview;
  render(<AffiliateHistory data={data} />);
  expect(screen.getByText(/Não houve cobrança adicional/)).toBeTruthy();
  expect(screen.getByText("Ajuste compensado com crédito na carteira")).toBeTruthy();
});
