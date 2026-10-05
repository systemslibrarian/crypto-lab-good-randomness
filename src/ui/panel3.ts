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
import { PIN_DIGITS, PIN_SPACE, seededKey } from '../crypto/seeded';
import { toGroupedHex } from '../crypto/bytes';
import { CANDIDATE_PINS, basis, keysBasis, state } from './state';
import { byId, disclosure, el, fill, longValue } from './dom';
import { refreshPanel2 } from './panel2';
import { render, slot } from './verdict';
import { alsoOnSettle, settled } from './settle';

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

  /**
   * Run a search with every control that could move the ground inert.
   *
   * STEP 2'S BUTTON IS IN HERE, and that is the part worth explaining. Disabling
   * Step 3's own three controls stops two searches overlapping, which is obvious.
   * Step 2's "Make two keys" is the one that actually bites: a search holds the
   * ciphertext it was given in a local, so new keys made halfway through would let
   * the run finish against the OLD message and then render its verdict — and the
   * verdict would record the NEW keys as its basis, because `render` reads the basis
   * at render time. `retireStale` would then compare the new basis against itself,
   * find no change, and leave a stale result standing as a fresh one.
   *
   * That is the exact defect the retirement machinery exists to prevent, arriving
   * through the one door it cannot watch: a basis captured after the inputs moved is
   * indistinguishable from a basis that never moved. The fix is to stop the inputs
   * moving, not to make the comparison cleverer.
   */
  async function withBusy(run: () => Promise<void>): Promise<void> {
    const controls = [...buttons(), byId<HTMLButtonElement>('make-keys')];
    for (const b of controls) b.disabled = true;
    byId('panel-3').setAttribute('aria-busy', 'true');
    try {
      await run();
    } finally {
      byId('panel-3').removeAttribute('aria-busy');
      // `settled()` re-enables every gated control from its own prerequisite, and
      // `make-keys` is not gated, so it is restored here.
      byId<HTMLButtonElement>('make-keys').disabled = false;
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
      /*
       * A MISS SHOWS ITS WORK, which is the whole reason this panel is worth having.
       *
       * The common outcome of a single guess is a miss, and a miss used to be four
       * lines of prose — so the one state a reader almost always meets was the one
       * state that showed them nothing. Printing the key the wrong PIN produced makes
       * the mechanism visible at exactly the moment it is cheapest to follow: a full
       * 32-byte key was really built from those four digits, it is as random-looking
       * as the one in Step 2, and the message simply refused it.
       */
      const missKey = await seededKey(guess);
      render(
        'guess',
        {
          marker: 'guess',
          tone: 'neutral',
          glyph: 'question',
          headline: 'REJECTED',
          detail: [
            `${guess} was not it. All four steps really ran: the key below was built from ` +
              'those four digits, handed to the encrypted message, and the message refused ' +
              'it. Nothing compared it with the real key — there was no need, because a ' +
              'wrong key fails the message\u2019s own integrity check.',
            'That establishes nothing at all: not that the key is sound, not that the ' +
              `generator is safe. You have ruled out one number out of ${fmt(PIN_SPACE)}.`,
          ],
        },
        [
          disclosure('Show the key this wrong PIN produced', [
            longValue(toGroupedHex(missKey), `The 32 bytes behind the PIN ${guess}`),
            el('p', { class: 'bytes-lede' }, [
              'Compare it with Source B in Step 2. It is just as random-looking, and it is ' +
                'the wrong key \u2014 which is the point. Looking right has never been the ' +
                'test; opening the message is.',
            ]),
          ]),
        ]
      );
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
            // SCOPED TO WHAT THE SWEEP ACTUALLY ENUMERATED. This said "every seed this
            // generator can be given" and "every key it will ever produce", and neither
            // is true: `seededBytes` accepts any string at all -- Step 1's recipe box
            // proves it -- and a generator run on past its first 32 bytes keeps going.
            // What the sweep really did is still the point, and it is still striking.
            `And it is worse than one key. Those ${fmt(outcome.tried)} candidates are not a ` +
              'sample: they are every four-digit PIN there is, so the search did not find ' +
              'one key — it worked out the key for every PIN a program could have started ' +
              'from, and then noticed which one was yours.',
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

      // Recorded BEFORE anything is rendered, so Step 2's repaint describes a search
      // that actually ran. Step 2 reads this field and nothing else about Source A.
      state.realSearch = { tried: outcome.tried, found: outcome.found };
      const asExpected = outcome.found === null && stillOpens;
      /*
       * THE COMPARISON IS THE REPAIR, and it is drawn rather than described.
       *
       * This panel already WAS the fix — same cipher, same key length, different
       * starting point — but it read as a second experiment rather than as the answer
       * to the first, so a reader could finish the lab having seen the failure and not
       * the remedy. Four rows is all it takes: three things that did not change, and
       * the one that did.
       *
       * Only rendered when the reader has both halves. A comparison table against an
       * experiment that has not run would be the same defect this session started by
       * fixing.
       */
      const comparison = (): HTMLElement[] =>
        state.recovered === null
          ? []
          : [
              el('div', { class: 'table-wrap', role: 'region', tabindex: 0,
                          'aria-label': 'What changed between the two sources' }, [
                el('table', { class: 'recap-table' }, [
                  el('caption', { class: 'sr-only' }, [
                    'What differs between Source B and Source A',
                  ]),
                  el('thead', {}, [
                    el('tr', {}, [
                      el('th', { scope: 'col' }, ['What changed?']),
                      el('th', { scope: 'col' }, ['Source B']),
                      el('th', { scope: 'col' }, ['Source A']),
                    ]),
                  ]),
                  el('tbody', {}, [
                    ...(
                      [
                        ['Encryption', 'AES-256-GCM', 'AES-256-GCM'],
                        ['Key length', '32 bytes', '32 bytes'],
                        ['Step 2 checks', 'All four passed', 'All four passed'],
                        [
                          'Where the key started',
                          `A ${PIN_DIGITS}-digit PIN`,
                          'The operating system',
                        ],
                        [
                          'This PIN attack',
                          `Opened on try ${fmt(state.recovered.onTry)}`,
                          `${fmt(outcome.tried)} tried, none opened it`,
                        ],
                      ] as const
                    ).map(([what, b, a]) =>
                      el('tr', {}, [
                        el('th', { scope: 'row' }, [what]),
                        el('td', {}, [b]),
                        el('td', {}, [a]),
                      ])
                    ),
                  ]),
                ]),
              ]),
              el('p', { class: 'claim-note' }, [
                // "One row differs" was wrong: two do. The honest division is between
                // the rows that describe a CHOICE and the one that describes what that
                // choice cost, and saying it that way is sharper as well as true.
                'Only one row describes a decision somebody made — and it is not the cipher, ' +
                  'the key length, or anything a check could see. The last row is what that ' +
                  'one decision cost. That is the whole lab: keep the encryption, change ' +
                  'where the key starts.',
              ]),
            ];
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
                  'opened it, because Source A did not come from this small list of starting ' +
                  'points. Its bytes came from the operating system\u2019s own generator.',
                'That generator is a program too, and it is just as deterministic as the one ' +
                  'in Step 1 — the difference is where it starts. Its starting point is kept ' +
                  'secret and is fed by physical events the machine measured, so there is no ' +
                  'short list of candidates to count through.',
                'The message is still perfectly readable with the key that made it, which ' +
                  'the page has just checked — so this is the search failing, not the ' +
                  'cipher. And be precise about what that means: THIS attack found nothing. ' +
                  'It is not a proof that no attack ever could, and no experiment on one ' +
                  'page could be.',
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
            },
        asExpected ? comparison() : []
      );
      // Step 2 is repainted by EITHER search, so the comparison is truthful in
      // whichever order the reader runs them.
      refreshPanel2();
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
    ]);
  }

  /**
   * What a stranger was handed, rendered BEFORE the attack rather than after it.
   *
   * It used to appear only once the recovery had succeeded, which is the wrong way
   * round: a reader cannot judge whether an attack is impressive or trivial until
   * they know what it was given. Shown first, the sweep reads as ten thousand
   * ordinary attempts on a published ciphertext; shown afterwards it reads as the
   * page producing a key from nowhere.
   *
   * REBUILT ONLY WHEN THE KEYS CHANGE. `settled()` calls this after every action, and
   * an unconditional rebuild would snap the disclosure shut under a reader who had
   * just opened it and then pressed anything at all.
   */
  let interceptedFor: string | null = null;
  function renderIntercepted(): void {
    const host = byId('p3-intercepted');
    const now = state.keys ? keysBasis() : null;
    if (now === interceptedFor) return;
    interceptedFor = now;
    if (!now) {
      fill(host);
      return;
    }
    fill(
      host,
      el('p', { class: 'sub-lede' }, [
        'That is everything the attack below is given: no key, no PIN, no message. Open this ' +
          'before you run it, so you can see it is working from the same bytes a stranger ' +
          'would have intercepted.',
      ]),
      interceptedBytes()
    );
  }
  alsoOnSettle(renderIntercepted);

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
    return disclosure('Show the encrypted bytes a stranger was handed', [
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
