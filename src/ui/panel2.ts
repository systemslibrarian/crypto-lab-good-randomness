/*
 * Panel 2 — two keys, and no way to tell them apart.
 *
 * THIS IS THE PANEL THAT DOES THE WORK, and the build brief is explicit about how it
 * must look: "the two outputs side by side, visually indistinguishable, both passing
 * the reader's own checks, neither marked. No colour until panel 3 resolves which was
 * which. Painting the seeded one red in panel 2 would give the game away and destroy
 * the lesson, which is precisely that you cannot see it."
 *
 * So the two columns are the same component with the same styling and the same four
 * rows, and the panel's verdict ships in the `neutral` tone — a tone that exists in
 * this lab for exactly this one rendering. The labels are NOT hidden: a reader can
 * read which column came from where, and still cannot read the difference. That is a
 * sharper lesson than anonymising them would be, because it removes the suspicion
 * that the trick was in the presentation.
 *
 * THE RE-RENDER IS THE MECHANISM. `renderLookRandom` is called again by Panel 3 once
 * the search has recovered the key, and it then paints `alarm` and marks the columns.
 * The thing you could not read becomes readable only after something else told you
 * the answer, which is what the whole page is about.
 *
 * THE OBVIOUSLY BROKEN GENERATOR IS NOT A FLOURISH. Without it a reader has no reason
 * to believe the four checks do anything at all, and the panel's argument collapses
 * into "some checks were run and said nothing". With it the same four rows are seen
 * catching something, so their silence beside the seeded column is informative rather
 * than merely unhelpful. It is also the only state in which a check reports FAIL, which
 * is why the mutation that hard-wires a check to pass is caught here.
 */
import { allPassed, passedCount, runChecks } from '../crypto/looksRandom';
import { realKey } from '../crypto/real';
import { PIN_DIGITS, PIN_SPACE, seededKey } from '../crypto/seeded';
import { seal } from '../crypto/cipher';
import { toGroupedHex } from '../crypto/bytes';
import type { Bytes } from '../crypto/types';
import { CANDIDATE_PINS, basis, state } from './state';
import { byId, copyButton, el, fill } from './dom';
import { checkRows } from './checkRows';
import { question, tick, warn } from './icons';
import { render, slot } from './verdict';
import { settled } from './settle';

/** The obviously broken generator: a counter, which is a real thing people ship. */
const BROKEN_LABEL = 'a counter, starting at zero';
const brokenBytes = (): Bytes => new Uint8Array(Array.from({ length: 32 }, (_, i) => i)) as Bytes;

/**
 * Icon AND text AND colour for each mark (WCAG 1.4.1).
 *
 * `pending` takes the question mark rather than a tick, because "not searched yet"
 * establishes nothing and must not read as a clean bill of health — which is exactly
 * what it did when this column borrowed its neighbour's result.
 */
const MARK_GLYPH: Record<MarkKind, () => SVGElement> = {
  recovered: warn,
  untouched: tick,
  pending: question,
};

/** One of the four candidate PINs, chosen by the real source. */
function choosePin(): string {
  const pick = realKey()[0]! % CANDIDATE_PINS.length;
  return CANDIDATE_PINS[pick]!;
}

/**
 * One column: a key, its four rows, and nothing that distinguishes it from the other.
 *
 * `mark` is null while the panel is the trap, and becomes a word once Panel 3 has
 * resolved it. It is a WORD and a glyph as well as a tint, because `neutral` is defined
 * by the absence of colour and a reader who cannot see colour must get the whole
 * distinction from the text (WCAG 1.4.1).
 */
type MarkKind = 'recovered' | 'untouched' | 'pending';
interface Mark {
  readonly word: string;
  readonly kind: MarkKind;
}

function column(opts: {
  readonly id: string;
  readonly title: string;
  readonly where: string;
  readonly bytes: Bytes;
  readonly mark: Mark | null;
}): HTMLElement {
  const checks = runChecks(opts.bytes);
  const hex = toGroupedHex(opts.bytes);
  return el(
    'div',
    {
      class: `key-col${opts.mark ? ` key-col-${opts.mark.kind}` : ''}`,
      'data-col': opts.id,
      'data-passed': passedCount(checks),
    },
    [
      el('h4', { class: 'key-col-title' }, [opts.title]),
      el('p', { class: 'key-col-where' }, [opts.where]),
      ...(opts.mark
        ? [
            el('p', { class: `key-col-mark key-col-mark-${opts.mark.kind}` }, [
              MARK_GLYPH[opts.mark.kind](),
              el('span', {}, [opts.mark.word]),
            ]),
          ]
        : []),
      el('p', { class: 'key-col-key' }, [
        el('span', { class: 'key-col-key-label' }, ['The 32 bytes it produced']),
        el('code', { class: 'key-col-key-code' }, [hex]),
      ]),
      el('p', { class: 'key-col-count' }, [
        `${passedCount(checks)} of ${checks.length} checks passed`,
      ]),
      checkRows(checks, opts.title),
      el('div', { class: 'controls' }, [copyButton('Copy these bytes', () => hex)]),
    ]
  );
}

