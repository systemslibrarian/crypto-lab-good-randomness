/*
 * ChaCha20 against the published known-answer vectors.
 *
 * This is the only suite in the repository that could disagree with the lab. Every
 * other test here asks whether the code is self-consistent, and a hand-rolled
 * cipher that is self-consistent is worth nothing: drop the block function's final
 * word-wise addition and encrypt/decrypt still round-trips, the output still looks
 * random, and the result is not ChaCha20.
 *
 * The vectors themselves are checked by a DIFFERENT route, outside Vitest:
 * `scripts/check-vectors.mjs` re-derives every one with Node's OpenSSL ChaCha20
 * and fails on a one-byte difference. That division is deliberate. A failure here
 * means this implementation is wrong; a failure there means the transcription is.
 * When this file first ran, the transcription was the one at fault.
 */
import { describe, expect, it } from 'vitest';
import { block, keystream, xorStream } from './chacha20';
import { fromHex, toHex, utf8 } from './bytes';
import { BLOCK_CASES, MUST_DIFFER, PINNED_CASE_COUNT, STREAM_CASES } from './vectors';

describe('the block function, against RFC 8439', () => {
  it.each(BLOCK_CASES.map((c) => [c.label, c] as const))('%s', (_label, c) => {
    expect(toHex(block(fromHex(c.keyHex), c.counter, fromHex(c.nonceHex)))).toBe(c.expectHex);
  });

  it('reads the counter as a 32-bit word, not as part of the nonce', () => {
    // A.1 #1 and #2 differ ONLY in the counter, so this is the pair that catches
    // an implementation which placed the counter in the wrong state word — the
    // single likeliest way to get a cipher that still looks perfectly random.
    const zeroKey = new Uint8Array(32);
    const zeroNonce = new Uint8Array(12);
    expect(toHex(block(zeroKey, 0, zeroNonce))).not.toBe(toHex(block(zeroKey, 1, zeroNonce)));
  });
});

describe('the keystream', () => {
  it('is the block function, concatenated', () => {
    const key = fromHex(BLOCK_CASES[1]!.keyHex);
    const nonce = fromHex(BLOCK_CASES[1]!.nonceHex);
    // Two published vectors sit back to back here: A.1 #1 is counter 0 and A.1 #2
    // is counter 1 over the same key and nonce, so 128 bytes of keystream from
    // counter 0 must be exactly those two blocks joined. That is a stronger claim
    // than "the loop calls block()" because it pins the counter's INCREMENT.
    const expected = BLOCK_CASES[1]!.expectHex + BLOCK_CASES[2]!.expectHex;
    expect(toHex(keystream(key, nonce, 128, 0))).toBe(expected);
  });

  it('truncates rather than rounding up to a block', () => {
    const key = new Uint8Array(32);
    const nonce = new Uint8Array(12);
    expect(keystream(key, nonce, 1).length).toBe(1);
    expect(keystream(key, nonce, 65).length).toBe(65);
    expect(keystream(key, nonce, 0).length).toBe(0);
    // A partial read must be a PREFIX of the full block, not a re-derivation.
    expect(toHex(keystream(key, nonce, 20))).toBe(toHex(keystream(key, nonce, 64)).slice(0, 40));
  });
});

describe('encryption, against RFC 8439 §2.4.2', () => {
  it.each(STREAM_CASES.map((c) => [c.label, c] as const))('%s', (_label, c) => {
    const got = xorStream(fromHex(c.keyHex), fromHex(c.nonceHex), utf8(c.plaintext), c.counter);
    expect(toHex(got)).toBe(c.expectHex);
  });

  it('decrypts by the same operation it encrypts by', () => {
    const c = STREAM_CASES[0]!;
    const back = xorStream(fromHex(c.keyHex), fromHex(c.nonceHex), fromHex(c.expectHex), c.counter);
    expect(new TextDecoder().decode(back)).toBe(c.plaintext);
  });
});

describe("this lab's own derived cases, which are the half with teeth", () => {
  it.each(MUST_DIFFER.map((c) => [c.label, c] as const))(
    'changing the %s changes the answer',
    (_label, c) => {
      const got = keystream(
        fromHex(c.keyHex),
        fromHex(c.nonceHex),
        c.mustNotEqualHex.length / 2,
        c.counter
      );
      expect(toHex(got)).not.toBe(c.mustNotEqualHex);
    }
  );
});

describe('the pinned set itself', () => {
  it('still holds both kinds of case', () => {
    // A regeneration that dropped every must-differ case would leave a suite that
    // passes while measuring only the direction an input-ignoring implementation
    // already satisfies. The counts are asserted so that cannot happen quietly.
    expect(BLOCK_CASES.length).toBeGreaterThan(3);
    expect(STREAM_CASES.length).toBeGreaterThan(0);
    expect(MUST_DIFFER.length).toBeGreaterThan(0);
    expect(BLOCK_CASES.length + STREAM_CASES.length + MUST_DIFFER.length).toBe(PINNED_CASE_COUNT);
  });

  it('cites a section for every case, and never cites the RFC for a derived one', () => {
    for (const c of [...BLOCK_CASES, ...STREAM_CASES]) {
      expect(c.where).toMatch(/^RFC 8439/);
    }
    for (const c of MUST_DIFFER) {
      // The derived cases are allowed to SAY which published case they are derived
      // from; they must not read as published themselves.
      expect(c.where).toMatch(/^this lab/);
    }
  });

  it('rejects a key or nonce of the wrong length rather than padding it', () => {
    expect(() => block(new Uint8Array(31), 0, new Uint8Array(12))).toThrow(/32-byte key/);
    expect(() => block(new Uint8Array(32), 0, new Uint8Array(8))).toThrow(/12-byte nonce/);
  });
});
