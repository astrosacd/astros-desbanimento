import { z } from "zod";
export const targetSchema = z.object({ clientId: z.string().uuid() }).strict();
export const deleteSchema = targetSchema
  .extend({
    previewId: z.string().uuid(),
    email: z.string().email().max(254),
    password: z.string().min(1).max(256),
    acknowledgeBalance: z.boolean(),
    acknowledgeExternal: z.literal(true),
  })
  .strict();
export const previewSchema = z.object({
  clientId: z.string().uuid(),
  email: z.string().email(),
  name: z.string(),
  balanceCents: z.number().int().safe(),
  records: z.array(z.object({ table: z.string(), count: z.number().int().nonnegative() })),
  blockers: z.array(z.string()),
  previewId: z.string().uuid(),
  expiresAt: z.string().datetime({ offset: true }),
});
export type DeletionPreview = z.infer<typeof previewSchema>;
export const receiptSchema = z.object({
  success: z.literal(true),
  repeated: z.boolean(),
  removed: z.array(z.object({ table: z.string(), count: z.number().int().nonnegative() })),
});
