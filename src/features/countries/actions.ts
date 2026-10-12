import {z} from 'zod';
import {createServerFn} from '@tanstack/react-start';
import {countrySchema} from './validation';
export const getClientCountries=createServerFn({method:'GET'}).handler(async()=>(await import('./server')).listCountries());
export const getAdminCountries=createServerFn({method:'GET'}).handler(async()=>(await import('./server')).listCountries(true));
export const updateCountry=createServerFn({method:'POST'}).inputValidator(countrySchema).handler(async({data})=>(await import('./server')).saveCountry(data));
export const removeCountry=createServerFn({method:'POST'}).inputValidator(z.object({id:z.string().uuid()}).strict()).handler(async({data})=>(await import('./server')).deleteCountry(data.id));
