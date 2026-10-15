import {createServerFn} from '@tanstack/react-start';
import {financialFilter} from './validation';
export const getFinancialReport=createServerFn({method:'GET'}).inputValidator(financialFilter).handler(async({data})=>(await import('./server')).financialDashboard(data));
