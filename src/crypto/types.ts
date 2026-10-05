/** Shared types for the generator and recovery code. `src/crypto/` holds no DOM. */

/**
 * A byte string backed by a plain `ArrayBuffer`.
 *
 * `Uint8Array` defaults its buffer parameter to `ArrayBufferLike`, which admits a
 * `SharedArrayBuffer` — and `BufferSource`, which every `crypto.subtle` call
 * takes, does not. Naming the buffer here means the WebCrypto calls typecheck
 * without a cast at each site, and a cast is exactly what should not be reached
 * for: it would silence the one check standing between this code and handing
 * shared memory to a primitive that must not see it.
 */
export type Bytes = Uint8Array<ArrayBuffer>;

/** Which of the two sources a key came from. The whole lab turns on this. */
export type Source = 'real' | 'seeded';

/** A 32-byte key, and where it came from. */
export interface Key {
  readonly source: Source;
  readonly bytes: Bytes;
  /**
   * The seed, for a seeded key — and `null` for a real one, because there is no
   * seed to record. That asymmetry is the whole lesson, so it lives in the type
   * rather than in a comment: there is no field here a stranger could guess.
   */
  readonly seed: string | null;
}

/** A message encrypted under one of those keys. */
export interface Sealed {
  readonly iv: Bytes;
  readonly bytes: Bytes;
  /** Which source's key sealed it. Carried so a panel cannot mix them up. */
  readonly source: Source;
}
