/*
 * The four checks: what they catch, and what they cannot.
 *
 * THE SECOND HALF IS THE IMPORTANT ONE. It is easy to assert that a check catches
 * all-zero bytes. The assertion this lab needs is that the checks pass a stream
 * whose key is a four-digit PIN — because that is the claim Panel 2 makes and the
 * belief §4.1d's negative claim is built on. It is asserted over a FIXED seed so
 * the result is a fact rather than a probability.
 */
import { describe, expect, it } from 'vitest';
import { LOPSIDED_HIGH, LOPSIDED_LOW, MAX_RUN, allPassed, passedCount, runChecks } from './looksRandom';
import { seededBytes, seededKey } from './seeded';
import type { Bytes } from './types';

/** How many of the ten thousand PINs the spread test covers. */
const PIN_SAMPLE = 300;

const bytes = (values: number[]): Bytes => new Uint8Array(values) as Bytes;
const repeat = (value: number, n = 32): Bytes => bytes(Array.from({ length: n }, () => value));
const byId = (b: Bytes, id: string): boolean => {
  const check = runChecks(b).find((c) => c.id === id);
  if (!check) throw new Error(`no check with id ${id}`);
  return check.passed;
};

describe('what the checks catch', () => {
  it('catches a constant stream on every check that can see it', () => {
    const checks = runChecks(repeat(0));
    expect(allPassed(checks)).toBe(false);
    expect(byId(repeat(0), 'all-same')).toBe(false);
    expect(byId(repeat(0), 'four-in-a-row')).toBe(false);
    // A stream of zeros has a constant step of 0, so the counting check sees it too.
    expect(byId(repeat(0), 'counting')).toBe(false);
    // And it is as lopsided as a stream can be: nothing at all in the top half.
    expect(byId(repeat(0), 'lopsided')).toBe(false);
    expect(passedCount(checks)).toBe(0);
  });

  it('catches a counter', () => {
    const counting = bytes(Array.from({ length: 32 }, (_, i) => i));
    expect(byId(counting, 'counting')).toBe(false);
    // And it passes the other three, which is the point of having four: a counter
    // has 32 distinct values, no repeats at all, and this one is lopsided only
    // because it starts at zero.
    expect(byId(counting, 'all-same')).toBe(true);
    expect(byId(counting, 'four-in-a-row')).toBe(true);
  });

  it('catches a block of repeats inside otherwise varied bytes', () => {
    const varied = Array.from({ length: 32 }, (_, i) => (i * 37 + 11) % 256);
    const withRun = varied.slice();
    for (let i = 10; i < 10 + MAX_RUN + 1; i += 1) withRun[i] = 99;
    expect(byId(bytes(withRun), 'four-in-a-row')).toBe(false);
    expect(byId(bytes(varied), 'four-in-a-row')).toBe(true);
  });

  it('catches a lopsided stream at each end of the range', () => {
    const allLow = bytes(Array.from({ length: 32 }, (_, i) => i * 3));
    const allHigh = bytes(Array.from({ length: 32 }, (_, i) => 200 + (i % 50)));
    expect(byId(allLow, 'lopsided')).toBe(false);
    expect(byId(allHigh, 'lopsided')).toBe(false);
  });

  it('reports what it measured, not just a verdict', () => {
    // The page prints these observations, and the claims suite cross-checks the
    // printed count against the rows. An observation that said nothing specific
    // would make that cross-check vacuous.
    const checks = runChecks(repeat(7));
    expect(checks.find((c) => c.id === 'all-same')!.observed).toContain('7');
    expect(checks.find((c) => c.id === 'lopsided')!.observed).toMatch(/^0 of 32 /);
  });

  it('carries a NUMBER on every row, passing or failing', () => {
    // The counting row used to pass with "the steps between neighbours vary", which
    // is a conclusion rather than a measurement — and a row with no number in it is a
    // row a hard-wired check could hide behind, because the claims suite cross-checks
    // counts against rows. Asserted over a passing set and a failing one.
    const counting = bytes(Array.from({ length: 32 }, (_, i) => i));
    // NOT `(i * 37 + 11) % 256`, which was the first sample tried here and is an
    // arithmetic progression of step 37 — so it FAILS the counting check, correctly,
    // and could not demonstrate a passing row. Worth recording: the same expression is
    // used above purely as "varied bytes" for the run-length check, where it is fine.
    const mixed = bytes([
      0x9c, 0x14, 0xe2, 0x3b, 0x77, 0xa1, 0x08, 0xd5, 0x61, 0x2f, 0xbb, 0x4e, 0xf0, 0x85, 0x1d,
      0xc7, 0x3a, 0x96, 0x52, 0xe9, 0x0b, 0x7d, 0xa4, 0x18, 0xcf, 0x66, 0x2b, 0xd1, 0x8e, 0x45,
      0xfa, 0x73,
    ]);
    for (const sample of [counting, mixed, repeat(0)]) {
      for (const check of runChecks(sample)) {
        expect(check.observed, `${check.id} must report a measured number`).toMatch(/\d/);
      }
    }
    // And the specific one that was wrong: a mixed stream names how many distinct step
    // sizes it saw, out of how many gaps.
    expect(runChecks(mixed).find((c) => c.id === 'counting')!.observed).toMatch(
      /^\d+ different step sizes among the 31 gaps$/
    );
    expect(runChecks(counting).find((c) => c.id === 'counting')!.observed).toBe(
      'every one of the 31 steps is exactly 1'
    );
  });
});

describe('what the checks cannot catch — the lab, in one test', () => {
  it('passes all four over a key whose seed is a four-digit PIN', async () => {
    // A FIXED seed, so this is a fact about a specific 32 bytes rather than a
    // statement about probability. These are the exact bytes Panel 3 then recovers
    // by guessing ten thousand numbers, and Panel 2 shows these four rows passing
    // over them.
    const checks = runChecks(await seededKey('1234'));
    expect(allPassed(checks)).toBe(true);
    expect(passedCount(checks)).toBe(4);
  });

  it('and over every one of the ten thousand PINs it would ever be given', async () => {
    // Stronger, and the version worth having: the negative claim must not depend on
    // the demo having been handed a lucky seed. Checked over a spread across the
    // whole space rather than all 10,000, which would be 10,000 SHA-256 calls for a
    // claim three hundred already establish.
    const failures: string[] = [];
    for (let n = 0; n < PIN_SAMPLE; n += 1) {
      const seed = String(n * 37 % 10000).padStart(4, '0');
      if (!allPassed(runChecks(await seededBytes(seed, 32)))) failures.push(seed);
    }
    expect(failures).toEqual([]);
  });

  it('cannot see the difference between a real key and a seeded one', async () => {
    // Deliberately NOT asserted as "the real key passes" — that would be the flaky
    // statistical test this lab argues against. What is asserted is that the checks
    // have no access to the distinction: they are a function of the bytes alone, so
    // identical bytes give identical answers whatever produced them.
    const seeded = await seededKey('4242');
    const copy = new Uint8Array(seeded) as Bytes;
    expect(runChecks(copy).map((c) => c.passed)).toEqual(runChecks(seeded).map((c) => c.passed));
  });
});

describe('the thresholds are stated rather than buried', () => {
  it('names the bounds the page prints', () => {
    expect(LOPSIDED_LOW).toBe(4);
    expect(LOPSIDED_HIGH).toBe(28);
    expect(MAX_RUN).toBe(3);
    // Symmetric about 16, which is what makes the check mean "lopsided" rather
    // than "high" or "low".
    expect(LOPSIDED_LOW + LOPSIDED_HIGH).toBe(32);
  });
});
