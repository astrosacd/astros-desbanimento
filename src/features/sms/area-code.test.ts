import {describe,it,expect} from 'vitest';
import {availableAreas,selectedArea} from '../../../supabase/functions/astros-sms';
describe('DDD da ativação',()=>{
 it('explica recusa real de suporte sem confundir com falta de estoque',()=>{expect(()=>availableAreas({success:0,message:'Custom areacodes is not supported for this pool.'})).toThrow('Esta oferta não permite escolher o DDD');});
 it('mantém escolha opcional e valida dois dígitos',()=>{expect(selectedArea(undefined)).toBe('');expect(selectedArea('85')).toBe('85');for(const v of ['5585','0','+85','01'])expect(()=>selectedArea(v)).toThrow();});
 it('aceita apenas lista explícita e não inventa suporte',()=>{expect(availableAreas([85,'11',85])).toEqual(['85','11']);expect(availableAreas({areacodes:['49']})).toEqual(['49']);for(const v of [{success:0},null,{85:10},[{code:85}],['<script>']])expect(()=>availableAreas(v)).toThrow();});
});
