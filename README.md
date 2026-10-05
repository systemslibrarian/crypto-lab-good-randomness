# Good Randomness

A key is only a secret because nobody can guess it. This lab draws one 32-byte key from the
browser's own CSPRNG (**`crypto.getRandomValues`**) and another from a real **ChaCha20** stream
started at a four-digit PIN, runs the same look-random checks over both — all four pass, on both
— and then rebuilds the second key by counting to ten thousand.

**Live demo:** <https://systemslibrarian.github.io/crypto-lab-good-randomness/>

---

## What It Is

A beginner's on-ramp to the thing every later lab assumes you already accept: that the step where
a key is generated is not a formality.

The exact primitives are **ChaCha20** (RFC 8439 §2.3, 20 rounds, 256-bit key, 96-bit nonce,
32-bit counter) hand-rolled in `src/crypto/chacha20.ts`; **`crypto.getRandomValues`** (Web
Cryptography API) as the real source; **SHA-256** and **AES-256-GCM** through the browser's own
`crypto.subtle`. The cipher is hand-rolled rather than imported because it is the teaching
subject, and a reader has to be able to open the file and see that nothing is pretending.

**The problem it addresses.** A generator that starts from a guessable seed produces guessable
keys, and nothing about the output looks wrong. Not to the eye, not to a check of the bytes, not
to a statistical battery. The failure is invisible in exactly the place people look for it.

**The security model.** Everything is per-session and in memory. No backend, no network calls, no
storage — the only thing this page writes to `localStorage` is the theme pin. Reloading destroys
both keys and the PIN behind one of them.

**Not production crypto — a teaching demo.** Two things here are deliberately not what a working
system would do, and the page says both in its own words rather than only here:

- the predictable generator's seed is a **four-digit PIN**, so the recovery finishes in under a
  second in front of you;
- its **nonce is fixed at zero**, so one seed means one keystream and the recovery is possible at
  all. A random nonce would close that particular hole and leave the lesson untouched — the key
  would still be ten thousand guesses wide — so the page does not offer it as the remedy.

The remedy it does name is the real one: get the starting point from the operating system.

### What it does NOT prove

The lab declares one **negative claim**, and demonstrates it rather than disclaiming it:

> Passing those four checks establishes nothing about whether a generator can be predicted.
> ChaCha20's output looks like this whether its key came from the operating system or from a
> four-digit PIN, and this page has just rebuilt one of the two from a number a stranger can
> count to.

It is scoped to the construction on the page — these four checks, this generator — and not to the
field. "No test of output can detect a weak seed" would be a stronger claim than this page
demonstrates.

Step 3's exhaustive search reaches a state where **every check the page performs reports success
and the key is recovered anyway**: all eight check rows in Step 2 read PASS, the decryption
works, the pinned RFC 8439 cases agree, and the verdict reads `PASSED EVERY CHECK — AND FULLY
RECOVERED`. There is no failure code to show, because there is no check there that could fail.
The absence of a code is the exhibit.

Three more things the lab is explicit about in-page:

- **A 256-bit key is not 256 bits of security.** Length is a ceiling on how many values are
  possible; it says nothing about how many the process could actually produce. Here: ten
  thousand.
- **Hashing a guessable seed buys nothing.** Source B's key *is* the SHA-256 of a PIN. Ten
  thousand inputs give ten thousand outputs; a slower hash makes ten thousand tries take longer
  and does not make them fewer.
- **The checks are real and they do work.** A separate panel runs the same four over a counter
  and watches two of them catch it — which is what makes their silence beside Source B
  informative rather than merely unhelpful. It also shows that an obviously broken generator
  still *passed* two of the four.

## Exhibits

1. **Step 1 — Dice, then a computer.** Five dice from `crypto.getRandomValues`, with the byte
   accounting printed beside them: how many bytes were drawn and how many were discarded to keep
   every face equally likely. (`byte % 6` is biased — 256 is not a multiple of 6 — so bytes at or
   above 252 are thrown away and the page says so.) Then the same five dice from a *recipe*: type
   a word, press the button twice, get the identical roll. No definition of "seed" anywhere; the
   repeat is the definition.
