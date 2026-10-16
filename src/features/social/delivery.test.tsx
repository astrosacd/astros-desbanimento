import {it,expect} from 'vitest';
import {deliveryFacts,deliveryOverview} from './delivery';
it('uses only delivery lines actually supplied, without inventing site metrics',()=>{expect(deliveryFacts('Start: 0-60 min\nSpeed: 1k/hour\nDrop: 20%')).toEqual({start:'Start: 0-60 min',speed:'Speed: 1k/hour',drop:'Drop: 20%'});expect(deliveryFacts('Brazil quality')).toEqual({start:undefined,speed:undefined,drop:undefined});});

it('preserves supplier metrics exactly and leaves absent analytics undefined',()=>{expect(deliveryOverview('Start: 60 min',{start_time:'~9m',speed:'100-200/day',reliability:'Low',drop_rate:'N/A',small_order_time:'10 min'})).toEqual({start:'~9m',speed:'100-200/day',drop:'N/A',reliability:'Low',small:'10 min',average:undefined,large:undefined});});
