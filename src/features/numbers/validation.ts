import { z } from 'zod';
export const listSchema = z.object({ page: z.number().int().min(1).max(100000).default(1) }).strict();
