/*
 * The real source, asserted STRUCTURALLY and never statistically.
 *
 * This file is short on purpose and the reason is part of what the lab teaches. A
 * test that asserted the randomness of a random source would be flaky by
 * construction: any threshold a correct generator clears with probability p fails
 * with probability 1-p, and a suite that goes red on a correct build teaches people
 * to re-run it until it passes. So what is asserted is the shape — the right number
 * of bytes, drawn from `crypto.getRandomValues`, a different answer each time — and
 * nothing about how the bytes look.
 *
 * The one near-statistical assertion below ("a different answer each time") is safe
 * because its failure probability is 2^-256 per pair, which is not a threshold but
 * an impossibility.
 */
import { describe, expect, it, vi } from 'vitest';
import { KEY_BYTES, realBytes, realKey } from './real';
import { toHex } from './bytes';

describe('the real source', () => {
  it('is crypto.getRandomValues, and is not reimplemented here', () => {
    // The assertion that matters most in this file. A build that quietly fell back
    // to Math.random() would pass every other test in this repository and would be
    // the exact defect the lab exists to warn about, so the call is observed rather
    // than inferred.
    const spy = vi.spyOn(globalThis.crypto, 'getRandomValues');
    const bytes = realKey();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]![0]).toBeInstanceOf(Uint8Array);
    expect((spy.mock.calls[0]![0] as Uint8Array).length).toBe(KEY_BYTES);
    expect(bytes.length).toBe(KEY_BYTES);
    spy.mockRestore();
  });

  it('returns the length asked for', () => {
    expect(realBytes(1).length).toBe(1);
    expect(realBytes(12).length).toBe(12);
    expect(realKey().length).toBe(32);
  });

  it('does not repeat itself', () => {
    // Failure probability 2^-256 per pair. Stated so nobody later reads this as a
    // statistical test and starts adding more of them.
    const seen = new Set(Array.from({ length: 8 }, () => toHex(realKey())));
    expect(seen.size).toBe(8);
  });
});
