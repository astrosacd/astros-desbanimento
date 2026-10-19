import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
const search = z
  .object({
    requestId: z.string().uuid(),
    niche: z.string().trim().min(2).max(80),
    country: z.string().length(2),
    city: z.string().trim().min(2).max(80),
    region: z.string().trim().max(80),
    filter: z.enum(["all", "missing", "social", "online", "offline", "unknown"]),
    quantity: z.number().int().min(1).max(20),
    expectedUnitCents: z.number().int().min(0).max(10000),
  })
  .strict();
export const prospectConfig = createServerFn({ method: "GET" }).handler(async () =>
  (await import("./server")).prospectCall("config"),
);
export const prospectSearch = createServerFn({ method: "POST" })
  .inputValidator(search)
  .handler(async ({ data }) => (await import("./server")).prospectCall("search", data));
export const prospectStatus = createServerFn({ method: "POST" })
  .inputValidator(z.object({ requestId: z.string().uuid() }).strict())
  .handler(async ({ data }) => (await import("./server")).prospectCall("request-status", data));
export const prospectHistory = createServerFn({ method: "POST" })
  .inputValidator(
    z
      .object({
        page: z.number().int().min(0).max(10000),
        search: z.string().trim().max(80),
        status: z.enum(["all", "new", "contacted", "negotiating", "won", "discarded"]),
      })
      .strict(),
  )
  .handler(async ({ data }) => (await import("./server")).prospectCall("history", data));
export const prospectLeadStatus = createServerFn({ method: "POST" })
  .inputValidator(
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["new", "contacted", "negotiating", "won", "discarded"]),
      })
      .strict(),
  )
  .handler(async ({ data }) => (await import("./server")).prospectCall("lead-status", data));
export const prospectRequests = createServerFn({ method: "POST" })
  .inputValidator(z.object({ page: z.number().int().min(0).max(10000) }).strict())
  .handler(async ({ data }) => (await import("./server")).prospectCall("requests", data));
export const prospectAdminConfig = createServerFn({ method: "GET" }).handler(async () =>
  (await import("./server")).prospectCall("admin-config", {}, true),
);
export const prospectAdminSave = createServerFn({ method: "POST" })
  .inputValidator(
    z
      .object({
        enabled: z.boolean(),
        unitCents: z.number().int().min(0).max(10000),
        cacheDays: z.number().int().min(1).max(30),
        dailyRequests: z.number().int().min(1).max(100),
        dailyCalls: z.number().int().min(0).max(1000000),
        apiKey: z.string().trim().max(200),
      })
      .strict(),
  )
  .handler(async ({ data }) => (await import("./server")).prospectCall("admin-save", data, true));
export const prospectAdminAccount = createServerFn({ method: "POST" })
 .inputValidator(z.object({force:z.boolean().default(false)}).strict())
 .handler(async ({data})=>(await import("./server")).prospectCall("admin-account",data,true));
export const prospectAdminRequests = createServerFn({ method: "POST" })
  .inputValidator(z.object({ page: z.number().int().min(0).max(10000) }).strict())
  .handler(async ({ data }) =>
    (await import("./server")).prospectCall("admin-requests", data, true),
  );
