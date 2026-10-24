import { z } from "zod";
const cents = z.number().int().min(0).max(1000000);
export const affiliateRules = z
  .object({
    enabled: z.boolean(),
    rateBps: z.number().int().min(0).max(10000),
    minimumCents: cents,
    maximumCents: cents,
  })
  .strict()
  .refine(
    (v) => v.maximumCents === 0 || v.maximumCents >= v.minimumCents,
    "O máximo deve ser zero (sem teto) ou maior ou igual ao mínimo.",
  );
export const affiliateAccount = z
  .object({
    userId: z.string().uuid(),
    customRateBps: z.number().int().min(0).max(10000).nullable(),
  })
  .strict();
export const affiliateQuery = z.object({
  userId: z.string().uuid().optional(),
  page: z.number().int().min(1).max(100000).default(1),
});
export type AffiliateOverview = {
  enabled: boolean;
  code: string;
  rateBps: number;
  customRateBps: number | null;
  globalRateBps: number;
  minimumCents: number;
  maximumCents: number;
  workerAt: string | null;
  pendingCount: number;
  referrals: number;
  payingReferrals: number;
  earnedCents: number;
  reversedCents: number;
  availableCents: number;
  adjustmentCents: number;
  origin: string;
  hasMore: boolean;
  events: Array<{
    id: string;
    kind: "commission" | "refund" | "compensation";
    amountCents: number;
    orderId: string | null;
    rechargeCents: number | null;
    refundedCents: number | null;
    rateBps: number | null;
    beforeCents: number;
    afterCents: number;
    createdAt: string;
    referredLabel: string | null;
  }>;
};
export type AffiliateSettings = {
  enabled: boolean;
  rateBps: number;
  minimumCents: number;
  maximumCents: number;
  workerAt: string | null;
  pendingCount: number;
  errorCount: number;
};
export const money = (c: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(c / 100);
export const percent = (bps: number) =>
  new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(bps / 100) + "%";
export function decimalUnits(value: string) {
  const n = Number(value.replace(",", "."));
  const units = Math.round(n * 100);
  if (!value.trim() || !Number.isFinite(n) || Math.abs(n * 100 - units) > 0.00001)
    throw Error("Use números com até duas casas decimais.");
  return units;
}
