import { expect, it } from 'vitest';
import { accountCount } from './account-display';
it('distinguishes actual zero, supplier values and missing data', () => {
  expect(accountCount(0)).toBe('0');
  expect(accountCount(250)).toBe('250');
  for (const value of [undefined, null, '', '50', -1, NaN, 1.5]) {
    expect(accountCount(value)).toBe('Não informado');
  }
});
