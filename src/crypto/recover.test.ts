/*
 * The recovery test. The build brief calls this the real one, and it is.
 *
 * Every other suite in this repository asks whether a piece of the lab behaves. This
 * one asks the only question the lab exists to answer: given the ciphertext and the
 * knowledge that the seed was a four-digit PIN, and nothing else, can the key be
 * recovered — and does the same attempt against a key from `crypto.getRandomValues`
 * come back with nothing.
 *
 * WHAT THE SEARCH IS NOT GIVEN. Not the key, not the seed, not the plaintext. It is
 * handed the `Sealed` value a stranger would have intercepted. That constraint is
 * what makes the result evidence rather than a demonstration of a loop, and it is
 * asserted below rather than left to the reader of `recover.ts`.
 */
import { describe, expect, it } from 'vitest';
import { searchPins, trySeed } from './recover';
import { seal, unseal } from './cipher';
import { PIN_SPACE, pinSeed, seededKey } from './seeded';
import { realKey } from './real';
import { toHex } from './bytes';

const SECRET = 'Session key issued to account 44-19. Valid until Friday.';

describe('the seeded key is recovered from the ciphertext alone', () => {
  it('finds the seed, rebuilds the key, and opens the message', async () => {
    const seed = '7391';
    const key = await seededKey(seed);
    const sealed = await seal(key, 'seeded', SECRET);

    const outcome = await searchPins(sealed);

    expect(outcome.found).not.toBeNull();
    const found = outcome.found!;
    // The seed it names is the seed that was used.
    expect(found.seed).toBe(seed);
    // The key it rebuilt is byte-for-byte the key that encrypted the message. Note
    // the direction: the search never saw this value, and this test compares only
    // afterwards.
    expect(toHex(found.keyBytes)).toBe(toHex(key));
    // And the message came back.
    expect(found.plaintext).toBe(SECRET);
    // It stopped when it hit, at the try the PIN's own numeric value predicts.
    expect(found.onTry).toBe(Number(seed) + 1);
    expect(outcome.tried).toBe(Number(seed) + 1);
    expect(outcome.total).toBe(PIN_SPACE);
  }, 30_000);

  it('finds the first PIN and the last one, not only a comfortable middle', async () => {
    for (const seed of ['0000', '9999']) {
      const sealed = await seal(await seededKey(seed), 'seeded', SECRET);
      const outcome = await searchPins(sealed);
      expect(outcome.found?.seed).toBe(seed);
      expect(outcome.found?.plaintext).toBe(SECRET);
    }
  }, 60_000);

  it('is given nothing but the sealed message', async () => {
    // Asserted structurally, because it is the whole argument: `searchPins` takes
    // one parameter besides its progress callback, and that parameter's fields are
    // the three a stranger has.
    const sealed = await seal(await seededKey('0123'), 'seeded', SECRET);
    expect(Object.keys(sealed).sort()).toEqual(['bytes', 'iv', 'source']);
    expect(searchPins.length).toBeLessThanOrEqual(2);
  });

  it('counts every try it made, and the count is the cost', async () => {
    const seed = '0250';
    const sealed = await seal(await seededKey(seed), 'seeded', SECRET);
    const seen: number[] = [];
    const outcome = await searchPins(sealed, { onProgress: (tried) => seen.push(tried) });
    // The progress callback really fired, and its last value is the final count —
    // so the number the page prints while it works is the number it ends on.
    expect(seen.length).toBeGreaterThan(0);
    expect(seen[seen.length - 1]).toBe(outcome.tried);
    expect(outcome.tried).toBe(251);
    expect(outcome.elapsedMs).toBeGreaterThanOrEqual(0);
  }, 30_000);

  it('reports the whole cost when told not to stop, and the same first hit', async () => {
    // The page asks for this one. A stranger stops at the hit; the page runs the
    // whole space so the headline can state what ten thousand tries actually cost
    // rather than what one lucky PIN cost. Both numbers come back, and the hit is
    // the SAME hit — a sweep that kept looking must not overwrite its own answer
    // with a later candidate.
    const seed = '0001';
    const sealed = await seal(await seededKey(seed), 'seeded', SECRET);
    const sweep = await searchPins(sealed, { stopAtFirstHit: false });
    expect(sweep.found?.seed).toBe(seed);
    expect(sweep.found?.onTry).toBe(2);
    expect(sweep.found?.plaintext).toBe(SECRET);
    expect(sweep.tried).toBe(PIN_SPACE);
    // And stopping early would have reported try 2 as the whole cost.
    expect((await searchPins(sealed)).tried).toBe(2);
  }, 60_000);
});

describe('the same attempt against a real key finds nothing', () => {
  it('exhausts all ten thousand candidates and comes back empty', async () => {
    const key = realKey();
    const sealed = await seal(key, 'real', SECRET);

    const outcome = await searchPins(sealed);

    expect(outcome.found).toBeNull();
    // It really did the work. A search that gave up early and reported nothing would
    // pass a `toBeNull()` and prove nothing at all.
    expect(outcome.tried).toBe(PIN_SPACE);
    expect(outcome.total).toBe(PIN_SPACE);
    // And the message is still intact under the key that made it, so the failure is
    // the search's and not the cipher's.
    expect(await unseal(key, sealed)).toBe(SECRET);
  }, 60_000);

  it('would have found it if it had been there — the same run, both ways', async () => {
    // This is the pairing that makes the negative result mean something. One search
    // function, two ciphertexts, in one test: it finds the seeded one and misses the
    // real one. A build where the search was broken fails the first half.
    const seededSealed = await seal(await seededKey('5005'), 'seeded', SECRET);
    const realSealed = await seal(realKey(), 'real', SECRET);
    expect((await searchPins(seededSealed)).found?.seed).toBe('5005');
    expect((await searchPins(realSealed)).found).toBeNull();
  }, 60_000);
});

describe('a single named guess', () => {
  it('opens the message when the guess is right', async () => {
    const sealed = await seal(await seededKey('1999'), 'seeded', SECRET);
    const found = await trySeed('1999', sealed);
    expect(found?.plaintext).toBe(SECRET);
    expect(found?.seed).toBe('1999');
  });

  it('returns null when it is wrong, for a seeded key and for a real one', async () => {
    const seededSealed = await seal(await seededKey('1999'), 'seeded', SECRET);
    expect(await trySeed('2000', seededSealed)).toBeNull();
    expect(await trySeed('1999', await seal(realKey(), 'real', SECRET))).toBeNull();
  });

  it('accepts a seed that is not a PIN at all', async () => {
    // The panel offers guesses like a date or a counter, not only four digits, so
    // the function must not assume the shape the exhaustive search enumerates.
    const seed = '2026-10-04';
    const sealed = await seal(await seededKey(seed), 'seeded', SECRET);
    expect((await trySeed(seed, sealed))?.plaintext).toBe(SECRET);
    // And such a seed is NOT in the PIN space, so the exhaustive search misses it —
    // which is the honest limit of the attack the page runs.
    expect(pinSeed(2026)).toBe('2026');
    expect((await searchPins(sealed)).found).toBeNull();
  }, 60_000);
});
