import { createServerFn } from '@tanstack/react-start';
import { listSchema } from './validation';
export const listNumbers = createServerFn({ method: 'GET' }).inputValidator(listSchema).handler(async ({ data }) => (await import('./numbers.server')).listOwnNumbers(data));
export const exportNumbers = createServerFn({ method: 'POST' }).handler(async () => (await import('./export.server')).exportOwnNumbers());