2. **Step 2 — Two keys, and no way to tell them apart.** Both 32 bytes, side by side in identical
   unmarked boxes, with four plain-language checks run over each: not all the same, not just
   counting, no value more than three times in a row, not lopsided. Every row prints what it
   *measured*, not just a verdict. Both columns pass all four. **The panel carries no colour at
   all** until Step 3 resolves it.
3. **Step 2a — Do those checks do anything?** The same four, run over a counter. Two of them
   catch it and name the pattern.
4. **Step 2b — Which one is guessable?** A one-in-two guess, and the page says it is one in two
   whichever way you answer.
5. **Step 3 — Your guess first.** The seeded generator started at one of four candidate PINs,
   shown on the page. Pick one. A hit rebuilds the key and opens the message; a miss is painted
   *neutral*, because ruling out one number establishes nothing.
6. **Step 3a — Now stop guessing.** All ten thousand PINs, counted out loud against a live
   progress bar. It reports both the try it hit on *and* the cost of the whole space, because a
   PIN of 0000 would otherwise be found on try 1 and the headline would undersell the point by
   four orders of magnitude.
7. **Step 3b — The same search against the real key.** Identical code, identical ten thousand
   candidates, identical work — and nothing found, because there is no seed to guess. The page
   also checks that the message still opens under the key that sealed it, so the failure is
   demonstrably the search's and not the cipher's.
8. **The repaint.** The moment a recovery succeeds, Step 2 re-renders in colour and marks its two
   columns. The thing you could not read becomes readable only after something else told you the
   answer. That is the page's central mechanism, and it cannot be undone without a reload.
9. **The recap.** Four observations about a generator, each with what it establishes and what it
   does not, plus three applied questions.
10. **The pinned cases.** Ten known-answer checks run in your browser on arrival — see Build &
    Verify.

## When to Use It

- Use it as the first thing someone meets about key generation, because it answers "why does the
  seed matter" by letting them take a key rather than by asserting it.
- Use it to settle the 256-bit confusion, because the lab makes "length is not strength" a
  measurement rather than a slogan.
- Use it to retire "but our RNG passes its statistical tests", because the output on this page
  would pass any battery you ran at it and its key took ten thousand tries.
- Use it before **Entropy Collapse**, which is the same failure at the scale of real machines.
- **Do NOT use it** as a guide to building anything. The fixed nonce and the four-digit seed are
  there to make a lesson visible in one second, and a system built that way is broken.

## Live Demo

<https://systemslibrarian.github.io/crypto-lab-good-randomness/>

Roll five dice, then roll five more from a word you type — twice, and get the same five. Make two
keys and try to tell them apart from the bytes; you cannot, and neither can the four checks. Pick
one of four PINs and see whether you get lucky. Then let the page try all ten thousand, watch the
counter run, and read the message that comes out. Run the same search against the other key and
watch it find nothing. Everything runs in your browser; nothing is sent anywhere.

## What Can Go Wrong

- **Seeding from the clock.** The failure this lab models most directly. If an attacker can
  narrow the moment to a day, that is 86 million milliseconds — fewer tries than a six-character
  password, against a key that is still 256 bits long.
- **Seeding from a PID, a counter, or a serial number.** Same shape, usually a smaller space.
- **Hashing the seed and calling it fixed.** Addressed in-page, because it is the most common
  objection: a hash spreads a value out, it does not create choices that were never there.
- **Falling back to `Math.random()` when WebCrypto is unavailable.** The exact defect this lab
  warns about, so `src/crypto/real.ts` throws rather than falling back, and the page reports the
  environment as unavailable instead of quietly carrying on.
- **Trusting a statistical test battery as evidence of a good seed.** It is evidence about
  output. A guessable seed is a property of the process.
- **A result that outlived its inputs.** Not a cryptographic failure, but the quiet way a demo
  starts lying: every verdict here records what it was computed from and is replaced by a
  retirement notice when that changes. One door the comparison cannot watch is a search still
  running while the keys are remade — a basis captured *after* the inputs moved is
  indistinguishable from one that never moved — so Step 2's button is held inert for the
  duration rather than the comparison being made cleverer.
