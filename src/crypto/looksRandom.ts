/*
 * The checks a reader would think to apply, applied.
 *
 * THIS FILE IS THE TRAP, AND IT IS A HONEST TRAP. Every check below really runs,
 * really reports what it measured, and really catches a broken generator. None
 * of them can tell the browser's own source from a stream started at a four-digit
 * PIN, because no check of the OUTPUT can: the output of a real stream cipher is
 * indistinguishable from random to anybody who does not hold the key. The panel
 * that runs these is the panel that does the lab's work.
 *
 * WHY THESE FOUR. They are the ones a beginner actually reaches for — is it all
 * the same, is it counting, does anything repeat, is it lopsided — rather than
 * the ones a statistician would. A lab that presented a chi-squared test here
 * would be teaching that the right answer is a better test, which is the
 * misconception §4.1d's negative claim exists to break.
 *
 * ON FALSE FAILURES, WHICH ARE REAL AND ARE NOT HIDDEN. A genuinely random draw
 * can fail a check, because that is what random means. Each threshold below is
 * chosen so the chance is small enough to state:
 *
 *   all-the-same      2^-248        never, in practice
 *   just-counting     2^-240        never, in practice
 *   four-in-a-row     about 1.7e-6  roughly 1 draw in 600,000
 *   lopsided          about 2.6e-6  roughly 1 draw in 380,000
 *
 * So about one draw in two hundred thousand from the real source will fail one of
 * these. THE PAGE DOES NOT TREAT THAT AS A FAULT and does not paint it as one: a
 * fair coin that comes up heads nine times out of ten is still a fair coin, and a
 * reader who meets that rendering has met the most useful thing on the page by
 * accident. See `src/ui/panel2.ts` for how it is worded, and `real.test.ts` for
 * why the real source is asserted structurally and never statistically.
 */
import type { Bytes } from './types';

export interface Check {
  /** Stable id. The claims suite and the mutation records both use these. */
  readonly id: 'all-same' | 'counting' | 'four-in-a-row' | 'lopsided';
  /** What a reader would call it. */
  readonly name: string;
  /** The question being asked, in plain language. */
  readonly question: string;
  readonly passed: boolean;
  /** What was actually measured, so the page can print it rather than assert it. */
  readonly observed: string;
}

/** The longest run of one repeated value. */
function longestRun(bytes: Bytes): { length: number; value: number } {
  let best = { length: bytes.length > 0 ? 1 : 0, value: bytes[0] ?? 0 };
  let run = 1;
  for (let i = 1; i < bytes.length; i += 1) {
    run = bytes[i] === bytes[i - 1] ? run + 1 : 1;
    if (run > best.length) best = { length: run, value: bytes[i]! };
  }
  return best;
}

/** How many bytes land in the upper half of the range, 128 to 255. */
const countHigh = (bytes: Bytes): number => bytes.reduce((n, b) => n + (b >= 128 ? 1 : 0), 0);

/**
 * The gaps between consecutive bytes, as wrapped steps.
 *
 * `distinct` is returned as well as the verdict so a PASSING row has a number to
 * print. Every other row prints what it measured; this one used to pass with "the
 * steps between neighbours vary", which is a conclusion rather than a measurement
 * and is the kind of row a hard-wired check could hide behind.
 */
function stepSummary(bytes: Bytes): { constant: boolean; step: number; distinct: number } {
  const steps: number[] = [];
  for (let i = 1; i < bytes.length; i += 1) steps.push((bytes[i]! - bytes[i - 1]! + 256) % 256);
  const distinct = new Set(steps).size;
  if (steps.length < 2) return { constant: false, step: steps[0] ?? 0, distinct };
  return { constant: distinct === 1, step: steps[0]!, distinct };
}

/** The number of distinct values present, which several observations report. */
const distinct = (bytes: Bytes): number => new Set(bytes).size;

/** The bounds of the lopsided check, named so the page can print them. */
export const LOPSIDED_LOW = 4;
export const LOPSIDED_HIGH = 28;

/** The run length the third check refuses. */
export const MAX_RUN = 3;

/**
 * Run all four checks over one output.
 *
 * Returned in a fixed order so the page's two columns line up row for row — the
 * whole visual argument of Panel 2 is that the two columns read identically, and
 * a differently-ordered list would do that work by accident rather than on
 * purpose.
 */
export function runChecks(bytes: Bytes): readonly Check[] {
  const run = longestRun(bytes);
  const high = countHigh(bytes);
  const steps = stepSummary(bytes);
  const values = distinct(bytes);

  return [
    {
      id: 'all-same',
      name: 'Not all the same',
      question: 'Is it just one number over and over?',
      passed: values > 1,
      observed:
        values > 1
          ? `${values} different values among the ${bytes.length} bytes`
          : `every one of the ${bytes.length} bytes is ${bytes[0] ?? 0}`,
    },
    {
      id: 'counting',
      name: 'Not just counting',
      question: 'Does it step up or down by the same amount every time?',
      passed: !steps.constant,
      observed: steps.constant
        ? `every one of the ${bytes.length - 1} steps is exactly ${steps.step}`
        : `${steps.distinct} different step sizes among the ${bytes.length - 1} gaps`,
    },
    {
      id: 'four-in-a-row',
      name: `No value more than ${MAX_RUN} times in a row`,
      question: 'Does the same number repeat in a block?',
      passed: run.length <= MAX_RUN,
      observed:
        run.length <= MAX_RUN
          ? `longest run is ${run.length}`
          : `the value ${run.value} appears ${run.length} times in a row`,
    },
    {
      id: 'lopsided',
      name: 'Not lopsided',
      question: 'Are roughly half the bytes in the top half of the range?',
      passed: high >= LOPSIDED_LOW && high <= LOPSIDED_HIGH,
      observed: `${high} of ${bytes.length} bytes are 128 or above`,
    },
  ];
}

export const passedCount = (checks: readonly Check[]): number =>
  checks.filter((c) => c.passed).length;

export const allPassed = (checks: readonly Check[]): boolean => checks.every((c) => c.passed);
