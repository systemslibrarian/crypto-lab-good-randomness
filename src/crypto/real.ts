/*
 * The real source: the browser's own CSPRNG.
 *
 * `crypto.getRandomValues` is the Web Cryptography API's random source, and it is
 * what the browser uses for its own key generation. Underneath it is the
 * operating system's generator, seeded from physical events the machine measured
 * — interrupt timings, device noise — which is the only place in the whole stack
 * where unguessable bits actually enter. Everything above it is arithmetic.
 *
 * THERE IS NOTHING TO HAND-ROLL HERE, AND THAT IS THE POINT. This file is four
 * lines because the real source is not an algorithm this lab could show you; it
 * is a request to the operating system. The algorithm in this lab is the
 * PREDICTABLE one, in `chacha20.ts`, which is written out in full — because the
 * lesson is that the algorithm was never the problem.
 *
 * HOW THIS IS TESTED, AND WHY NOT STATISTICALLY. `real.test.ts` asserts the
 * SHAPE — 32 bytes, drawn from `crypto.getRandomValues`, a different answer each
 * call — and never asserts that the output looks random. A test that asserted the
 * randomness of a random source would be flaky by construction: it would fail
 * occasionally on a correct build, for the same reason a fair coin sometimes
 * comes up heads eight times. Saying so out loud is part of what this lab teaches,
 * and the page says it too.
 */

import type { Bytes } from './types';

/** The size of every key in this lab: 32 bytes, which is 256 bits. */
export const KEY_BYTES = 32;

/**
 * `length` unguessable bytes.
 *
 * Throws rather than falling back if WebCrypto is absent. A silent fallback to
 * `Math.random()` is the exact defect this lab is about, and a lab that shipped
 * one while teaching against it would be worth nothing.
 */
export function realBytes(length: number): Bytes {
  if (typeof crypto === 'undefined' || typeof crypto.getRandomValues !== 'function') {
    throw new Error('this browser has no crypto.getRandomValues, so there is no real source here');
  }
  return crypto.getRandomValues(new Uint8Array(length)) as Bytes;
}

/** A 32-byte key from the real source. */
export const realKey = (): Bytes => realBytes(KEY_BYTES);