export function mountPanel2(): void {
  const out = byId('p2-out');
  const guessOut = byId('p2-which-out');
  const brokenOut = byId('p2-broken-out');

  slot('look-random', out, basis.lookRandom, 'Make two keys again.');
  slot('visible-pattern', brokenOut, basis.visiblePattern, 'Run the checks again.');

  byId('make-keys').addEventListener('click', () => {
    void makeKeys();
  });

  byId('check-broken').addEventListener('click', () => {
    const bytes = brokenBytes();
    const checks = runChecks(bytes);
    const failed = checks.length - passedCount(checks);
    render(
      'visible-pattern',
      failed > 0
        ? {
            marker: 'visible-pattern',
            tone: 'held',
            glyph: 'held',
            headline: `CAUGHT — ${failed} OF ${checks.length} CHECKS FAILED`,
            detail: [
              `This generator is ${BROKEN_LABEL}. It is not a straw man: counters really ` +
                'do get used as a source of "random" values, usually by accident.',
              `So the checks work \u2014 they catch a visible pattern and say which pattern. ` +
                `Notice what else happened: this generator still PASSED ` +
                `${passedCount(checks)} of the ${checks.length}. A check passing has never ` +
                'meant very much. Now look again at what all four of them said about the two ' +
                'columns above.',
            ],
          }
        : {
            marker: 'visible-pattern',
            tone: 'alarm',
            glyph: 'warn',
            headline: `MISSED — ALL ${checks.length} CHECKS PASSED`,
            detail: [
              `Every check passed a generator that is ${BROKEN_LABEL}, which it should not. ` +
                'At least one of these checks is not looking at what it claims to. Nothing ' +
                'this panel says above can be relied on.',
            ],
          },
      [
        el('p', { class: 'key-col-key' }, [
          el('span', { class: 'key-col-key-label' }, ['The 32 bytes it produced']),
          el('code', { class: 'key-col-key-code' }, [toGroupedHex(bytes)]),
        ]),
        checkRows(checks, 'A counter'),
      ]
    );
    settled();
  });

  async function makeKeys(): Promise<void> {
    const pin = choosePin();
    const seededBytesValue = await seededKey(pin);
    const realBytesValue = realKey();

    state.pin = pin;
    state.keys = {
      real: { source: 'real', bytes: realBytesValue, seed: null },
      seeded: { source: 'seeded', bytes: seededBytesValue, seed: pin },
    };
    // Step 3 searches these, so they are sealed here, under the keys the reader is
    // looking at. Sealing them in Step 3 instead would let the two panels drift apart.
    state.sealedSeeded = await seal(seededBytesValue, 'seeded', state.secret);
    state.sealedReal = await seal(realBytesValue, 'real', state.secret);
    // BOTH results are cleared, not just Source B's. A new pair means both searches
    // are about keys that no longer exist, and a Source A result that survived the
    // regeneration would be the same lie in slower motion.
    state.recovered = null;
    state.realSearch = null;

    fill(guessOut);
    renderLookRandom();
    settled();
  }

  /**
   * The panel's own verdict: neutral while it is the trap, `alarm` once Panel 3 has
   * resolved it.
   *
   * Exported through `refreshPanel2` so Panel 3 can call it. The alternative — Panel 3
   * reaching into this panel's DOM — would put the page's central teaching mechanism in
   * two files and leave neither of them owning it.
   */
  function renderLookRandom(): void {
    const keys = state.keys;
    if (!keys) return;
    const realChecks = runChecks(keys.real.bytes);
    const seededChecks = runChecks(keys.seeded.bytes);
    const bothPass = allPassed(realChecks) && allPassed(seededChecks);

    /*
     * EACH COLUMN REPORTS ITS OWN EXPERIMENT, and this is the part that was wrong.
     *
     * A single `resolved` flag — "Source B has been recovered" — used to drive BOTH
     * marks, so recovering Source B stamped Source A with "Ten thousand guesses found
     * nothing here" when no search against Source A had run. The page announced the
     * outcome of an experiment it had not performed. In this lab of all labs that is
     * the worst available defect: the whole argument is that a check which has not
     * looked must not read like a check that looked and found nothing.
     *
     * So a column is marked only by its own result. A column whose search has not run
     * says NOT SEARCHED YET, and only once its neighbour has a result — before that,
     * neither is marked at all, which is the trap the build brief requires.
     */
    const bMark: Mark | null = state.recovered
      ? { word: `Recovered — the PIN was ${state.recovered.seed}`, kind: 'recovered' }
      : null;
    const aMark: Mark | null = state.realSearch
      ? state.realSearch.found
        ? { word: `Recovered — the PIN was ${state.realSearch.found.seed}`, kind: 'recovered' }
        : {
            word: `${state.realSearch.tried.toLocaleString('en-GB')} guesses found nothing here`,
            kind: 'untouched',
          }
      : null;
    const eitherSearched = bMark !== null || aMark !== null;
    const pending: Mark = { word: 'Not searched yet', kind: 'pending' };

    const columns = el('div', { class: 'key-cols' }, [
      column({
        id: 'real',
        title: 'Source A',
        where: 'The browser’s own random source',
        bytes: keys.real.bytes,
        mark: aMark ?? (eitherSearched ? pending : null),
      }),
      column({
        id: 'seeded',
        title: 'Source B',
        where: `A real stream cipher, started from a ${PIN_DIGITS}-digit PIN`,
        bytes: keys.seeded.bytes,
        mark: bMark ?? (eitherSearched ? pending : null),
      }),
    ]);

    const neutralDetail = [
      // NAMED, NOT POSITIONAL. This said "the left one" and "the right one" until the
      // phone rendering was looked at: below 640px the two columns stack, so "left" was
      // simply wrong for every reader on a phone. The columns carry their names in
      // their own headings, so the names are what the prose uses.
      'Two keys, 32 bytes each. Source A came from the browser’s own random source. ' +
        `Source B came from a real stream cipher started from a ${PIN_DIGITS}-digit PIN ` +
        '— one of four, shown in Step 3, picked without telling you which.',
      bothPass
        ? 'Both passed all four checks. Read them side by side for as long as you like: ' +
          'nothing in either column tells you which is which, and no check of how the ' +
          'bytes LOOK is going to.'
        : 'Read the rows side by side. Whatever they say, notice what they are NOT able to ' +
          'tell you: which of these two a stranger could work out.',
      'Looking random is not evidence of anything. Step 3 is where that stops being an ' +
        'assertion — and the check that does work there is not a check of the bytes at ' +
        'all. It is trying the starting points.',
    ];

    /*
     * Built lazily, for two reasons.
     *
     * The first is a bug this file already had: an eagerly-evaluated array reads
     * `state.recovered!.seed` whichever branch is taken, which threw on the very first
     * render and left Panel 2 blank with no verdict at all. The non-null assertion was
     * the tell — true inside the branch that uses the value, false everywhere else,
     * and an array literal is not a branch.
     *
     * The second is the point of this whole rewrite: WHAT THIS SAYS DEPENDS ON WHICH
     * SEARCHES HAVE ACTUALLY RUN. It must never describe one that has not.
     */
    const searchDetail = (): string[] => {
      const out: string[] = [];
      if (state.recovered) {
        out.push(
          `Source B’s key was rebuilt from the PIN ${state.recovered.seed}, out of ` +
            `${PIN_SPACE.toLocaleString('en-GB')} four-digit PINs.`
        );
      }
      if (state.realSearch && !state.realSearch.found) {
        out.push(
          `The same search ran against Source A — the same ` +
            `${state.realSearch.tried.toLocaleString('en-GB')} candidates, the same work — ` +
            'and nothing opened it.'
        );
      } else if (state.realSearch?.found) {
        out.push(
          'A candidate PIN opened Source A, which should be impossible. Something in this ' +
            'build is wrong; see Step 3.'
        );
      } else {
        out.push(
          'Source A has NOT been searched yet, so nothing on this page has established ' +
            'anything about it. Run the same search against it in Step 3 to finish the ' +
            'comparison.'
        );
      }
      out.push(
        bothPass
          ? 'Both columns passed all four checks before any of that happened, and they ' +
            'still do. Nothing about the bytes changed; the only thing that changed is ' +
            'that you now know. The marks on this panel were put there by Step 3, not by ' +
            'the checks.'
          : 'The checks said what they said before any of that happened, and they still ' +
            'do. The marks on this panel were put there by Step 3, not by the checks.'
      );
      return out;
    };

    /*
     * The ALARM belongs to Source B being recovered, and to nothing else.
     *
     * Searching Source A and finding nothing is not an alarm — it is the calm half of
     * the comparison — so a reader who runs Step 3 in the other order sees Source A's
     * real result on a panel that is still neutral, because nothing alarming has been
     * shown yet. The tone tracks what was demonstrated, not how many buttons were
     * pressed.
     */
    render(
      'look-random',
      state.recovered !== null
        ? {
            marker: 'look-random',
            tone: 'alarm',
            glyph: 'warn',
            headline: 'ONE OF THESE WAS GUESSABLE',
            detail: searchDetail(),
          }
        : state.realSearch !== null
          ? {
              marker: 'look-random',
              tone: 'neutral',
              glyph: 'question',
              headline: 'SOURCE A HELD — AND THAT SETTLES NOTHING',
              detail: [
                `${state.realSearch.tried.toLocaleString('en-GB')} candidate PINs were ` +
                  'tried against Source A and none of them opened it. That is one source ' +
                  'ruled out, and it says nothing whatever about the other.',
                'Source B has not been searched yet. Until it has, this panel is still ' +
                  'exactly what it was: two keys you cannot tell apart by looking.',
              ],
            }
          : {
            marker: 'look-random',
            tone: 'neutral',
            glyph: 'question',
            headline: bothPass
              ? `BOTH PASSED ALL ${realChecks.length} CHECKS`
              : 'THE CHECKS HAVE REPORTED',
            detail: neutralDetail,
          },
      [columns, whichIsWhich()]
    );
  }

  /**
   * "Which one is which?" — a guess with a one-in-two chance, and the page says so.
   *
   * It is here because a reader who commits to an answer and finds out they were
   * guessing has learnt the panel's lesson in a way that reading it cannot teach. The
   * honest note is the point: being right means nothing, and the page refuses to
   * congratulate.
   */
  function whichIsWhich(): HTMLElement {
    const host = el('div', { class: 'which-wrap' }, [
      el('h4', { class: 'sub-head sub-head-tight' }, ['Which one is guessable?']),
      el('p', { class: 'sub-lede' }, [
        'Commit to an answer before you read on. There is no score and nothing is recorded.',
      ]),
      el(
        'ul',
        { class: 'check-opts', role: 'list' },
        (['real', 'seeded'] as const).map((which) =>
          el('li', { role: 'listitem' }, [
            (() => {
              const btn = el('button', { type: 'button', class: 'check-opt' }, [
                which === 'real' ? 'Source A is the guessable one' : 'Source B is the guessable one',
              ]);
              btn.addEventListener('click', () => answerWhich(which));
              return btn;
            })(),
          ])
        )
      ),
    ]);
    host.append(guessOut);
    return host;
  }

  function answerWhich(which: 'real' | 'seeded'): void {
    const right = which === 'seeded';
    guessOut.className = `check-result ${right ? 'pill-ok' : 'pill-bad'}`;
    fill(
      guessOut,
      el('span', { class: 'pill-head' }, [
        right ? tick() : question(),
        el('span', {}, [
          right ? 'You read the label, not the bytes' : 'Wrong — and the label said so',
        ]),
      ]),
      el('span', { class: 'pill-why' }, [
        right
          ? 'Source B is the seeded one, and the heading above it says so: this was not a ' +
            'blind test. That is the question worth sitting with — could the BYTES alone ' +
            'have told you? Cover the two headings and nothing in either column separates ' +
            'them. Real keys arrive without headings.'
          : 'Source B is the seeded one, and its heading says so — so this was not even a ' +
            'guess from the bytes. Worth noticing how little getting it wrong costs you: ' +
            'the two columns pass the same checks, so there was never anything in them to ' +
            'read. Real keys arrive without headings.',
      ])
    );
  }

  refresh = renderLookRandom;
}

/**
 * Re-render Panel 2.
 *
 * Panel 3 calls this the moment the search succeeds. Assigned at mount rather than
 * exported directly because the renderer closes over this panel's own host elements,
 * and handing Panel 3 a selector instead would put the page's central mechanism in
 * two places.
 */
let refresh: (() => void) | null = null;
export const refreshPanel2 = (): void => refresh?.();
