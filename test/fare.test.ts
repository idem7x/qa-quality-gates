import { describe, expect, it } from 'vitest';
import { quoteFare } from '../src/fare.ts';

describe('quoteFare', () => {
  it('quotes base + percentage and fixed taxes', () => {
    const quote = quoteFare({
      baseMinor: 10_000, // 100.00 EUR
      currency: 'EUR',
      taxes: [
        { code: 'IVA', ratePct: 21 },
        { code: 'YQ', fixedMinor: 1_500 },
      ],
    });
    expect(quote.taxLines).toEqual([
      { code: 'IVA', amount: { amountMinor: 2_100, currency: 'EUR' } },
      { code: 'YQ', amount: { amountMinor: 1_500, currency: 'EUR' } },
    ]);
    expect(quote.total.amountMinor).toBe(13_600);
  });

  it('rounds each tax line independently (per-line rounding convention)', () => {
    // Two 0.5%-ish taxes on 33.33: each rounds up individually.
    const quote = quoteFare({
      baseMinor: 3_333,
      currency: 'EUR',
      taxes: [
        { code: 'T1', ratePct: 1.51 }, // 50.33 -> 50
        { code: 'T2', ratePct: 1.51 },
      ],
    });
    expect(quote.total.amountMinor).toBe(3_333 + 50 + 50);
  });

  it('supports zero taxes', () => {
    const quote = quoteFare({ baseMinor: 5_000, currency: 'USD', taxes: [] });
    expect(quote.total.amountMinor).toBe(5_000);
  });

  it('rejects negative base fares', () => {
    expect(() => quoteFare({ baseMinor: -1, currency: 'EUR', taxes: [] })).toThrow(RangeError);
  });

  it('rejects negative fixed taxes', () => {
    expect(() =>
      quoteFare({ baseMinor: 100, currency: 'EUR', taxes: [{ code: 'X', fixedMinor: -5 }] }),
    ).toThrow(RangeError);
  });

  it('rejects a tax rule with both rate and fixed amount', () => {
    expect(() =>
      quoteFare({
        baseMinor: 100,
        currency: 'EUR',
        taxes: [{ code: 'X', ratePct: 10, fixedMinor: 5 }],
      }),
    ).toThrow(/not both/);
  });
});
