/*
 * AES-256-GCM: the round trip, and the refusal the whole attack depends on.
 *
 * The refusal is the half with teeth. A round trip passes in a build where seal
 * and unseal are wrong in the same direction, and it passes in a build where
 * unseal ignores the key it is handed. The search in `recover.ts` has exactly one
 * oracle — "did this key open it" — so a cipher that opened anything would make
 * every candidate a hit and the recovery panel a fiction.
 */
import { describe, expect, it } from 'vitest';
import { IV_BYTES, seal, unseal } from './cipher';
import { realKey } from './real';
import { seededKey } from './seeded';
import { toHex } from './bytes';

const MESSAGE = 'The meeting moved to Thursday. Bring the second set of keys.';

describe('the round trip', () => {
  it('returns exactly what went in', async () => {
    const key = realKey();
    const sealed = await seal(key, 'real', MESSAGE);
    expect(await unseal(key, sealed)).toBe(MESSAGE);
  });

  it('carries a fresh nonce per message, and the nonce is not the secret', async () => {
    const key = realKey();
    const a = await seal(key, 'real', MESSAGE);
    const b = await seal(key, 'real', MESSAGE);
    expect(a.iv.length).toBe(IV_BYTES);
    expect(toHex(a.iv)).not.toBe(toHex(b.iv));
    // Same key, same plaintext, different ciphertext — and both still open.
    expect(toHex(a.bytes)).not.toBe(toHex(b.bytes));
    expect(await unseal(key, a)).toBe(MESSAGE);
    expect(await unseal(key, b)).toBe(MESSAGE);
  });

  it('survives text outside ASCII', async () => {
    const key = realKey();
    const text = 'Møt mig ved nordporten — 六時に。 ✅';
    expect(await unseal(key, await seal(key, 'real', text))).toBe(text);
  });
});

describe('the refusal', () => {
  it('returns null for a wrong key rather than rubbish', async () => {
    const sealed = await seal(realKey(), 'real', MESSAGE);
    expect(await unseal(realKey(), sealed)).toBeNull();
  });

  it('returns null for the right key and a damaged ciphertext', async () => {
    const key = realKey();
    const sealed = await seal(key, 'real', MESSAGE);
    const damaged = { ...sealed, bytes: new Uint8Array(sealed.bytes) };
    damaged.bytes[3] ^= 1;
    expect(await unseal(key, damaged as typeof sealed)).toBeNull();
  });

  it('returns null for the right key and the wrong nonce', async () => {
    const key = realKey();
    const sealed = await seal(key, 'real', MESSAGE);
    const moved = { ...sealed, iv: new Uint8Array(sealed.iv) };
    moved.iv[0] ^= 1;
    expect(await unseal(key, moved as typeof sealed)).toBeNull();
  });

  it('still opens the right key in the same run, so refusing everything is not a pass', async () => {
    const key = await seededKey('4242');
    const sealed = await seal(key, 'seeded', MESSAGE);
    expect(await unseal(await seededKey('4243'), sealed)).toBeNull();
    expect(await unseal(key, sealed)).toBe(MESSAGE);
  });

  it('refuses a key of the wrong length rather than padding it', async () => {
    const sealed = await seal(realKey(), 'real', MESSAGE);
    // seal throws; unseal returns null, because unseal's contract is an answer.
    await expect(seal(new Uint8Array(16) as never, 'real', MESSAGE)).rejects.toThrow(/32-byte key/);
    expect(await unseal(new Uint8Array(16) as never, sealed)).toBeNull();
  });
});
