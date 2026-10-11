import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { rechargeSchema, settingsSchema } from './validation';
export const getWallet = createServerFn({ method: 'GET' }).handler(async () => (await import('./server')).wallet());
export const createRecharge = createServerFn({ method: 'POST' }).inputValidator(rechargeSchema).handler(async ({ data }) => (await import('./server')).clientCall('create', data));
export const checkRecharge = createServerFn({ method: 'POST' }).inputValidator(z.object({ orderId: z.string().uuid() }).strict()).handler(async ({ data }) => (await import('./server')).clientCall('check', data));
export const getPaymentSettings = createServerFn({ method: 'GET' }).handler(async () => (await import('./server')).adminCall('settings'));
export const savePaymentSettings = createServerFn({ method: 'POST' }).inputValidator(settingsSchema).handler(async ({ data }) => (await import('./server')).adminCall('save-settings', data));

export const getPaymentPrices = createServerFn({ method: 'GET' }).handler(async () => (await import('./server')).prices());
