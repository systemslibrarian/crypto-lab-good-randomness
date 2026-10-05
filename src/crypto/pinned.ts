/*
 * Run the pinned vectors in the reader's own browser.
 *
 * The page shows the result because a count a reader can see is worth more than a
 * count in a README: the claim "this build agrees with somebody else's numbers" is
 * being made about the code running in front of them, not about a CI run they are
 * asked to take on trust. It matters more here than in most labs, because the
 * cipher in this one is hand-rolled — a build that got it wrong would produce
 * output that passes every check in Panel 2 and every statistical instinct a
 * reader has.
 *
 * THE THREE DERIVED CASES ARE REPORTED AS DERIVED. They are this lab's own, not
 * the RFC's, and the row says so. A panel that silently folded three of its own
 * cases into a published count would be inflating somebody else's authority, which
 * is a small dishonesty that happens to be the exact failure a pinned-vector
 * panel exists to prevent.
 */
import { block, keystream, xorStream } from './chacha20';
import { fromHex, toHex, utf8 } from './bytes';
import { BLOCK_CASES, MUST_DIFFER, PINNED_CASE_COUNT, STREAM_CASES } from './vectors';

export interface CaseResult {
  readonly label: string;
  readonly where: string;
  readonly why: string;
  /** 'published' rows come from the RFC; 'derived' rows are this lab's own. */
  readonly kind: 'published' | 'derived';
  /** What the case requires: reproduce the answer, or differ from it. */
  readonly requirement: 'must match' | 'must differ';
  readonly agreed: boolean;
  /** What this build actually did, so a disagreement is readable. */
  readonly observed: string;
}

export interface PinnedRun {
  readonly results: readonly CaseResult[];
  readonly agreed: number;
  readonly total: number;
  readonly published: number;
  readonly derived: number;
}

export function runPinned(): PinnedRun {
  const results: CaseResult[] = [];

  for (const c of BLOCK_CASES) {
    const got = toHex(block(fromHex(c.keyHex), c.counter, fromHex(c.nonceHex)));
    results.push({
      label: c.label,
      where: c.where,
      why: c.why,
      kind: 'published',
      requirement: 'must match',
      agreed: got === c.expectHex,
      observed:
        got === c.expectHex
          ? 'reproduced the published block exactly'
          : `produced ${got.slice(0, 16)}… where the publication says ${c.expectHex.slice(0, 16)}…`,
    });
  }

  for (const c of STREAM_CASES) {
    const got = toHex(xorStream(fromHex(c.keyHex), fromHex(c.nonceHex), utf8(c.plaintext), c.counter));
    results.push({
      label: c.label,
      where: c.where,
      why: c.why,
      kind: 'published',
      requirement: 'must match',
      agreed: got === c.expectHex,
      observed:
        got === c.expectHex
          ? `encrypted all ${utf8(c.plaintext).length} bytes to the published ciphertext`
          : `produced ${got.slice(0, 16)}… where the publication says ${c.expectHex.slice(0, 16)}…`,
    });
  }

  for (const c of MUST_DIFFER) {
    const got = toHex(
      keystream(fromHex(c.keyHex), fromHex(c.nonceHex), c.mustNotEqualHex.length / 2, c.counter)
    );
    const differs = got !== c.mustNotEqualHex;
    results.push({
      label: c.label,
      where: c.where,
      why: c.why,
      kind: 'derived',
      requirement: 'must differ',
      agreed: differs,
      observed: differs
        ? 'produced a different answer, so this input is not being ignored'
        : 'produced the published answer anyway, so this input is being IGNORED',
    });
  }

  return {
    results,
    agreed: results.filter((r) => r.agreed).length,
    total: results.length,
    published: results.filter((r) => r.kind === 'published').length,
    derived: results.filter((r) => r.kind === 'derived').length,
  };
}

/** Declared separately so a lost case is a failure rather than a smaller number. */
export const EXPECTED_CASE_COUNT = PINNED_CASE_COUNT;
