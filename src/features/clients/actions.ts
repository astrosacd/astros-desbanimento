import {createServerFn} from '@tanstack/react-start';
import {clientSearchSchema,clientCreditSchema,creditHistorySchema} from './validation';
export const findClients=createServerFn({method:'GET'}).inputValidator(clientSearchSchema).handler(async({data})=>(await import('./server')).searchClients(data));
export const addClientCredit=createServerFn({method:'POST'}).inputValidator(clientCreditSchema).handler(async({data})=>(await import('./server')).creditClient(data));
export const getCreditHistory=createServerFn({method:'GET'}).inputValidator(creditHistorySchema).handler(async({data})=>(await import('./server')).creditHistory(data));
