import { createServerFn } from "@tanstack/react-start";
import { saveSchema } from "./model";
export const getStatusAdmin = createServerFn({ method: "GET" }).handler(async () =>
  (await import("./server")).readStatusAdmin(),
);
export const saveStatus = createServerFn({ method: "POST" })
  .inputValidator(saveSchema)
  .handler(async ({ data }) => (await import("./server")).writeStatus(data));
