/*
 * The attack: recover a key by guessing the seed it came from.
 *
 * WHAT THIS CODE IS ALLOWED TO SEE. The ciphertext, the nonce, and the knowledge
 * that the seed was a four-digit PIN. That is all a stranger has, and it is all
 * that is passed in. Nothing here is handed the real key or the real seed, and
 * nothing compares a candidate against them — a search that compared candidate
 * keys to the answer would prove the loop runs and nothing else. The only oracle
 * is the one a stranger genuinely has: AES-GCM's authentication tag, which
 * refuses a wrong key and accepts the right one.
 *
 * That is why this file is the honest version of the attack and why
 * `recover.test.ts` is the test the build brief calls the real one. It also means
 * the SAME CODE, run against a key from `crypto.getRandomValues`, exhausts every
 * candidate and finds nothing — not because it was told to fail, but because
 * there is nothing in the space to find. Both panels in Panel 3 call this one
 * function.
 *
 * ON COUNTING OUT LOUD. Guessability is reported as a number of TRIES, never as
 * a quantity of entropy: ten thousand is arithmetic a reader can hold, and 13.3
 * bits is a number that has to be explained before it means anything. The
 * progress callback exists so the page can count while it works, and the elapsed
 * time is reported because the honest headline is not "it was possible" but "it
 * took less time than reading this sentence".
 *
 * ON STOPPING, WHICH IS TWO DIFFERENT QUESTIONS. A stranger stops the moment the
 * message opens, and `stopAtFirstHit` (the default) is that behaviour: it answers
 * "what did this cost the attacker". The page asks the other question — "what
 * does the whole space cost" — and passes `stopAtFirstHit: false`, which tests
 * every candidate and reports the first hit alongside the full count. Without
 * that option a PIN of 0000 would be found on try 1 and the page would print a
 * number that undersells the point by four orders of magnitude; with it the page
 * states both figures and says which is which. Rigging the PIN away from 0000 to
 * make the demo read better was the other option, and it would have been a lie.
 */
import { unseal } from './cipher';
import { PIN_SPACE, pinSeed, seededKey } from './seeded';
import type { Bytes, Sealed } from './types';

export interface Found {
  readonly seed: string;
  readonly keyBytes: Bytes;
  readonly plaintext: string;
  /** Which try it was. A reader asked to believe "ten thousand" wants the number. */
  readonly onTry: number;
}

export interface SearchOutcome {
  readonly found: Found | null;
  /** How many candidates were actually tested. */
  readonly tried: number;
  /** How many there were to test. */
  readonly total: number;
  readonly elapsedMs: number;
}

/** Called as the search runs, so the page can count. */
export type OnProgress = (tried: number, total: number) => void;

export interface SearchOptions {
  readonly onProgress?: OnProgress;
  /**
   * Stop the moment a candidate opens the message.
   *
   * True is the attacker's behaviour and the default. False tests every candidate
   * and still reports the first hit, which is what the page needs to state the
   * cost of the whole space rather than the cost of one lucky PIN.
   */
  readonly stopAtFirstHit?: boolean;
}

/**
 * How many candidates to test between yields to the event loop.
 *
 * Without a yield the whole search runs inside one task and the counter never
 * paints: the reader sees a frozen page and then an answer, which teaches that
 * the attack is instant magic rather than ten thousand ordinary attempts. With a
 * yield per candidate the overhead dominates the search. 250 is slow enough to
 * see and fast enough that the whole space goes by in well under a second on the
 * machines this will run on.
 */
const CHUNK = 250;

const yieldToPaint = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * Try every four-digit PIN against this ciphertext.
 *
 * Stops at the first candidate that opens it, and says which try that was. A
 * search that ran the whole space even after finding the answer would report a
 * tidier number and would be lying about the cost: a stranger stops when the
 * message opens.
 */
export async function searchPins(
  sealed: Sealed,
  options: SearchOptions = {}
): Promise<SearchOutcome> {
  const { onProgress, stopAtFirstHit = true } = options;
  const started = performance.now();
  let found: Found | null = null;
  let tried = 0;
  for (let n = 0; n < PIN_SPACE; n += 1) {
    const seed = pinSeed(n);
    const keyBytes = await seededKey(seed);
    const plaintext = await unseal(keyBytes, sealed);
    tried = n + 1;
    if (plaintext !== null && found === null) {
      found = { seed, keyBytes, plaintext, onTry: tried };
      if (stopAtFirstHit) break;
    }
    if (tried % CHUNK === 0) {
      onProgress?.(tried, PIN_SPACE);
      await yieldToPaint();
    }
  }
  onProgress?.(tried, PIN_SPACE);
  return { found, tried, total: PIN_SPACE, elapsedMs: performance.now() - started };
}

/**
 * Try one named guess — "today's date", "the counter at 1", a particular PIN.
 *
 * Panel 3 offers this before the exhaustive search because a reader who picks a
 * guess and watches it land has caused the recovery, which is worth more than
 * watching a progress bar do it for them. A guess that misses is worth as much:
 * it is the only thing on the page that makes the exhaustive search feel like
 * work.
 */
export async function trySeed(seed: string, sealed: Sealed): Promise<Found | null> {
  const keyBytes = await seededKey(seed);
  const plaintext = await unseal(keyBytes, sealed);
  if (plaintext === null) return null;
  return { seed, keyBytes, plaintext, onTry: 1 };
}
