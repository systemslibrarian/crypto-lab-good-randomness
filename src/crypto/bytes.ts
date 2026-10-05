/**
 * Byte helpers. Nothing here is cryptography; it is the layer that lets the rest
 * of the lab be read.
 *
 * The page shows plain language first and bytes only when asked, so these are
 * used mostly by disclosures and by the tests. `toHex` is the one exception: the
 * two keys in Panel 2 are shown as hex because that is what a key looks like
 * when anybody shows you one, and the whole argument of that panel is that the
 * two look alike.
 */

import type { Bytes } from './types';

const HEX = '0123456789abcdef';

export function toHex(bytes: Uint8Array): string {
  let out = '';
  for (const b of bytes) out += HEX[b >> 4] + HEX[b & 15];
  return out;
}

export function fromHex(hex: string): Bytes {
  const tight = hex.replace(/\s+/g, '');
  if (tight.length % 2 !== 0) throw new Error('hex string has an odd length');
  if (!/^[0-9a-fA-F]*$/.test(tight)) throw new Error('hex string has a non-hex character');
  const out = new Uint8Array(tight.length / 2);
  for (let i = 0; i < out.length; i += 1) out[i] = parseInt(tight.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/**
 * Hex in groups, so a 32-byte key reads as a row of short words rather than as
 * one 64-character run.
 *
 * This is a legibility decision with an accessibility consequence: an unbroken
 * 64-character token has no break opportunity, so at 320px it pushes the
 * document sideways (WCAG 1.4.10). Grouping gives the browser somewhere to wrap
 * without `word-break` chopping a byte in half.
 */
export function toGroupedHex(bytes: Uint8Array, groupBytes = 4): string {
  const groups: string[] = [];
  for (let i = 0; i < bytes.length; i += groupBytes) {
    groups.push(toHex(bytes.subarray(i, i + groupBytes)));
  }
  return groups.join(' ');
}

/** Constant-time-ish equality. Used by tests and by the recovery search. */
export function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

export const utf8 = (text: string): Bytes => new TextEncoder().encode(text) as Bytes;

/** Decode strictly: invalid UTF-8 throws rather than producing replacement characters. */
export const fromUtf8 = (bytes: Uint8Array): string =>
  new TextDecoder('utf-8', { fatal: true }).decode(bytes);
