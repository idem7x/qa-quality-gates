import { money, type Money } from './money.ts';

export interface RefundRequest {
  ticketId: string;
  amountMinor: number;
  currency: string;
}

export interface RefundResult {
  refundId: string;
  ticketId: string;
  refunded: Money;
  remainingMinor: number;
  replayed: boolean;
}

export class IdempotencyConflictError extends Error {
  constructor(key: string) {
    super(`idempotency key ${key} was already used with a different payload`);
    this.name = 'IdempotencyConflictError';
  }
}

/**
 * Processes refunds with idempotency: the same Idempotency-Key returns the
 * stored result instead of refunding twice (the double-refund is the bug
 * that actually costs money). Same key + different payload is a conflict.
 */
export class RefundProcessor {
  private processed = new Map<string, { fingerprint: string; result: RefundResult }>();
  private balances = new Map<string, number>();
  private seq = 0;
  private ticketValues: Record<string, { amountMinor: number; currency: string }>;

  constructor(ticketValues: Record<string, { amountMinor: number; currency: string }>) {
    this.ticketValues = ticketValues;
    for (const [id, v] of Object.entries(ticketValues)) {
      this.balances.set(id, v.amountMinor);
    }
  }

  process(idempotencyKey: string, req: RefundRequest): RefundResult {
    if (!idempotencyKey) {
      throw new Error('Idempotency-Key is required');
    }
    const fingerprint = JSON.stringify(req);

    const prior = this.processed.get(idempotencyKey);
    if (prior) {
      if (prior.fingerprint !== fingerprint) {
        throw new IdempotencyConflictError(idempotencyKey);
      }
      return { ...prior.result, replayed: true };
    }

    const ticket = this.ticketValues[req.ticketId];
    if (!ticket) {
      throw new Error(`unknown ticket: ${req.ticketId}`);
    }
    if (req.currency !== ticket.currency) {
      throw new Error(`refund currency ${req.currency} does not match ticket currency ${ticket.currency}`);
    }
    if (!Number.isSafeInteger(req.amountMinor) || req.amountMinor <= 0) {
      throw new RangeError('refund amount must be a positive integer in minor units');
    }

    const remaining = this.balances.get(req.ticketId) ?? 0;
    if (req.amountMinor > remaining) {
      throw new RangeError(
        `refund ${req.amountMinor} exceeds remaining refundable balance ${remaining}`,
      );
    }

    const newRemaining = remaining - req.amountMinor;
    this.balances.set(req.ticketId, newRemaining);

    const result: RefundResult = {
      refundId: `rf_${++this.seq}`,
      ticketId: req.ticketId,
      refunded: money(req.amountMinor, req.currency),
      remainingMinor: newRemaining,
      replayed: false,
    };
    this.processed.set(idempotencyKey, { fingerprint, result });
    return result;
  }
}
