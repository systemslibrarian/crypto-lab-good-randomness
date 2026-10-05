/*
 * The dice: unbiased by construction, and deterministic when the stream is.
 */
import { describe, expect, it } from 'vitest';
import { DIE_FACES, REJECT_AT, rollDice, supplyFrom } from './dice';
import { realBytes } from './real';
import { seededBytes } from './seeded';
import type { Bytes } from './types';

const bytes = (values: number[]): Bytes => new Uint8Array(values) as Bytes;

describe('rejection sampling', () => {
  it('discards the bytes that would bias the die, and says how many', () => {
    // 252, 253, 254, 255 are the four values that make `% 6` lean. Each is
    // discarded and replaced, so a supply of three high bytes followed by a 0
    // yields one face from the 0 and reports three discards.
    const roll = rollDice(1, supplyFrom(bytes([255, 254, 252, 0])));
    expect(roll.faces).toEqual([1]);
    expect(roll.discarded).toBe(3);
    expect(roll.bytesUsed).toBe(4);
  });

  it('rejects at exactly the largest multiple of six', () => {
    expect(REJECT_AT).toBe(252);
    expect(REJECT_AT % DIE_FACES).toBe(0);
    // 251 is the highest byte that may be used, and it must map to a real face.
    expect(rollDice(1, supplyFrom(bytes([251]))).faces).toEqual([(251 % 6) + 1]);
    expect(rollDice(1, supplyFrom(bytes([251]))).discarded).toBe(0);
  });

  it('maps every usable byte to a face, and every face is reachable', () => {
    const seen = new Set<number>();
    for (let b = 0; b < REJECT_AT; b += 1) {
      const face = rollDice(1, supplyFrom(bytes([b]))).faces[0]!;
      expect(face).toBeGreaterThanOrEqual(1);
      expect(face).toBeLessThanOrEqual(DIE_FACES);
      seen.add(face);
    }
    expect(seen.size).toBe(DIE_FACES);
  });

  it('gives every face exactly the same number of usable bytes', () => {
    // This is the assertion that makes "unbiased" a measurement rather than a
    // claim: with 252 usable bytes and six faces, each face must get 42 of them.
    const counts = new Map<number, number>();
    for (let b = 0; b < REJECT_AT; b += 1) {
      const face = (b % DIE_FACES) + 1;
      counts.set(face, (counts.get(face) ?? 0) + 1);
    }
    expect([...counts.values()]).toEqual([42, 42, 42, 42, 42, 42]);
  });

  it('runs out loudly rather than wrapping round', () => {
    // Wrapping would make a seeded roll repeat inside itself, which on this
    // particular page would read as a result.
    expect(() => rollDice(5, supplyFrom(bytes([1, 2])))).toThrow(/ran out of bytes/);
  });
});

describe('the same stream gives the same dice', () => {
  it('for a seeded source, twice', async () => {
    const first = rollDice(5, supplyFrom(await seededBytes('today', 64)));
    const second = rollDice(5, supplyFrom(await seededBytes('today', 64)));
    expect(second.faces).toEqual(first.faces);
    expect(second.discarded).toBe(first.discarded);
  });

  it('and a different seed gives different dice', async () => {
    const a = rollDice(5, supplyFrom(await seededBytes('monday', 64)));
    const b = rollDice(5, supplyFrom(await seededBytes('tuesday', 64)));
    expect(a.faces).not.toEqual(b.faces);
  });

  it('while the real source is only asserted to be in range', async () => {
    // Structural, not statistical: five dice from the real source could legitimately
    // be five sixes. What is asserted is that they are dice.
    const roll = rollDice(5, supplyFrom(realBytes(64)));
    expect(roll.faces).toHaveLength(5);
    for (const f of roll.faces) expect(f).toBeGreaterThanOrEqual(1);
    for (const f of roll.faces) expect(f).toBeLessThanOrEqual(6);
  });
});
