import {expect,it} from 'vitest';
import {fiveConversionFromOffer} from './five-conversion';
it('calibrates different native price scales to the same real cost without assuming dollars',()=>{expect(fiveConversionFromOffer('10','2')).toBe(2000);expect(fiveConversionFromOffer('0.1','2')).toBe(200000);expect(fiveConversionFromOffer('100','2')).toBe(200);});
it('rounds upward exactly and accepts comma decimals',()=>{expect(fiveConversionFromOffer('78','5,50')).toBe(706);expect(fiveConversionFromOffer('0.3','0.1')).toBe(3334);});
it.each([['0','2'],['10','0'],['10','-1'],['$10','2'],['1e3','2'],['10',''],['0.000001','9999999'],['1','0.1234567']])('rejects invalid or unsupported conversion %s/%s',(api,brl)=>expect(()=>fiveConversionFromOffer(api,brl)).toThrow());
