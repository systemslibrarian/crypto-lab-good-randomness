/*
 * The pinned run as the page performs it.
 *
 * `chacha20.test.ts` already checks the cipher against the vectors. This checks the
 * REPORTING layer the page reads, which is a different thing and has its own way of
 * going wrong: a run that counted a disagreement as agreement, or that folded this
 * lab's three derived cases into the published count, would leave the panel printing
 * a number nobody could challenge.
 */
import { describe, expect, it } from 'vitest';
import { EXPECTED_CASE_COUNT, runPinned } from './pinned';
import { BLOCK_CASES, MUST_DIFFER, PUBLISHED_CASE_COUNT, STREAM_CASES } from './vectors';

describe('the pinned run', () => {
  const run = runPinned();

  it('runs every case and agrees with all of them', () => {
    expect(run.total).toBe(EXPECTED_CASE_COUNT);
    expect(run.agreed).toBe(run.total);
    expect(run.results.every((r) => r.agreed)).toBe(true);
  });

  it('counts published and derived cases separately', () => {
    // The distinction the page prints. Collapsing it would borrow the RFC's
    // authority for three cases this lab invented.
    expect(run.published).toBe(PUBLISHED_CASE_COUNT);
    expect(run.derived).toBe(MUST_DIFFER.length);
    expect(run.published + run.derived).toBe(run.total);
    expect(run.published).toBe(BLOCK_CASES.length + STREAM_CASES.length);
  });

  it('carries both requirements, so the half with teeth cannot vanish quietly', () => {
    const mustMatch = run.results.filter((r) => r.requirement === 'must match');
    const mustDiffer = run.results.filter((r) => r.requirement === 'must differ');
    expect(mustMatch.length).toBe(PUBLISHED_CASE_COUNT);
    expect(mustDiffer.length).toBeGreaterThan(0);
    // Every must-differ row is derived, and every published row must match. If those
    // ever crossed, the panel's two columns would be describing something else.
    expect(mustDiffer.every((r) => r.kind === 'derived')).toBe(true);
    expect(mustMatch.every((r) => r.kind === 'published')).toBe(true);
  });

  it('gives every row a citation and a reason a reader can read', () => {
    for (const r of run.results) {
      expect(r.label.length).toBeGreaterThan(0);
      expect(r.where.length).toBeGreaterThan(0);
      expect(r.why.length).toBeGreaterThan(20);
      expect(r.observed.length).toBeGreaterThan(0);
    }
  });

  it('describes what it did, not what it expected', () => {
    // Every observation on a passing run says what this build produced. A row that
    // echoed the expectation back would read identically on a failing build.
    for (const r of run.results) {
      expect(r.observed).toMatch(/^(reproduced|encrypted|produced)/);
    }
  });
});
