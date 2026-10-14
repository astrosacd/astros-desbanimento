import {createServerFn} from '@tanstack/react-start';
import {addressSchema} from './validation';
export const getPanelAddress=createServerFn({method:'GET'}).handler(async()=>(await import('./server')).readAddress());
export const setPanelAddress=createServerFn({method:'POST'}).inputValidator(addressSchema).handler(async({data})=>(await import('./server')).saveAddress(data));
