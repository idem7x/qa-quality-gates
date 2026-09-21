import { describe, expect, it } from 'vitest';
import { add, applyRate, decimalsFor, format, money } from '../src/money.ts';

describe('money', () => {
  it('creates integer minor-unit amounts', () => {
    expect(money(1250, 'EUR')).toEqual({ amountMinor: 1250, currency: 'EUR' });
  });

  it('rejects non-integer amounts (no floats for money)', () => {
    expect(() => money(12.5, 'EUR')).toThrow(RangeError);
  });

  it('rejects invalid currency codes', () => {
    expect(() => money(100, 'eur')).toThrow(RangeError);
    expect(() => money(100, 'EURO')).toThrow(RangeError);
  });

  it('adds amounts of the same currency', () => {
    expect(add(money(100, 'EUR'), money(250, 'EUR')).amountMinor).toBe(350);
  });

  it('refuses to add different currencies', () => {
    expect(() => add(money(100, 'EUR'), money(100, 'USD'))).toThrow(/currency mismatch/);
  });

  it('applies a percentage rate with half-up rounding', () => {
    // 10.5% of 33.33 EUR = 349.965 cents -> rounds to 350
    expect(applyRate(money(3333, 'EUR'), 10.5).amountMinor).toBe(350);
  });

  it('rejects negative rates', () => {
    expect(() => applyRate(money(100, 'EUR'), -1)).toThrow(RangeError);
  });

  it('formats zero-decimal currencies correctly', () => {
    expect(decimalsFor('JPY')).toBe(0);
    expect(format(money(1500, 'JPY'))).toBe('1500 JPY');
    expect(format(money(1500, 'EUR'))).toBe('15.00 EUR');
  });
});