- **Two machines with the same starting state.** Out of scope here and the subject of **Entropy
  Collapse**; this lab is the one that establishes why it matters.

## Real-World Usage

ChaCha20 is the stream cipher in TLS 1.3 and WireGuard; `crypto.getRandomValues` is what your
browser uses for its own key generation, sitting on the operating system's generator, which is
seeded from physical events the machine measured.

Real TLS and SSH hosts have shipped duplicate and guessable keys, with no flaw in the
cryptography and nothing visibly wrong in the keys themselves — the generators simply had too
little to start from. The page states that once, in the recap, and hands off to
[Entropy Collapse](https://systemslibrarian.github.io/crypto-lab-entropy-collapse/) rather than
claiming to demonstrate it here.

## How to Run Locally

```bash
git clone https://github.com/systemslibrarian/crypto-lab-good-randomness.git
cd crypto-lab-good-randomness
npm install
npm run dev
```

No environment variables are required. `npm run build` re-derives the pinned vectors with an independent
implementation, typechecks, and builds — in that order, so a bad vector cannot reach a bundle;
`npm test` runs the unit suite; `npm run test:a11y` and `npm run test:claims` run the two browser
suites against the production build.

## Build & Verify

**68 unit tests** (8 files) + **32 claims tests** + **3 accessibility drives** + **10 pinned
vectors re-derived by an independent implementation on every build** + **7 mutations, all
killed**.

**Correctness, in three independent layers.**

- `src/crypto/chacha20.test.ts` runs the **published RFC 8439 vectors** — §2.3.2, §2.4.2 and the
  five Appendix A.1 block vectors — plus three cases this lab derives itself, each taking the
  §2.3.2 case and changing exactly one input so the answer *must* change. That half has the
  teeth: an implementation ignoring its nonce reproduces four of the five Appendix A.1 vectors,
  because their nonces are all zero.
- `src/crypto/recover.test.ts` is the one the build brief calls the real test. From the sealed
  message alone — no key, no seed, no plaintext — it recovers the seed, rebuilds the key, opens
  the message, and then runs **the same search against a `crypto.getRandomValues` key in the same
  test** and gets nothing. A build where the search was broken fails the first half; a build
  where the cipher opened anything fails the second.
- `src/crypto/real.test.ts` asserts the real source **structurally and never statistically** — 32
  bytes, drawn from `crypto.getRandomValues` (observed with a spy, so a silent fall-back to
  `Math.random()` fails), a different answer each call. A test that asserted the randomness of a
  random source would be flaky by construction, and saying so is part of what the lab teaches.

**On the pinned vectors, and a transcription that was wrong.** The RFC 8439 cases in
`src/crypto/vectors.json` were transcribed by hand, and **one of them was wrong** — the tail of
Appendix A.1 vector 4, from offset 44 onward. A unit test comparing this lab's cipher against a
bad vector reports a failure and cannot say which side is at fault. So `scripts/check-vectors.mjs`
re-derives every committed value with **Node's OpenSSL ChaCha20**, an implementation sharing not
one line with this repository. It is the first thing `npm run build` does, so every build and
every browser suite runs it, and CI *also* runs it as its own named step before the typecheck —
which is not redundant: as a named step it fails saying `Pinned vectors` rather than failing
inside a step called `Build`. A failure there means
the *data* is wrong; a failure in the unit suite means the *lab* is. That split is what caught it.
The script pins its own oracle first: OpenSSL's `chacha20` takes a 16-byte IV (a little-endian
counter followed by the nonce) where the RFC states a separate counter word, so it checks the
§2.3.2 case and exits with a distinct code if its own packing is wrong, rather than reporting ten
transcription errors.

**The claims suite** (`e2e/claims.spec.ts`, 32 tests) checks what the page *says*. The strongest
is an independent re-derivation: with the PIN, the nonce and the ciphertext all on screen, the
test rebuilds the key with **OpenSSL's ChaCha20** and opens the message with **OpenSSL's
AES-256-GCM**, through `node:crypto`. A build whose hand-rolled cipher was wrong in a
self-consistent way would pass every other test here and fails that one. It also asserts what the
brief rules *out*: the page carries no entropy figure, no min-entropy, no test-battery name.

