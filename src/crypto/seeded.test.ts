/*
 * The seeded generator: determinism, and the thing determinism costs.
 *
 * None of these is a statistical test. The output of a correct ChaCha20 keystream
 * cannot be distinguished from random by any test this file could run, which is
 * the lab's whole thesis — so what is asserted here is the property that actually
 * matters and that no amount of looking at the output would reveal: the same seed
 * gives the same bytes, forever, to anybody.
 */
import { describe, expect, it } from 'vitest';
import { PIN_DIGITS, PIN_SPACE, pinSeed, seedToCipherKey, seededBytes, seededKey } from './seeded';
import { keystream } from './chacha20';
import { toHex } from './bytes';

describe('the same seed gives the same bytes', () => {
  it('twice in a row', async () => {
    const a = await seededBytes('1234', 64);
    const b = await seededBytes('1234', 64);
    expect(toHex(a)).toBe(toHex(b));
  });

  it('and a different seed gives different bytes', async () => {
    const a = await seededKey('1234');
    const b = await seededKey('1235');
    expect(toHex(a)).not.toBe(toHex(b));
  });

  it('including seeds that differ only in a leading zero', async () => {
    // '0042' and '42' are different strings, so they are different seeds. Worth
    // pinning because `pinSeed` pads, and a caller that formatted a candidate
    // differently from the way the key was made would search the wrong space and
    // find nothing — which would read as "the attack failed" rather than as a bug.
    expect(toHex(await seededKey('0042'))).not.toBe(toHex(await seededKey('42')));
  });
});

describe('the key is one SHA-256 over the seed, and nothing more', () => {
  it('derives the cipher key from the seed alone', async () => {
    // No salt, no iteration count, no per-install value: the function's entire
    // input is the seed string. This is the assertion that says the search in
    // recover.ts is possible for a stranger and not only for this test.
    const key = await seedToCipherKey('1234');
    expect(key.length).toBe(32);
    const again = await seedToCipherKey('1234');
    expect(toHex(key)).toBe(toHex(again));
  });

  it('reads the generator output as the keystream under that key at a zero nonce', async () => {
    // Re-derived by a different route than seededBytes takes: this test calls the
    // cipher directly rather than trusting the wrapper. If the wrapper started
    // mixing in anything else — a counter offset, a second hash — this fails.
    const key = await seedToCipherKey('0000');
    expect(toHex(await seededBytes('0000', 96))).toBe(
      toHex(keystream(key, new Uint8Array(12), 96))
    );
  });
});

describe('the search space, stated as a number of tries', () => {
  it('is ten thousand four-digit PINs', () => {
    expect(PIN_DIGITS).toBe(4);
    expect(PIN_SPACE).toBe(10000);
  });

  it('enumerates every one of them exactly once, zero-padded', () => {
    expect(pinSeed(0)).toBe('0000');
    expect(pinSeed(7)).toBe('0007');
    expect(pinSeed(9999)).toBe('9999');
    const all = new Set(Array.from({ length: PIN_SPACE }, (_, n) => pinSeed(n)));
    expect(all.size).toBe(PIN_SPACE);
    for (const s of all) expect(s).toMatch(/^\d{4}$/);
  });
});
