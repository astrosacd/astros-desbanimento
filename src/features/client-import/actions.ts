import {createServerFn} from '@tanstack/react-start';
import {validateClient} from './core';
export const importLegacyClient=createServerFn({method:'POST'}).inputValidator(validateClient).handler(async({data})=>(await import('./server')).importClient(data));
