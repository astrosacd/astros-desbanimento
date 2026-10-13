import { expect, it } from 'vitest';
import { rechargeSchema } from './validation';
const input={amountCents:1000,method:'pix',requestId:'00000000-0000-4000-8000-000000000000',cpf:'52998224725'};
it('rejects fractional cents, negative values and identity overrides',()=>{for(const change of [{amountCents:1.5},{amountCents:-100},{userId:'other'},{amountCents:1000001}])expect(rechargeSchema.safeParse({...input,...change}).success).toBe(false);});
it('accepts a bounded recharge with a unique request reference',()=>expect(rechargeSchema.parse(input)).toEqual(input));
