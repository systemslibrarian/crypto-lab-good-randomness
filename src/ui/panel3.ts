/*
 * Panel 3 — guess the seed, take the key.
 *
 * WHAT MAKES THIS A RESULT RATHER THAN A DEMONSTRATION. The search is handed the
 * sealed message and nothing else: not the key, not the PIN, not the plaintext. It
 * recovers the key by asking ten thousand times "does this open it", which is exactly
 * what a stranger holding the ciphertext can do. Nothing here compares a candidate
 * against the answer — see `src/crypto/recover.ts` — so what the panel prints is what
 * the search found, and `e2e/claims.spec.ts` checks it against the PIN afterwards
 * rather than the page being fed it.
 *
 * THE TWO HALVES RUN THE SAME CODE. One call, two ciphertexts: the seeded key comes
 * back in a fraction of a second and the real one does not come back at all. The second
 * half is the one that needs the care, because "it found nothing" is also what a broken
 * search produces. So it reports the number of candidates it actually tested, and the
 * page says the message still opens under the key that made it — the failure is the
 * search's, not the cipher's.
 *
 * ON THE COUNTER. Guessability is a number of TRIES, never a quantity of entropy: ten
 * thousand is arithmetic a reader can hold. The search runs the WHOLE space rather than
 * stopping at the hit, because a PIN of 0000 would otherwise be found on try 1 and the
 * headline would undersell the point by four orders of magnitude. Both numbers are
 * printed and the page says which is which.
 *
 * ON THE LIVE REGION. The ticking counter is a `progressbar` in its own element OUTSIDE
 * the verdict slots. The slots are `role="status" aria-live="polite"`, so a counter
 * inside one would announce forty times during a search — a screen reader reading "1250
 * of 10000, 1500 of 10000" over and over is worse than no progress at all.
 */
import { searchPins, trySeed } from '../crypto/recover';
import { unseal } from '../crypto/cipher';
import { PIN_SPACE } from '../crypto/seeded';
import { toGroupedHex } from '../crypto/bytes';
import { CANDIDATE_PINS, basis, state } from './state';
import { byId, disclosure, el, fill, longValue } from './dom';
import { refreshPanel2 } from './panel2';
import { render, slot } from './verdict';
import { settled } from './settle';

/**
 * The negative claim (§4.1d) — the belief a beginner most likely leaves with wrongly.
 *
 * Scoped to the construction on this page and not to the field: it is about these four
 * checks and this generator, which is what the page actually demonstrates. A sentence
 * about randomness in general would be both unprovable here and false somewhere else.
 *
 * It is rendered VISIBLY in the fixture state, never inside a disclosure, and
 * `e2e/claims.spec.ts` asserts both. Deleting this string must fail that test; a
 * mutation in `mutations/mutations.json` does exactly that and the ledger records it.
 */
export const NEGATIVE_CLAIM =
  'Passing those four checks establishes nothing about whether a generator can be ' +
  'predicted. ChaCha20’s output looks like this whether its key came from the ' +
  'operating system or from a four-digit PIN, and this page has just rebuilt one of the ' +
  'two from a number a stranger can count to.';

const fmt = (n: number): string => n.toLocaleString('en-GB');

