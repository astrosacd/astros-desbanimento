import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  accessSchema,
  collectionSchema,
  configSchema,
  idSchema,
  pageSchema,
  startSchema,
  type Config,
  type Research,
  type Saved,
} from "./model";
const call = async (a: string, d: unknown = {}, admin = false) =>
  (await import("./server")).digitalCall(a, d, admin);
export const digitalConfig = createServerFn({ method: "GET" }).handler(
  async () => (await call("config")) as Config,
);
export const digitalStart = createServerFn({ method: "POST" })
  .inputValidator(startSchema)
  .handler(async ({ data }) => (await call("start", data)) as Research);
export const digitalHistory = createServerFn({ method: "GET" })
  .inputValidator(pageSchema)
  .handler(async ({ data }) => (await call("history", data)) as { rows: Research[] });
export const digitalStatus = createServerFn({ method: "GET" })
  .inputValidator(idSchema)
  .handler(async ({ data }) => (await call("status", data)) as Research);
export const digitalRefresh = createServerFn({ method: "POST" })
  .inputValidator(idSchema)
  .handler(async ({ data }) => (await call("refresh", data)) as Research);
export const digitalSave = createServerFn({ method: "POST" })
  .inputValidator(collectionSchema)
  .handler(async ({ data }) => call("save", data));
export const digitalUnsave = createServerFn({ method: "POST" })
  .inputValidator(idSchema)
  .handler(async ({ data }) => call("unsave", data));
export const digitalCollections = createServerFn({ method: "GET" })
  .inputValidator(pageSchema)
  .handler(async ({ data }) => (await call("collections", data)) as { rows: Saved[] });
export const digitalAdminConfig = createServerFn({ method: "GET" }).handler(
  async () => (await call("admin-config", {}, true)) as Config,
);
export const digitalAdminSave = createServerFn({ method: "POST" })
  .inputValidator(configSchema)
  .handler(async ({ data }) => call("admin-save", data, true));
export const digitalAdminAccess = createServerFn({ method: "POST" })
  .inputValidator(accessSchema)
  .handler(async ({ data }) => call("admin-access", data, true));
export const digitalAdminHistory = createServerFn({ method: "GET" })
  .inputValidator(pageSchema)
  .handler(async ({ data }) => (await call("admin-history", data, true)) as { rows: Research[] });
export const digitalAdminRefresh = createServerFn({ method: "POST" })
  .inputValidator(idSchema)
  .handler(async ({ data }) => (await call("admin-refresh", data, true)) as Research);
export const digitalAdminStatus = createServerFn({ method: "GET" })
  .inputValidator(idSchema)
  .handler(async ({ data }) => (await call("admin-status", data, true)) as Research);
export const usageSchema = z.object({
  reservedUsdCents: z.number(),
  pending: z.number(),
  review: z.number(),
  reservedCents: z.number(),
  chargedCents: z.number(),
  delivered: z.number(),
  requests: z.number(),
});
export const digitalAdminUsage = createServerFn({ method: "GET" }).handler(async () =>
  usageSchema.parse(await call("admin-usage", {}, true)),
);
export const digitalAdminAccessByEmail = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({ email: z.string().trim().email().max(254), enabled: z.boolean() }).strict(),
  )
  .handler(async ({ data }) => (await import("./server")).accessByEmail(data));
