import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { emailSchema, passwordSchema, loginSchema, signupSchema, profileSchema } from './validation';
export const getClientSession = createServerFn({ method: 'GET' }).handler(async () => (await import('./session.server')).currentClient());
export const loginClient = createServerFn({ method: 'POST' }).inputValidator(loginSchema).handler(async ({ data }) => (await import('./session.server')).login(data));
export const signupClient = createServerFn({ method: 'POST' }).inputValidator(signupSchema).handler(async ({ data }) => (await import('./session.server')).signup(data));
export const recoverClient = createServerFn({ method: 'POST' }).inputValidator(z.object({ email: emailSchema })).handler(async ({ data }) => (await import('./session.server')).recover(data.email));
export const resetClient = createServerFn({ method: 'POST' }).inputValidator(z.object({ token: z.string().min(1).max(8192), password: passwordSchema })).handler(async ({ data }) => (await import('./session.server')).reset(data));
export const logoutClient = createServerFn({ method: 'POST' }).handler(async () => (await import('./session.server')).logout());

export const updateClientProfile = createServerFn({ method: 'POST' }).inputValidator(profileSchema).handler(async ({ data }) => (await import('./profile.server')).updateProfile(data));

export const getSignupProtection = createServerFn({ method: 'GET' }).handler(async () => (await import('./signup-protection.server')).signupProtectionConfig());
