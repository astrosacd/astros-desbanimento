import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
export const getAdminSession = createServerFn({ method: 'GET' }).handler(async () => {
  const { getSession } = await import('./auth.server'); return getSession();
});
export const loginAdmin = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ email: z.string().trim().email().max(254), password: z.string().min(1).max(256) }))
  .handler(async ({ data }) => { const { signIn } = await import('./auth.server'); return signIn(data.email, data.password); });
export const logoutAdmin = createServerFn({ method: 'POST' }).handler(async () => {
  const { signOut } = await import('./auth.server'); return signOut();
});