**The accessibility gate.** `@axe-core/playwright` scans the production build for zero WCAG 2.1
A/AA violations at **1280, 390 and 320 px**, and the Pages deploy is blocked if it fails. The
oracle engines in `e2e/contrast.ts` and `e2e/nontext.ts` are the ones the build standard names as
the reference implementation, taken across code-identical — including the per-side `paintedSides`
border measurement — with every passage that describes a page rewritten for this one.

**One inherited claim was checked rather than copied, and it was false here.** The reference
`contrast.ts` opens by saying axe cannot resolve a `color-mix()` backdrop, so a violations-only
gate measures almost nothing. Driven to the state carrying the most `color-mix()` surfaces on this
page, `axe.incomplete` came back **empty** — no ids, no nodes — and a degraded `--held-text` was
then reported by axe as a `color-contrast` *violation*, eleven nodes, not as an undecided one.
axe-core 4.12 resolves these fills. The arithmetic walk is kept as a second independent
implementation, which is worth having for its own reasons — two oracles agreeing beats one, and
axe's willingness to resolve a backdrop is a property of an axe version a bump can change — and
`contrast.ts`, `gate.ts` and `nontext-baseline.ts` now say that instead of the inherited sentence.

**The gate found one real defect**, fixed in `src/style.css` with the measurement beside it: an
operable control on a **tinted** surface. The copy button inside each key column sits on
`--surface-2` until Step 3 marks the columns, at which point the background becomes a
`color-mix()` of a tone and that surface. At the `--control-border` the reference stylesheet
carries, `#626d7a` — which clears the plain surface by three hundredths, 3.03:1 — that tint took
it under, and the gate named `button.btn.btn-quiet.copy-btn` at 2.62:1 and 2.57:1 at all three
widths. The token is now `#727e8c`: 3.27:1 against the worse of those backdrops, 3.85:1 against
the plain surface. Raising the token was the right fix rather than reducing the tint, because the
tint is what Step 3 uses to say which column it recovered.

Both oracles were then **proved live** rather than inferred from a green run, because an empty
finding set is also what an oracle that never ran produces — which is the whole reason the build
standard requires this step:

| Oracle | Degradation | Build | CSS hash | Reported |
|---|---|---|---|---|
| `nontext.ts` | `--control-border` → `#2b3440` | succeeded | `31b978f9a07b7` → `5e58baf968454` | `textarea#recipe` and `button#check-broken.btn` at 1.37:1, six `button.check-opt` at 1.27:1, against a required 3:1 |
| `contrast.ts` | `--held-text` → `#4a6c8f` | succeeded | `31b978f9a07b7` → `0d4d8ed5a8066` | `2.65:1 (needs 4.5:1) span.verdict-headline — fg rgb(74, 108, 143) on rgb(32, 42, 54)`, where that backdrop is the composited `color-mix()` result |

Both returned to `31b978f9a07b7` on restore, which is the hash `md5 dist/assets/*.css` prints on
`main` today — so the record is checkable rather than merely recorded.

**The mutation ledger — proof the tests bite.** A green suite is not evidence until you have
watched it fail. `mutations/mutations.json` records each mutation as a **concrete patch** — a
file, an anchor that must occur exactly once, and its replacement — and `npm run mutations`
applies them one at a time, enforcing all four kill rules: the owning test **passed unmutated in
the same run**; the patch **changed the file**; the run **served the mutated code** (the bundle
hash moved, *and* the red run is not a build or server failure); and a patch that does not compile
is **DOES NOT BUILD** and is never a kill.

`mutations/LEDGER.md` and `LEDGER.json` are written by the runner. **Every `observed` line in them
was written by the run that produced it, never typed.**

| Mutation | Verdict | Outcome |
|---|---|---|
| the recovery claims success without decrypting | `recovered` | KILLED |
| the recovery claims failure after a real decryption | `recovered` | KILLED |
| a look-random check is hard-wired to pass | `visible-pattern` | KILLED |
| the seeded generator is quietly swapped for the CSPRNG | `recovered` | KILLED |
| the negative-claim text is deleted | `recovered` | KILLED |
| a check inside the negative-claim fixture is broken | `recovered` | KILLED |
| the real-key panel searches the seeded ciphertext | `no-seed` | KILLED |

