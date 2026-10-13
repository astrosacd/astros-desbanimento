import {cardPaymentSchema,prepareCardSchema} from './card-validation';
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { historySchema } from './history-validation';
import { rechargeSchema, settingsSchema, pricesSchema } from './validation';
export const getWallet = createServerFn({ method: 'GET' }).handler(async () => (await import('./server')).wallet());
export const createRecharge = createServerFn({ method: 'POST' }).inputValidator(rechargeSchema).handler(async ({ data }) => (await import('./server')).clientCall('create', data));
export const checkRecharge = createServerFn({ method: 'POST' }).inputValidator(z.object({ orderId: z.string().uuid() }).strict()).handler(async ({ data }) => (await import('./server')).clientCall('check', data));
export const getPaymentSettings = createServerFn({ method: 'GET' }).handler(async () => (await import('./server')).adminCall('settings'));
export const savePaymentSettings = createServerFn({ method: 'POST' }).inputValidator(settingsSchema).handler(async ({ data }) => (await import('./server')).adminCall('save-settings', data));

export const getPaymentPrices = createServerFn({ method: 'GET' }).handler(async () => (await import('./server')).prices());
export const getPaymentHistory = createServerFn({ method: 'GET' }).inputValidator(historySchema).handler(async ({ data }) => (await import('./history.server')).paymentHistory(data));

export const getAdminPrices=createServerFn({method:'GET'}).handler(async()=>(await import('./server')).adminPrices());
export const saveAdminPrices=createServerFn({method:'POST'}).inputValidator(pricesSchema).handler(async({data})=>(await import('./server')).savePrices(data));

export const getCardConfiguration=createServerFn({method:'GET'}).handler(async()=>(await import('./server')).clientCall('card-config',{}));
export const prepareCardRecharge=createServerFn({method:'POST'}).inputValidator(prepareCardSchema).handler(async({data})=>(await import('./server')).clientCall('prepare-card',data));
export const payCardRecharge=createServerFn({method:'POST'}).inputValidator(cardPaymentSchema).handler(async({data})=>(await import('./server')).clientCall('pay-card',data));
