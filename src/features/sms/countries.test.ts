import {it,expect} from 'vitest';
import {countryIso,countryOptions} from './countries';
it('normaliza ISO e nomes sem alterar o ID do fornecedor',()=>{expect(countryIso(' br ')).toBe('BR');expect(countryIso('../br')).toBeNull();const rows=countryOptions([{id:68,name:'Brazil',iso:'br'},{id:1,name:'United States',iso:'US'}]);expect(rows[0]).toEqual({id:68,name:'Brasil',iso:'BR'});expect(rows[1]?.name).toBe('Estados Unidos');});
it('preserva países sem sigla válida',()=>{expect(countryOptions([{id:9,name:'País adicional'}])).toEqual([{id:9,name:'País adicional'}]);});
