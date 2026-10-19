import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {brazilStates,brazilCities} from '../../../supabase/functions/astros-prospecting/geography';
const f=vi.fn();beforeEach(()=>{vi.stubGlobal('fetch',f);f.mockReset();});afterEach(()=>vi.unstubAllGlobals());
it('loads only the chosen official state, validates rows and caches a successful response',async()=>{
 f.mockResolvedValue(new Response(JSON.stringify([{'municipio-id':2304400,'municipio-nome':'Fortaleza','UF-sigla':'CE'}])));
 expect(brazilStates).toHaveLength(27);expect(brazilStates.find(s=>s.id==='CE')?.name).toBe('Ceará');expect(await brazilCities('CE')).toEqual([{id:'2304400',name:'Fortaleza'}]);expect(await brazilCities('CE')).toHaveLength(1);expect(f).toHaveBeenCalledOnce();expect(String(f.mock.calls[0]![0])).toBe('https://servicodados.ibge.gov.br/api/v1/localidades/estados/CE/municipios?view=nivelado&orderBy=nome');expect(f.mock.calls[0]![1].headers.Authorization).toBeUndefined();
});
it('does not accept arbitrary locations or mismatched supplier states',async()=>{await expect(brazilCities('../private')).rejects.toThrow();expect(f).not.toHaveBeenCalled();f.mockResolvedValue(new Response(JSON.stringify([{'municipio-id':1,'municipio-nome':'Outra cidade','UF-sigla':'CE'}])));await expect(brazilCities('SP')).rejects.toThrow();});
it('does not cache a failed city lookup as an empty list',async()=>{f.mockRejectedValueOnce(Error('network')).mockResolvedValueOnce(new Response(JSON.stringify([{'municipio-id':3304557,'municipio-nome':'Rio de Janeiro','UF-sigla':'RJ'}])));await expect(brazilCities('RJ')).rejects.toThrow();expect(await brazilCities('RJ')).toEqual([{id:'3304557',name:'Rio de Janeiro'}]);expect(f).toHaveBeenCalledTimes(2);});
