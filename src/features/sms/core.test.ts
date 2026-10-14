import {describe,it,expect} from 'vitest';
import {units,saleCents,parseActivation,stateFromCheck} from '../../../supabase/functions/astros-sms/index';
describe('SMS sale calculation and provider evidence',()=>{
 it('converts provider decimals exactly without accepting exponent or negative values',()=>{expect(units('0.24')).toBe(240000);expect(units('5.5000',4)).toBe(55000);for(const v of ['-1','1e3','NaN','','0.1234567'])expect(()=>units(v)).toThrow();});
 it('rounds sale up to cents including configured margin and fee',()=>{expect(saleCents(240000,55000,3000,0)).toBe(172);expect(saleCents(240000,55000,3000,50)).toBe(222);expect(saleCents(10000000,55000,2000,0)).toBe(6600);expect(saleCents(1,55000,0,0)).toBe(1);});
 it('blocks zero FX, bad margins and sale overflow',()=>{expect(()=>saleCents(100,0,0,0)).toThrow();expect(()=>saleCents(100,10000,-1,0)).toThrow();expect(()=>saleCents(1000000000000,10000000,100000,0)).toThrow();});
 it('requires durable provider ID, phone and expiration for a successful purchase',()=>{expect(parseActivation({success:1,order_id:'ABC123',number:14155552671,expiration:1900000000,cost:'0.24'}).phone).toBe('14155552671');for(const v of [{success:1},{success:0},{success:1,order_id:'ABC',number:'not-a-number'}])expect(()=>parseActivation(v)).toThrow();});
 it('only credits a refund when status 6 confirms it',()=>{expect(stateFromCheck({status:6})).toBe('refunded');expect(stateFromCheck({status:2})).toBe('review');expect(stateFromCheck({status:5})).toBe('review');expect(stateFromCheck({status:3,sms:''})).toBe('review');expect(stateFromCheck({status:3,sms:'123456'})).toBe('received');expect(stateFromCheck({status:1})).toBe('pending');});
});
