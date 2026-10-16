import { createServerFn } from "@tanstack/react-start";
import { assistantInput } from "./validation";
export const askAssistant = createServerFn({ method: "POST" })
  .inputValidator(assistantInput)
  .handler(async ({ data }) => (await import("./server")).answerAssistant(data));
