import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { leadKeySchema, followupSchema, statementSchema } from "./model";
export const followupRead = createServerFn({ method: "GET" })
  .inputValidator(leadKeySchema)
  .handler(async ({ data }) => (await import("./server")).readFollowup(data));
export const followupSave = createServerFn({ method: "POST" })
  .inputValidator(followupSchema)
  .handler(async ({ data }) => (await import("./server")).saveFollowup(data));
export const getAgenda = createServerFn({ method: "GET" })
  .inputValidator(z.object({ period: z.enum(["today", "overdue", "week"]) }).strict())
  .handler(async ({ data }) => (await import("./server")).agenda(data.period));
export const getActivities = createServerFn({ method: "GET" }).handler(async () =>
  (await import("./server")).activities(),
);
export const markActivities = createServerFn({ method: "POST" })
  .inputValidator(z.object({ keys: z.array(z.string().max(100)).max(50) }).strict())
  .handler(async ({ data }) => (await import("./server")).markActivities(data.keys));
export const getStatement = createServerFn({ method: "GET" })
  .inputValidator(statementSchema)
  .handler(async ({ data }) => (await import("./server")).statement(data));
