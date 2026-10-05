/*
 * AES-256-GCM, through the browser's own implementation.
 *
 * WHY THERE IS A CIPHER IN A LAB ABOUT RANDOMNESS. Because "the key is
 * guessable" has to be shown costing something. A recovered key printed beside
 * the one that was used would prove the search worked and would still be a
 * comparison the page could have faked. A message that OPENS is a different kind
 * of evidence: AES-GCM carries an authentication tag, so a wrong key does not
 * produce rubbish, it produces a refusal. The search below has an exact oracle
 * for "was this the key", and so does the reader.
 *
 * That property is also what makes the recovery honest rather than theatrical:
 * nothing compares the candidate key against the real one. The attack never sees
 * the real key. It asks ten thousand times "does this open the message", which is
 * what a stranger with the ciphertext can actually do.
 *
 * THE NONCE IS FROM THE REAL SOURCE, and that is not a contradiction. A nonce is
 * not a secret; it ships with the ciphertext and this page prints it. Using the
 * real source for it keeps the one thing this lab is about — the KEY — the only
 * variable in play. If the nonce came from the seeded generator too, a reader
 * could reasonably wonder which of the two holes the attack went through.
 */
import { fromUtf8, utf8 } from './bytes';
import { realBytes } from './real';
import type { Bytes, Sealed, Source } from './types';

export const IV_BYTES = 12;

async function importAes(key: Bytes, use: 'encrypt' | 'decrypt'): Promise<CryptoKey> {
  if (key.length !== 32) throw new Error('AES-256-GCM needs a 32-byte key');
  return crypto.subtle.importKey('raw', key, 'AES-GCM', false, [use]);
}

export async function seal(key: Bytes, source: Source, plaintext: string): Promise<Sealed> {
  const iv = realBytes(IV_BYTES);
  const handle = await importAes(key, 'encrypt');
  const bytes = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, handle, utf8(plaintext))
  ) as Bytes;
  return { iv, bytes, source };
}

/**
 * Open it, or return null.
 *
 * NULL IS NOT AN ERROR PATH, IT IS THE ANSWER. A wrong key fails the GCM tag
 * check and `crypto.subtle.decrypt` rejects; that rejection is the information
 * the search is built on, so it is returned as a value rather than thrown. A
 * thrown exception here would have to be caught ten thousand times by the caller
 * and would invite a `catch {}` that swallowed a real fault alongside it.
 *
 * The decode is strict (`fatal: true`), so a key that somehow passed the tag
 * check and produced non-text still returns null rather than a string full of
 * replacement characters.
 */
export async function unseal(key: Bytes, sealed: Sealed): Promise<string | null> {
  try {
    const handle = await importAes(key, 'decrypt');
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: sealed.iv },
      handle,
      sealed.bytes
    );
    return fromUtf8(new Uint8Array(plain) as Bytes);
  } catch {
    return null;
  }
}
