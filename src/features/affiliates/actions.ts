import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { affiliateRules, affiliateAccount, affiliateQuery } from "./validation";
export const getAffiliation = createServerFn({ method: "GET" })
  .inputValidator(affiliateQuery)
  .handler(async ({ data }) => (await import("./server")).overview(data, false));
export const getAdminAffiliation = createServerFn({ method: "GET" })
  .inputValidator(affiliateQuery)
  .handler(async ({ data }) => (await import("./server")).overview(data, true));
export const getAffiliateSettings = createServerFn({ method: "GET" }).handler(async () =>
  (await import("./server")).settings(),
);
export const saveAffiliateSettings = createServerFn({ method: "POST" })
  .inputValidator(affiliateRules)
  .handler(async ({ data }) => (await import("./server")).saveSettings(data));
export const saveAffiliateAccount = createServerFn({ method: "POST" })
  .inputValidator(affiliateAccount)
  .handler(async ({ data }) => (await import("./server")).saveAccount(data));
export const runAffiliates = createServerFn({ method: "POST" }).handler(async () =>
  (await import("./server")).runWorker(),
);
export const rememberAffiliate = createServerFn({ method: "POST" })
  .inputValidator(z.object({ code: z.string().regex(/^[a-f0-9]{32}$/) }))
  .handler(async ({ data }) => (await import("./referral.server")).remember(data.code));
