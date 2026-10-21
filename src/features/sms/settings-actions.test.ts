import {afterEach,it,expect,vi} from 'vitest';
const {call}=vi.hoisted(()=>({call:vi.fn()}));
vi.mock('./server',()=>({smsCall:call}));
vi.mock('@tanstack/react-start',()=>({createServerFn:()=>{let schema:any;const chain={inputValidator:(value:any)=>{schema=value;return chain;},handler:(fn:any)=>(input:any={})=>fn({data:schema?schema.parse(input.data):input.data})};return chain;}}));
import {smsSaveSettings,smsProviderBalance,smsFiveCatalog,smsFiveOffers} from './actions';
afterEach(()=>vi.clearAllMocks());
const pricing={apiKey:'',usdBrlUnits:55000,marginBps:5000,feeCents:0,fxMode:'manual',depositBps:325,conversionBps:400,extraBps:0,fixedUsdUnits:250000,depositUsdUnits:10000000};
it.each([true,false])('saving SMSPool pricing preserves live availability %s and ignores stale browser availability',async enabled=>{call.mockResolvedValueOnce({enabled}).mockResolvedValueOnce({success:true});await smsSaveSettings({data:{...pricing,enabled:!enabled} as any});expect(call.mock.calls).toEqual([['admin-settings',{},true],['save-settings',{...pricing,enabled},true]]);});
it('does not save if the current availability is unconfirmed',async()=>{call.mockResolvedValueOnce({});await expect(smsSaveSettings({data:pricing as any})).rejects.toThrow('Atualize');expect(call).toHaveBeenCalledTimes(1);});
it.each(['smspool','five_sim'] as const)('independent %s balance uses verified admin call with an explicit supplier',async supplier=>{call.mockResolvedValueOnce({balanceUnits:100,currency:supplier==='smspool'?'USD':'5SIM'});await smsProviderBalance({data:{supplier}});expect(call).toHaveBeenCalledWith('admin-balance',{supplier},true);});

it('both 5SIM inspection calls remain admin-only and never use a buy action',async()=>{call.mockResolvedValue({});await smsFiveCatalog();await smsFiveOffers({data:{serviceId:'whatsapp',countryId:'brazil'}});expect(call.mock.calls).toEqual([['admin-five-catalog',{},true],['admin-five-offers',{serviceId:'whatsapp',countryId:'brazil'},true]]);});