The first four are the ones the build brief names. The next two are what §4.1d requires of any
negative claim: delete the claim text and the assertion that it is on screen must fail; break a
check inside the fixture and the assertion that everything is green must fail. A negative-claim
test that survives both is decorative.

The seventh is the one wiring defect on this page that would be genuinely dangerous: the real-key
panel pointed at the wrong ciphertext, so the page reports that a key from
`crypto.getRandomValues` fell to a four-digit PIN — the exact opposite of what the lab teaches, in
the lab's own voice. No unit test can see it, because nothing cryptographic is wrong.

**One verdict has no mutation of its own, and the ledger says why rather than leaving the gap
unexplained.** Step 1's determinism verdict is the first claim the lab makes, so it was the
obvious eighth entry. It was tried: replacing the comparison with `const identical = true` built
cleanly and the owning test **passed**, because on a correct build the two rolls really are
identical and the page renders exactly what it renders now. That is §4.1c's "the branch may be
unreachable" case — evidence about the source rather than about the tests. The build in which
that verdict could lie is one whose generator is not deterministic, and M4 is that build: driven
under it, Step 1 renders `THE DICE CHANGED` in the alarm tone, confirmed by running it. The
verdict is covered by the mutation that can actually reach it, and an eighth entry that could
only ever be recorded as SURVIVED would make the kill count worse evidence, not better.

The ledger is **enforced, not archived**. Each claims test records the (test, marker) pair it
actually asserted, and an `afterAll` in that spec fails any full claims run in which a recorded
kill's own test ran without asserting the marker the record names — so a kill can only stay
recorded while the assertion that produced it still exists. That enforcement was itself proved by
corrupting one record's marker and re-running: the suite failed naming
`M3-look-random-check-hardwired-to-pass` **while every test passed**, which is the right
subject for a false record. Restored, the suite is green again.

## Performance

The whole ten-thousand-candidate search — 10,000 SHA-256 digests, 10,000 ChaCha20 blocks and
10,000 AES-GCM attempts — runs in roughly a quarter of a second in a headless browser. The page
prints the measured figure rather than this one, because the number that teaches is the one on the
reader's own machine.

## Pending central assignment

Three values ship as marked placeholders because the catalog pins them centrally, and `brief.md`
defers all three:

- **`--accent`** is the fallback the build standard documents, `#35d6bb`, set in `src/style.css`
  and commented as a placeholder. The shared top bar reads it.
- **The favicon emoji** is a die, in `index.html`.
- **The category** is not set anywhere in this repository; it belongs on the catalog card.

Also owed to the catalog, and not done from here: the card itself, the
`tools/playwright-ports.json` pin for port **4213**, and the `tools/dispatch-census.json` row —
`dispatch-sync check` reports this lab as `UNPINNED-LAB` until that row exists.

## Related Demos

- [Entropy Collapse](https://systemslibrarian.github.io/crypto-lab-entropy-collapse/) — the same
  failure on real machines: restore one DRBG state onto two and watch both emit identical secrets.
- [Corrupted Oracle](https://systemslibrarian.github.io/crypto-lab-corrupted-oracle/) — a
  generator sabotaged on purpose, beside two honest ones.
- [DRBG Arena](https://systemslibrarian.github.io/crypto-lab-drbg-arena/) — how the approved
  generators are actually built, seed through reseed.
- [Noise to Numbers](https://systemslibrarian.github.io/crypto-lab-noise-to-numbers/) — where the
  first unguessable bits come from, and how a physical source is assessed.
- [Locks and Keys](https://systemslibrarian.github.io/crypto-lab-locks-and-keys/) — what the keys
  are then used for.

---

*One of the browser demos in the [Crypto Lab](https://crypto-lab.systemslibrarian.dev/) suite.*

*"So whether you eat or drink or whatever you do, do it all for the glory of God." — 1 Corinthians 10:31*
