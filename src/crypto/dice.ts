/*
 * Dice, from bytes.
 *
 * Panel 1 rolls dice because a die is the one random source everybody already
 * trusts, and because it makes the lab's first claim without a definition: you
 * cannot guess the next face, and the reason is physics rather than mathematics.
 *
 * REJECTION SAMPLING, AND WHY IT IS NOT A DETAIL. `byte % 6` is the obvious way
 * to get a face from a byte and it is biased: 256 is not a multiple of 6, so the
 * values 0 to 3 arrive 43 times and the values 4 and 5 arrive 42 times out of
 * every 256. On one roll nobody could see it; over many it is a real lean, and a
 * lab about good randomness that quietly shipped a biased die would be teaching
 * the opposite of its own lesson in the first panel. So bytes of 252 and above
 * are discarded and another is drawn — 252 is 42 times 6 — and the panel reports
 * how many were discarded, because a reader who sees "two bytes thrown away"
 * learns something a correct-but-silent implementation would have hidden.
 *
 * The same function serves both sources. That is the point: a die rolled from the
 * seeded stream looks exactly like a die rolled from the real one, and rolling
 * the seeded one twice gives the same dice twice.
 */
import type { Bytes } from './types';

export const DIE_FACES = 6;
/** The largest multiple of 6 at or below 256. Bytes at or above this are discarded. */
export const REJECT_AT = 252;

export interface Roll {
  readonly faces: readonly number[];
  /** How many bytes were consumed in total, including the discarded ones. */
  readonly bytesUsed: number;
  /** How many were discarded to keep every face equally likely. */
  readonly discarded: number;
}

/**
 * Roll `count` dice from a byte supply.
 *
 * `supply` is called for one byte at a time rather than handed a buffer, because
 * the number of bytes needed is not known in advance — that is what rejection
 * sampling means — and a caller that pre-allocated "enough" would be making a
 * probabilistic guess in a function whose whole purpose is not to.
 */
export function rollDice(count: number, supply: () => number): Roll {
  const faces: number[] = [];
  let bytesUsed = 0;
  let discarded = 0;
  while (faces.length < count) {
    const b = supply();
    bytesUsed += 1;
    if (b >= REJECT_AT) {
      discarded += 1;
      continue;
    }
    faces.push((b % DIE_FACES) + 1);
  }
  return { faces, bytesUsed, discarded };
}

/**
 * A byte supply that reads through a fixed buffer, and says so when it runs out.
 *
 * Running out is not hypothetical: rejection sampling has no upper bound on how
 * many bytes it may consume, so a buffer sized for the expected case can be
 * exhausted. Throwing names the cause; silently wrapping around to the start
 * would make a seeded roll repeat inside itself, which is a defect that would
 * look like a result on this particular page.
 */
export function supplyFrom(bytes: Bytes): () => number {
  let i = 0;
  return () => {
    if (i >= bytes.length) {
      throw new Error(
        `ran out of bytes after ${bytes.length}; rejection sampling has no fixed budget`
      );
    }
    const b = bytes[i]!;
    i += 1;
    return b;
  };
}
