/*
 * ChaCha20, hand-rolled, as specified in RFC 8439.
 *
 * WHY THIS IS HAND-ROLLED AND NOT TAKEN FROM A LIBRARY. §0.1 of the build
 * standard: for the primitive that IS the teaching subject, the inspectable
 * internals are written out rather than hidden behind a dependency. The seeded
 * generator is this lab's subject, and the whole lesson is that the ALGORITHM is
 * blameless — so the algorithm has to be here, in a file a reader can open,
 * rather than behind an import that could be hiding anything.
 *
 * WHY CHACHA20 AND NOT A TOY. A linear congruential generator would make this
 * lab easier to write and would teach the wrong thing: a reader would conclude
 * that the GENERATOR was the problem, and walk away believing that a respectable
 * algorithm would have saved them. ChaCha20 is a real stream cipher, used in
 * TLS 1.3 and WireGuard, and it is deliberately given a guessable seed here. Its
 * keystream is indistinguishable from random to anybody who does not know the
 * key. That is exactly the point: the output is beyond reproach and the key is
 * ten thousand guesses wide.
 *
 * It is checked against the published known-answer vectors in `vectors.ts`,
 * which is the only thing in this repository that could disagree with it.
 *
 * NOT A CONSTANT-TIME IMPLEMENTATION, and nothing here claims to be. JavaScript
 * offers no way to make that claim honestly. It does not matter for this lab —
 * the key is public by construction in every panel — but a reader who takes this
 * file somewhere else should know.
 */

import type { Bytes } from './types';

/** "expand 32-byte k", the sigma constants, as four little-endian words. */
const SIGMA = [0x61707865, 0x3320646e, 0x79622d32, 0x6b206574] as const;

export const KEY_BYTES = 32;
export const NONCE_BYTES = 12;
export const BLOCK_BYTES = 64;

const rotl = (v: number, n: number): number => ((v << n) | (v >>> (32 - n))) >>> 0;

/**
 * The quarter round, RFC 8439 §2.1, applied in place to four state words.
 *
 * Written out rather than looped because this is the function the whole cipher
 * is made of, and a reader opening this file to see "what ChaCha actually does"
 * should find it in four lines.
 */
function quarterRound(s: Uint32Array, ai: number, bi: number, ci: number, di: number): void {
  let a = s[ai]!;
  let b = s[bi]!;
  let c = s[ci]!;
  let d = s[di]!;
  a = (a + b) >>> 0; d = rotl(d ^ a, 16);
  c = (c + d) >>> 0; b = rotl(b ^ c, 12);
  a = (a + b) >>> 0; d = rotl(d ^ a, 8);
  c = (c + d) >>> 0; b = rotl(b ^ c, 7);
  s[ai] = a; s[bi] = b; s[ci] = c; s[di] = d;
}

function readLE32(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset]! | (bytes[offset + 1]! << 8) | (bytes[offset + 2]! << 16)) +
    bytes[offset + 3]! * 0x1000000
  );
}

/** The 16-word initial state, RFC 8439 §2.3. */
function initialState(key: Uint8Array, counter: number, nonce: Uint8Array): Uint32Array {
  if (key.length !== KEY_BYTES) throw new Error(`ChaCha20 needs a ${KEY_BYTES}-byte key`);
  if (nonce.length !== NONCE_BYTES) throw new Error(`ChaCha20 needs a ${NONCE_BYTES}-byte nonce`);
  const state = new Uint32Array(16);
  state[0] = SIGMA[0]; state[1] = SIGMA[1]; state[2] = SIGMA[2]; state[3] = SIGMA[3];
  for (let i = 0; i < 8; i += 1) state[4 + i] = readLE32(key, i * 4) >>> 0;
  state[12] = counter >>> 0;
  for (let i = 0; i < 3; i += 1) state[13 + i] = readLE32(nonce, i * 4) >>> 0;
  return state;
}

/**
 * The block function, RFC 8439 §2.3: twenty rounds over the initial state, then
 * the result ADDED word-wise to that initial state and serialised little-endian.
 *
 * The final addition is the part a from-memory implementation drops, and
 * dropping it leaves a function that is still deterministic, still looks random,
 * and is not ChaCha20. That is what the pinned vectors are for.
 */
export function block(key: Uint8Array, counter: number, nonce: Uint8Array): Bytes {
  const start = initialState(key, counter, nonce);
  const s = start.slice();
  for (let i = 0; i < 10; i += 1) {
    // Four column rounds.
    quarterRound(s, 0, 4, 8, 12);
    quarterRound(s, 1, 5, 9, 13);
    quarterRound(s, 2, 6, 10, 14);
    quarterRound(s, 3, 7, 11, 15);
    // Four diagonal rounds.
    quarterRound(s, 0, 5, 10, 15);
    quarterRound(s, 1, 6, 11, 12);
    quarterRound(s, 2, 7, 8, 13);
    quarterRound(s, 3, 4, 9, 14);
  }
  const out = new Uint8Array(BLOCK_BYTES) as Bytes;
  for (let i = 0; i < 16; i += 1) {
    const word = (s[i]! + start[i]!) >>> 0;
    out[i * 4] = word & 0xff;
    out[i * 4 + 1] = (word >>> 8) & 0xff;
    out[i * 4 + 2] = (word >>> 16) & 0xff;
    out[i * 4 + 3] = (word >>> 24) & 0xff;
  }
  return out;
}

/**
 * `length` bytes of keystream from `counter` onward.
 *
 * This is the only function the rest of the lab calls. A generator "producing
 * random numbers" is, concretely, this: a keystream read off a cipher. There is
 * nothing else in the box.
 */
export function keystream(
  key: Uint8Array,
  nonce: Uint8Array,
  length: number,
  counter = 0
): Bytes {
  if (length < 0) throw new Error('length must not be negative');
  const out = new Uint8Array(length) as Bytes;
  for (let offset = 0; offset < length; offset += BLOCK_BYTES) {
    const b = block(key, counter + offset / BLOCK_BYTES, nonce);
    out.set(b.subarray(0, Math.min(BLOCK_BYTES, length - offset)), offset);
  }
  return out;
}

/**
 * Encrypt (or decrypt) by XOR with the keystream, RFC 8439 §2.4.
 *
 * Used only by the pinned vectors: the published encryption cases are the
 * direction an outside publication can pin. The lab's own panels read the
 * keystream directly, because what they are demonstrating is a generator rather
 * than a cipher.
 */
export function xorStream(
  key: Uint8Array,
  nonce: Uint8Array,
  data: Uint8Array,
  counter = 1
): Bytes {
  const ks = keystream(key, nonce, data.length, counter);
  const out = new Uint8Array(data.length) as Bytes;
  for (let i = 0; i < data.length; i += 1) out[i] = data[i]! ^ ks[i]!;
  return out;
}
