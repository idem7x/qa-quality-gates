import { add, applyRate, money, type Money } from './money.ts';

export interface TaxRule {
  code: string; // e.g. "YQ", "IVA"
  ratePct?: number; // percentage of base fare
  fixedMinor?: number; // fixed amount in minor units
}

export interface FareRequest {
  baseMinor: number;
  currency: string;
  taxes: TaxRule[];
}

export interface FareQuote {
  base: Money;
  taxLines: Array<{ code: string; amount: Money }>;
  total: Money;
}

/**
 * Quote a fare: base + tax lines. Each tax line is rounded independently
 * (per-line rounding is the airline convention — summing raw values and
 * rounding once produces different, wrong totals).
 */
export function quoteFare(req: FareRequest): FareQuote {
  const base = money(req.baseMinor, req.currency);
  if (base.amountMinor < 0) {
    throw new RangeError('base fare cannot be negative');
  }

  const taxLines = req.taxes.map((rule) => {
    if (rule.ratePct !== undefined && rule.fixedMinor !== undefined) {
      throw new Error(`tax ${rule.code}: specify ratePct or fixedMinor, not both`);
    }
    const amount =
      rule.ratePct !== undefined
        ? applyRate(base, rule.ratePct)
        : money(rule.fixedMinor ?? 0, req.currency);
    if (amount.amountMinor < 0) {
      throw new RangeError(`tax ${rule.code} cannot be negative`);
    }
    return { code: rule.code, amount };
  });

  const total = taxLines.reduce((acc, line) => add(acc, line.amount), base);
  return { base, taxLines, total };
}
