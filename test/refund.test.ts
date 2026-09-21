import { beforeEach, describe, expect, it } from 'vitest';
import { IdempotencyConflictError, RefundProcessor } from '../src/refund.ts';

describe('RefundProcessor', () => {
  let processor: RefundProcessor;

  beforeEach(() => {
    processor = new RefundProcessor({
      'TK-1': { amountMinor: 10_000, currency: 'EUR' },
    });
  });

  const req = { ticketId: 'TK-1', amountMinor: 4_000, currency: 'EUR' };

  it('processes a refund and decrements the refundable balance', () => {
    const result = processor.process('key-1', req);
    expect(result.refunded.amountMinor).toBe(4_000);
    expect(result.remainingMinor).toBe(6_000);
    expect(result.replayed).toBe(false);
  });

  it('replays the same idempotency key without refunding twice', () => {
    const first = processor.process('key-1', req);
    const replay = processor.process('key-1', req);
    expect(replay.refundId).toBe(first.refundId);
    expect(replay.replayed).toBe(true);
    // Balance was only decremented once:
    expect(replay.remainingMinor).toBe(6_000);
  });

  it('rejects the same key with a different payload (409 semantics)', () => {
    processor.process('key-1', req);
    expect(() => processor.process('key-1', { ...req, amountMinor: 1 })).toThrow(
      IdempotencyConflictError,
    );
  });

  it('rejects refunds exceeding the remaining balance, including across partial refunds', () => {
    processor.process('k1', { ...req, amountMinor: 8_000 });
    expect(() => processor.process('k2', { ...req, amountMinor: 3_000 })).toThrow(/exceeds/);
  });

  it('rejects zero, negative and non-integer amounts', () => {
    expect(() => processor.process('k', { ...req, amountMinor: 0 })).toThrow(RangeError);
    expect(() => processor.process('k', { ...req, amountMinor: -100 })).toThrow(RangeError);
    expect(() => processor.process('k', { ...req, amountMinor: 10.5 })).toThrow(RangeError);
  });

  it('rejects currency mismatch with the ticket', () => {
    expect(() => processor.process('k', { ...req, currency: 'USD' })).toThrow(/currency/);
  });

  it('rejects unknown tickets and missing idempotency keys', () => {
    expect(() => processor.process('k', { ...req, ticketId: 'NOPE' })).toThrow(/unknown ticket/);
    expect(() => processor.process('', req)).toThrow(/Idempotency-Key/);
  });
});
