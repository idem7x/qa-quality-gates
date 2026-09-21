// All monetary amounts are integers in minor units (cents). Floating point
// is never used for money — a classic source of fare/tax drift.

const ZERO_DECIMAL_CURRENCIES = new Set(['JPY', 'KRW', 'VND', 'CLP']);

export interface Money {
  amountMinor: number;
  currency: string;
}

export function money(amountMinor: number, currency: string): Money {
  if (!Number.isSafeInteger(amountMinor)) {
    throw new RangeError(`amount must be an integer in minor units, got ${amountMinor}`);
  }
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new RangeError(`invalid ISO 4217 currency: ${currency}`);
  }
  return { amountMinor, currency };
}

export function add(a: Money, b: Money): Money {
  if (a.currency !== b.currency) {
    throw new Error(`currency mismatch: ${a.currency} vs ${b.currency}`);
  }
  return money(a.amountMinor + b.amountMinor, a.currency);
}

/** Apply a percentage rate, rounding half-up on minor units (tax convention). */
export function applyRate(base: Money, ratePct: number): Money {
  if (!Number.isFinite(ratePct) || ratePct < 0) {
    throw new RangeError(`rate must be a non-negative number, got ${ratePct}`);
  }
  const raw = (base.amountMinor * ratePct) / 100;
  return money(Math.round(raw), base.currency);
}

export function decimalsFor(currency: string): number {
  return ZERO_DECIMAL_CURRENCIES.has(currency) ? 0 : 2;
}

export function format(m: Money): string {
  const decimals = decimalsFor(m.currency);
  const major = m.amountMinor / 10 ** decimals;
  return `${major.toFixed(decimals)} ${m.currency}`;
}
