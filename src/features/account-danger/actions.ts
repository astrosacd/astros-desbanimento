import { createServerFn } from "@tanstack/react-start";
import { targetSchema, deleteSchema } from "./model";
export const deletionAccess = createServerFn({ method: "GET" }).handler(async () =>
  (await import("./server")).access(),
);
export const previewDeletion = createServerFn({ method: "POST" })
  .inputValidator(targetSchema)
  .handler(async ({ data }) => (await import("./server")).preview(data));
export const executeDeletion = createServerFn({ method: "POST" })
  .inputValidator(deleteSchema)
  .handler(async ({ data }) => (await import("./server")).execute(data));