/** Milliseconds, in words a reader does not have to convert. */
function duration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} milliseconds`;
  return `${(ms / 1000).toFixed(1)} seconds`;
}

export function mountPanel3(): void {
  const progressHost = byId('p3-progress');
  const guessOut = byId('p3-guess-out');
  const recoveredOut = byId('p3-recovered-out');
  const noSeedOut = byId('p3-noseed-out');
  const buttons = (): HTMLButtonElement[] =>
    Array.from(document.querySelectorAll<HTMLButtonElement>('#panel-3 button[data-needs]'));

  slot('guess', guessOut, basis.guess, 'The keys changed. Pick a guess and try it again.');
  slot(
    'recovered',
    recoveredOut,
    basis.recovered,
    'The keys changed, so this recovery was about a key no longer on screen. Search again.'
  );
  slot(
    'no-seed',
    noSeedOut,
    basis.noSeed,
    'The keys changed, so this search was about a key no longer on screen. Search again.'
  );

  // The four candidate PINs, as radio buttons. A `<select>` would need `appearance:
  // none` and a custom chevron to pass the gate, and would hide three of the four
  // options behind a click — the fact that there are only four is the thing worth
  // seeing.
  const pins = byId('pin-choices');
  fill(
    pins,
    ...CANDIDATE_PINS.map((pin, i) =>
      el('label', { class: 'pin-choice' }, [
        (() => {
          const input = el('input', {
            type: 'radio',
            name: 'pin-guess',
            value: pin,
            id: `pin-${pin}`,
            checked: i === 0,
          });
          input.addEventListener('change', () => {
            state.guess = pin;
            settled();
          });
          return input;
        })(),
        el('span', { class: 'pin-choice-label' }, [pin]),
      ])
    )
  );

  function showProgress(tried: number, label: string): void {
    progressHost.hidden = false;
    fill(
      progressHost,
      el(
        'div',
        {
          class: 'progress',
          role: 'progressbar',
          'aria-valuemin': 0,
          'aria-valuemax': PIN_SPACE,
          'aria-valuenow': tried,
          'aria-label': label,
        },
        [
          el('span', { class: 'progress-count' }, [`${fmt(tried)} of ${fmt(PIN_SPACE)} tried`]),
          el('span', { class: 'progress-bar' }, [
            el('span', { class: 'progress-fill', style: `width:${(tried / PIN_SPACE) * 100}%` }),
          ]),
        ]
      )
    );
  }

  async function withBusy(run: () => Promise<void>): Promise<void> {
    const controls = buttons();
    for (const b of controls) b.disabled = true;
    byId('panel-3').setAttribute('aria-busy', 'true');
    try {
      await run();
    } finally {
      byId('panel-3').removeAttribute('aria-busy');
      settled();
    }
  }

  byId('try-guess').addEventListener('click', () => {
    void withBusy(async () => {
      const sealed = state.sealedSeeded;
      if (!sealed) return;
      const guess = state.guess;
      const found = await trySeed(guess, sealed);
      if (found) {
        state.recovered = found;
        render(
          'guess',
          {
            marker: 'guess',
            tone: 'alarm',
            glyph: 'key',
            headline: 'ONE GUESS WAS ENOUGH',
            detail: [
              `The PIN was ${found.seed}. One try, out of four — so you had a one-in-four ` +
                'chance and you took it. That is a party trick rather than an attack.',
              'The message below came out of Source B’s ciphertext using a key rebuilt ' +
                'from those four digits and nothing else. The real number is the button ' +
                'underneath: ten thousand.',
            ],
          },
          [recoveredText(found.plaintext, found.keyBytes)]
        );
        refreshPanel2();
        return;
      }
      render('guess', {
        marker: 'guess',
        tone: 'neutral',
        glyph: 'question',
        headline: 'WRONG GUESS',
        detail: [
          `${guess} was not it. That establishes nothing at all — not that the key is ` +
            'sound, not that the generator is safe. You have ruled out one number.',
          `Try another, or stop guessing: the button below rules out all ` +
            `${fmt(PIN_SPACE)} of them.`,
        ],
      });
    });
  });

  byId('search-seeded').addEventListener('click', () => {
    void withBusy(async () => {
      const sealed = state.sealedSeeded;
      if (!sealed) return;
      showProgress(0, 'Candidates tried against Source B');
      const outcome = await searchPins(sealed, {
        // The whole space, not the first hit. See the note at the top of the file.
        stopAtFirstHit: false,
        onProgress: (tried) => showProgress(tried, 'Candidates tried against Source B'),
      });
      const found = outcome.found;
      if (!found) {
        // Reachable only in a build where something is wrong, and it says so rather
        // than reading as a result. A page that printed "nothing found" here in the
        // same tone as the Source A panel would be hiding a defect behind a lesson.
        render('recovered', {
          marker: 'recovered',
          tone: 'fail',
          glyph: 'cross',
          headline: 'THE SEARCH FOUND NOTHING',
          detail: [
            `All ${fmt(outcome.tried)} candidates were tested and none of them opened Source ` +
              'B’s message. Source B was built from one of those candidates, so this ' +
              'should be impossible. Something in this build is wrong; do not read this as ' +
              'the generator being safe.',
          ],
        });
        return;
      }
      state.recovered = found;
      render(
        'recovered',
        {
          marker: 'recovered',
          tone: 'alarm',
          glyph: 'key',
          headline: 'PASSED EVERY CHECK — AND FULLY RECOVERED',
          detail: [
            `The PIN was ${found.seed}, found on try ${fmt(found.onTry)}. All ` +
              `${fmt(outcome.tried)} candidates were then tested anyway, so you can see what ` +
              `the whole space costs: ${duration(outcome.elapsedMs)}. A stranger would have ` +
              `stopped at try ${fmt(found.onTry)}.`,
            'Nothing was broken to do this. The cipher is correct, the key is a full 256 ' +
              'bits, and every check in Step 2 passed. The key was rebuilt by counting.',
            // The brief's own framing, and it is literally true of the sweep that just
            // ran: one key was derived per candidate, and the candidates are the whole
            // seed space. A reader who has followed this far should be told that the
            // page did not find A key, it enumerated ALL of them.
            `And it is worse than one key. Those ${fmt(outcome.tried)} candidates are not a ` +
              'sample — they are every seed this generator can be given, so the search ' +
              'just worked out every "random" key it will ever produce. There are no others.',
          ],
        },
        [
          recoveredText(found.plaintext, found.keyBytes),
          el('p', { class: 'negative-claim' }, [NEGATIVE_CLAIM]),
          el('p', { class: 'claim-note' }, [
            'There is no error code to show you here, and that is the exhibit. Every check on ' +
              'this page reports success in this exact state: the four checks in Step 2 ' +
              'passed, the decryption below worked, and the pinned cases at the bottom agree. ' +
              'Nothing failed. The key was guessable anyway.',
          ]),
          el('p', { class: 'handoff' }, [
            'Now look at ',
            el('a', { href: '#panel-2' }, ['Step 2 again']),
            ' — this search is what put the colours on it.',
          ]),
        ]
      );
      refreshPanel2();
    });
  });

  byId('search-real').addEventListener('click', () => {
    void withBusy(async () => {
      const sealed = state.sealedReal;
      const keys = state.keys;
      if (!sealed || !keys) return;
      showProgress(0, 'Candidates tried against Source A');
      const outcome = await searchPins(sealed, {
        stopAtFirstHit: false,
        onProgress: (tried) => showProgress(tried, 'Candidates tried against Source A'),
      });
      // The failure must be the search's and not the cipher's, so the page proves the
      // message is still intact under the key that made it. Otherwise "found nothing"
      // is equally consistent with a ciphertext this build cannot open at all.
      const stillOpens = (await unseal(keys.real.bytes, sealed)) === state.secret;

      const asExpected = outcome.found === null && stillOpens;
      render(
        'no-seed',
        asExpected
          ? {
              marker: 'no-seed',
              tone: 'held',
              glyph: 'held',
              headline: 'NOTHING TO FIND',
              detail: [
                `The same search, the same ${fmt(outcome.tried)} candidates, the same ` +
                  `${duration(outcome.elapsedMs)} of work — against Source A. Nothing ` +
                  'opened it, because there is no seed to guess: those 32 bytes came from ' +
                  'the operating system and were never worked out from anything.',
                'The message is still perfectly readable with the key that made it, which ' +
                  'the page has just checked — so this is the search failing, not the ' +
                  'cipher. To guess this key you would need to count to a number with 78 ' +
                  'digits in it, and ten thousand is where you have got to.',
              ],
            }
          : {
              marker: 'no-seed',
              tone: 'fail',
              glyph: 'cross',
              headline: outcome.found
                ? 'THE SEARCH FOUND SOURCE A'
                : 'SOURCE A’S MESSAGE WILL NOT OPEN',
              detail: [
                outcome.found
                  ? `A candidate PIN opened Source A’s message, which should be ` +
                    'impossible: that key came from the operating system. Something in this ' +
                    'build is handing out the wrong key.'
                  : 'Source A’s message does not open even under the key that sealed it, ' +
                    'so this search proved nothing — there was nothing openable to find. ' +
                    'Something in this build is wrong.',
              ],
            }
      );
    });
  });

  /** The plaintext that came back, and the key that was rebuilt to get it. */
  function recoveredText(plaintext: string, keyBytes: Uint8Array): HTMLElement {
    return el('div', { class: 'recovered-wrap' }, [
      el('div', { class: 'recovered' }, [
        el('span', { class: 'recovered-label' }, ['The message that came out']),
        el('p', { class: 'recovered-text' }, [plaintext]),
      ]),
      disclosure('Show the key that was rebuilt', [
        longValue(toGroupedHex(keyBytes), 'The 32 bytes, worked out from the PIN'),
        el('p', { class: 'bytes-lede' }, [
          'Compare it with Source B in Step 2. It is the same key, and nothing on this page ' +
            'was told what it was.',
        ]),
      ]),
      interceptedBytes(),
    ]);
  }

  /**
   * What a stranger would have intercepted: the nonce and the encrypted bytes.
   *
   * It is here for the reader, who is entitled to see the thing the attack was given
   * rather than take the page's word for what it had. It is also what lets
   * `e2e/claims.spec.ts` check this panel by a genuinely independent route: with the
   * PIN, the nonce and the ciphertext all on screen, that test rebuilds the key with
   * OpenSSL's ChaCha20 and opens the message with OpenSSL's AES-256-GCM, through
   * Node, sharing not one line with this repository. A test that re-derived the
   * answer using this lab's own modules would agree with a bug in them.
   *
   * The nonce is not a secret and never was. It ships with every ciphertext in every
   * real system; printing it changes nothing about who can open this message.
   */
  function interceptedBytes(): HTMLElement {
    const sealed = state.sealedSeeded;
    if (!sealed) return el('span');
    return disclosure('Show the encrypted bytes a stranger would have had', [
      longValue(toGroupedHex(sealed.iv), 'The nonce, which is not a secret'),
      longValue(toGroupedHex(sealed.bytes), 'The encrypted message, with its tag'),
      el('p', { class: 'bytes-lede' }, [
        'This is everything the search was given — no key, no PIN, no message. The last ' +
          '16 bytes are an authentication tag, which is what lets a wrong key be told apart ' +
          'from a right one instead of producing rubbish.',
      ]),
    ]);
  }
}
