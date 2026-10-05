/*
 * The predictable source: real ChaCha20, started from something guessable.
 *
 * THE ALGORITHM IS NOT THE DEFECT, AND THIS FILE IS SHAPED TO MAKE THAT
 * UNDENIABLE. The generator below is ChaCha20 as RFC 8439 specifies it, checked
 * against the specification's own published vectors. Its output is
 * indistinguishable from random to anybody who does not know the key. What is
 * wrong is one line: the key is the SHA-256 of a short string a stranger can
 * enumerate.
 *
 * WHY SHA-256 IS IN HERE AT ALL. A seed has to become a 256-bit key somehow, and
 * hashing it is what a careless implementation really does — it feels like
 * strengthening. It is not. SHA-256 is a function: ten thousand inputs give ten
 * thousand outputs. Stretching a guessable number produces a longer guessable
 * number, and the page says this in those words, because "but I hashed it" is the
 * most common objection a reader arrives with.
 *
 * THE NONCE IS ZERO, DELIBERATELY. ChaCha20 takes a nonce, and a real stream
 * cipher deployment varies it per message. Here it is fixed at zero so that one
 * seed means one keystream, which is what makes the whole generator reproducible
 * and the recovery possible. A nonce chosen from a real random source would fix
 * this particular hole and leave the lesson intact — the key would still be ten
 * thousand guesses wide — so the page does not offer that as a remedy.
 */
import { keystream, NONCE_BYTES } from './chacha20';
import { KEY_BYTES } from './real';
import { utf8 } from './bytes';
import type { Bytes } from './types';

/** Fixed at zero. See the note above on why. */
const ZERO_NONCE = new Uint8Array(NONCE_BYTES);

/**
 * How many digits the PIN in Panel 3 has, and therefore how many tries a
 * stranger needs. Four digits is ten thousand, which is arithmetic a reader can
 * hold in their head — and the whole point of expressing guessability as a
 * number of tries rather than as a quantity of entropy.
 */
export const PIN_DIGITS = 4;
export const PIN_SPACE = 10 ** PIN_DIGITS;

/** Candidate `n` as the PIN a careless system would have used. */
export const pinSeed = (n: number): string => String(n).padStart(PIN_DIGITS, '0');

/**
 * The 256-bit ChaCha20 key this seed produces.
 *
 * One SHA-256 over the seed's UTF-8 bytes. No salt, no iteration count, no work
 * factor — all three are things a password hash would have and a seed-stretch
 * does not, because the defect is not that the hash is fast. A million rounds of
 * anything over ten thousand inputs still leaves ten thousand answers.
 */
export async function seedToCipherKey(seed: string): Promise<Bytes> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', utf8(seed))) as Bytes;
}

/**
 * `length` bytes from the seeded generator.
 *
 * This is the function that stands in for "the random numbers my program
 * produced". Everything a program would call random — a key, a token, a session
 * id — comes off a stream like this one.
 */
export async function seededBytes(seed: string, length: number): Promise<Bytes> {
  const cipherKey = await seedToCipherKey(seed);
  return keystream(cipherKey, ZERO_NONCE, length);
}

/** The 32-byte "random" key this seed will always produce. */
export const seededKey = (seed: string): Promise<Bytes> => seededBytes(seed, KEY_BYTES);
