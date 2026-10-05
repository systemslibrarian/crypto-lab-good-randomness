/*
 * The pinned known-answer vectors, typed.
 *
 * WHY THEY EXIST AT ALL. Everything else in this repository is the lab agreeing
 * with itself, and a hand-rolled cipher that agrees with itself is worth nothing:
 * a build with the block function's final word-wise addition dropped is still
 * deterministic, still produces output nobody could distinguish by eye, and is
 * not ChaCha20. These are the only numbers here that come from outside.
 *
 * WHY THE DATA IS IN JSON. `scripts/check-vectors.mjs` re-derives every value
 * with Node's OpenSSL ChaCha20 — an independent implementation sharing not one
 * line with this repo — and reading the same file means there is no parser
 * between the two. An earlier draft of that script regex-matched these cases out
 * of TypeScript source; a parser that quietly matches fewer cases than exist is
 * how a check becomes decoration.
 *
 * WHAT THE CHECK PROVES, exactly: that every committed value is a correct
 * ChaCha20 answer for its committed inputs. It is not the RFC — the RFC is where
 * the numbers were read from, and `where` on each case says which section. What
 * it rules out is a bad transcription, and it earned its place immediately: the
 * tail of Appendix A.1 vector 4 was wrong from offset 44 when this file was
 * first written.
 */
import data from './vectors.json';

export interface BlockCase {
  readonly label: string;
  readonly where: string;
  readonly why: string;
  readonly keyHex: string;
  readonly counter: number;
  readonly nonceHex: string;
  readonly expectHex: string;
}

export interface StreamCase extends Omit<BlockCase, 'expectHex'> {
  readonly plaintext: string;
  readonly expectHex: string;
}

export interface DifferCase extends Omit<BlockCase, 'expectHex'> {
  /** The published answer this derived case must NOT reproduce. */
  readonly mustNotEqualHex: string;
}

export const BLOCK_CASES = data.blockCases as readonly BlockCase[];
export const STREAM_CASES = data.streamCases as readonly StreamCase[];

/**
 * This lab's own additions, labelled as such on the page and never attributed to
 * the RFC.
 *
 * A "must match" case can be passed by an implementation that ignores one of its
 * three inputs: an implementation ignoring the nonce reproduces every Appendix
 * A.1 vector whose nonce is zero, which is four of the five. These three take the
 * §2.3.2 case and change exactly one input, and require the answer to CHANGE.
 * They are the half with teeth.
 */
export const MUST_DIFFER = data.mustDiffer as readonly DifferCase[];

/** Where the published numbers came from, as the page states it. */
export const VECTOR_SOURCE = data.source as {
  readonly name: string;
  readonly url: string;
  readonly detail: string;
};

export const PUBLISHED_CASE_COUNT = BLOCK_CASES.length + STREAM_CASES.length;
export const DERIVED_CASE_COUNT = MUST_DIFFER.length;
export const PINNED_CASE_COUNT = PUBLISHED_CASE_COUNT + DERIVED_CASE_COUNT;
