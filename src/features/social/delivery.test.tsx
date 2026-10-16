import {it,expect} from 'vitest';
import {deliveryFacts} from './delivery';
it('uses only delivery lines actually supplied, without inventing site metrics',()=>{expect(deliveryFacts('Start: 0-60 min\nSpeed: 1k/hour\nDrop: 20%')).toEqual({start:'Start: 0-60 min',speed:'Speed: 1k/hour',drop:'Drop: 20%'});expect(deliveryFacts('Brazil quality')).toEqual({start:undefined,speed:undefined,drop:undefined});});
