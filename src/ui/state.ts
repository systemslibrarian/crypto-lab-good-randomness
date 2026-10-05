/*
 * What the page is currently holding.
 *
 * All of it is in memory for the length of the visit. Nothing is written to
 * `localStorage`, nothing is sent anywhere — there is no backend — and reloading
 * the page destroys both keys and the PIN behind one of them. The only thing this
 * lab ever stores is the theme pin in index.html.
 *
 * THE PIN IS IN HERE AND THE PAGE NEVER PRINTS IT until the search finds it. That
 * is the one piece of bookkeeping this file exists for: a demo that displayed the
 * answer and then "discovered" it would be theatre. `state.pin` is written when the
 * keys are made, read by nothing but the sealing step, and the recovery panel
 * prints only what the SEARCH returned. The claims suite asserts the two agree
 * afterwards, which is the right direction: the page is checked against the answer,
 * never fed it.
 */
import type { Found } from '../crypto/recover';
import type { Roll } from '../crypto/dice';
import type { Key, Sealed } from '../crypto/types';
import { toHex } from '../crypto/bytes';

/** How many dice each roll shows. Five reads as a handful and fits 320px. */
export const DICE_PER_ROLL = 5;

/**
 * The four PINs the page's careless program picks from, and shows the reader.
 *
 * A reader who guesses from four has a one-in-four chance, and the page says so
 * rather than dressing it up — the guess exists so that the recovery is something
 * the reader CAUSED, and a rigged certainty would teach nothing. The exhaustive
 * search afterwards is where the real number is.
 *
 * All four are inside the ten thousand the search enumerates, so the two halves of
 * Panel 3 are searching the same space rather than two different ones.
 */
export const CANDIDATE_PINS = ['0000', '1234', '4321', '9999'] as const;

export interface LabState {
  /** The recipe box in Panel 1. */
  recipe: string;
  /** Panel 1's rolls from the real source, most recent last. */
  realRolls: Roll[];
  /** Panel 1's rolls from the recipe, and the recipe each was rolled under. */
  recipeRolls: { recipe: string; roll: Roll }[];
  /** Panel 2's two keys. Null until the reader asks for them. */
  keys: { real: Key; seeded: Key } | null;
  /**
   * The PIN the seeded key came from. Known to this object and to nothing that
   * renders, until the search finds it.
   */
  pin: string | null;
  /** The two messages, one under each key. */
  sealedSeeded: Sealed | null;
  sealedReal: Sealed | null;
  /** The plaintext that was sealed, so the page can say what came back is right. */
  secret: string;
  /** Which of the four candidate PINs the reader has selected to try. */
  guess: string;
  /** What the exhaustive search recovered, once it has. */
  recovered: Found | null;
}

export const state: LabState = {
  recipe: 'monday',
  realRolls: [],
  recipeRolls: [],
  keys: null,
  pin: null,
  sealedSeeded: null,
  sealedReal: null,
  secret: 'Door code 7714. Rotate it on the first of the month.',
  guess: CANDIDATE_PINS[0],
  recovered: null,
};

/** The identity of the current pair of keys, or a marker for "there are none". */
export const keysBasis = (): string =>
  state.keys ? toHex(state.keys.real.bytes) + toHex(state.keys.seeded.bytes) : 'no-keys';

/** How many times the CURRENT recipe has been rolled. */
export const rollsUnderCurrentRecipe = (): number =>
  state.recipeRolls.filter((r) => r.recipe === state.recipe).length;

/**
 * The basis for each verdict, in one place: the dependency graph of the page.
 *
 * TWO OF THESE ARE DELIBERATELY WIDER THAN THE CRYPTOGRAPHY REQUIRES, and the
 * reason is the same one that caught out the lab this pattern came from. Strictly,
 * a search's result is a fact about the ciphertext it searched, and making new keys
 * afterwards does not change it. But `recovered` and `no-seed` both QUOTE a key and
 * a message that are printed elsewhere on the page, and a reader comparing the two
 * is entitled to assume they describe the same thing. So both depend on the key
 * pair: press "make two keys" again and the recovery panel retires instead of
 * standing there green, quoting a PIN that belongs to a key no longer on screen.
 *
 * `lookRandom` depends on `recovered` as well as on the keys, which is not a
 * dependency at all in the usual sense — nothing about the two outputs changes when
 * the search succeeds. It is there because the recovery is what re-renders Panel 2
 * in colour, and routing that through the same mechanism as everything else means
 * the re-render cannot be forgotten by a later edit.
 */
export const basis = {
  diceReal: (): string => String(state.realRolls.length),
  diceRecipe: (): string => `${state.recipe}|${state.recipeRolls.length}`,
  sameAgain: (): string => `${state.recipe}|${rollsUnderCurrentRecipe()}`,
  lookRandom: (): string => `${keysBasis()}|${state.recovered?.seed ?? ''}`,
  visiblePattern: (): string => 'fixed',
  guess: (): string => `${keysBasis()}|${state.guess}`,
  recovered: (): string => keysBasis(),
  noSeed: (): string => keysBasis(),
} as const;
