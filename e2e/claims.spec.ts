import { createCipheriv, createDecipheriv, createHash } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { boot } from './gate';
import { enforceLedger, ran, witness } from './evidence';

/**
 * The claims suite: what this lab's interface SAYS, as opposed to what it is shaped
 * like. §4.1b and §4.1d of the build standard.
 *
 * These live here and not in `gate.ts`'s `boot()` on purpose. An assertion in a
 * shared setup fails every accessibility test at once, under the name "Accessibility
 * gate"; §4.1a of the build standard records a lab losing three days of corrected
 * security claims to exactly that. Here, a failure says "claims", which is what
 * actually changed.
 *
 * THE RULE THAT MAKES THESE WORTH ANYTHING: compare two values the page itself
 * printed, rather than asserting against a hardcoded string. A test that re-derives
 * the same expression the source uses will happily agree with a bug.
 *
 * But internal consistency is not enough — a page can be consistently wrong. So this
 * file mixes three shapes deliberately:
 *
 *  - CROSS-CHECKS between two surfaces that must agree: a column's "4 of 4" against
 *    the rows it counts, the progress bar's `aria-valuenow` against the sentence
 *    quoting the same figure, the pinned headline's denominator against its rows.
 *  - INDEPENDENT RE-DERIVATIONS, and this lab can do a strong one. With the PIN, the
 *    nonce and the ciphertext all on screen, `recoveredKeyIsReal` rebuilds the key
 *    with OPENSSL'S ChaCha20 and opens the message with OPENSSL'S AES-256-GCM, both
 *    through `node:crypto`, sharing not one line with `src/`. A build whose
 *    hand-rolled cipher was wrong in a self-consistent way would pass every other
 *    test in this repository and fails that one.
 *  - PARTS-SUM-TO-WHOLE where the maths offers one: Step 1 prints how many bytes it
 *    drew and how many it discarded, and the difference must be exactly the number
 *    of dice on screen.
 *
 * THE LAST DESCRIBE BLOCK IS NOT DECORATION. The build brief is explicit about what
 * must NOT appear on this page — no entropy figures, no min-entropy, no statistical
 * test names — and about one thing that must not appear YET: no colour on Step 2
 * before Step 3 resolves it. Prose rules that nothing checks are prose rules that
 * drift, so both are asserted here.
 *
 * Every test that asserts a verdict marker calls `witness()`, which is what makes
 * the mutation ledger enforceable rather than archival. See `evidence.ts`.
 */

/*
 * The mutation ledger is enforced from HERE, not from a `globalTeardown`.
 *
 * `afterEach` records that a test executed, whatever its outcome; `afterAll` then
 * fails the run if a recorded kill's own test ran without asserting the marker the
 * record names. Both hooks are root-level, so they cover every test in this file
 * regardless of declaration order.
 *
 * It lived in a `globalTeardown` in the lab this pattern came from, and that was
 * wrong: the teardown asked whether `claims` was in `config.projects` to decide
 * whether this suite had run, and Playwright passes the FULL project list whatever
 * `--project` was given. So an a11y-only run enforced the claims ledger, found no
 * witnesses, and failed the ACCESSIBILITY GATE with all its tests passing — a red
 * step naming the wrong subject, which is exactly what §4.1a exists to prevent.
 */
test.afterEach(({}, testInfo) => ran(testInfo.title));
test.afterAll(() => enforceLedger());

const tight = (s: string): string => s.replace(/\s+/g, '');
const unhex = (s: string): Buffer => Buffer.from(tight(s), 'hex');

/**
 * ChaCha20 keystream, from OpenSSL through Node — NOT from `src/crypto/chacha20.ts`.
 *
 * OpenSSL's `chacha20` takes a SIXTEEN-byte IV: a 4-byte little-endian block counter
 * followed by the 12-byte nonce, where RFC 8439 states the counter as a separate
 * state word. That packing is pinned by `scripts/check-vectors.mjs` against the
 * specification's own §2.3.2 vector on every CI run, so if it were wrong here the
 * build would already have failed somewhere that says so.
 */
function opensslKeystream(key: Buffer, counter: number, nonce: Buffer, nbytes: number): Buffer {
  const iv = Buffer.alloc(16);
  iv.writeUInt32LE(counter, 0);
  nonce.copy(iv, 4);
  const c = createCipheriv('chacha20', key, iv);
  return Buffer.concat([c.update(Buffer.alloc(nbytes)), c.final()]);
}

/** AES-256-GCM, from OpenSSL. WebCrypto appends the 16-byte tag to the ciphertext. */
function opensslGcmOpen(key: Buffer, nonce: Buffer, sealed: Buffer): string {
  const tag = sealed.subarray(sealed.length - 16);
  const body = sealed.subarray(0, sealed.length - 16);
  const d = createDecipheriv('aes-256-gcm', key, nonce);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(body), d.final()]).toString('utf8');
}

/** The faces of every die inside one container, read off the page. */
async function facesIn(page: Page, selector: string): Promise<number[][]> {
  return page.locator(selector).evaluateAll((rows) =>
    rows.map((row) =>
      Array.from(row.querySelectorAll('.die-number')).map((n) => Number(n.textContent))
    )
  );
}

/** Every verdict marker's state, read in ONE page evaluation. */
type Status = Record<string, 'fresh' | 'stale' | 'absent'>;
const MARKERS = [
  'dice-real',
  'dice-recipe',
  'same-again',
  'look-random',
  'visible-pattern',
  'guess',
  'recovered',
  'no-seed',
];

function statusOf(page: Page): Promise<Status> {
  // Not `page.getAttribute` per marker: that auto-waits for a selector that is
  // deliberately absent, so a missing verdict costs the full timeout instead of
  // answering immediately.
  return page.evaluate((markers) => {
    const out: Record<string, string> = {};
    for (const m of markers) {
      out[m] = document.querySelector(`[data-verdict="${m}"]`)
        ? 'fresh'
        : document.querySelector(`[data-verdict-retired="${m}"]`)
          ? 'stale'
          : 'absent';
    }
    return out as Status;
  }, MARKERS);
}

/** Make the two keys, which every Step 3 test needs. */
async function makeKeys(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Make two keys' }).click();
  await page.waitForSelector('[data-verdict="look-random"]');
}

/** Run the exhaustive search and wait for it to finish. */
async function searchAll(page: Page): Promise<void> {
  await page.getByRole('button', { name: /Try all/ }).click();
  await page.waitForSelector('[data-verdict="recovered"]');
  await expect(page.locator('[role="progressbar"]')).toHaveAttribute('aria-valuenow', '10000');
}

/** The PIN the page says it found, parsed from the recovery verdict. */
async function recoveredPin(page: Page): Promise<string> {
  const text = await page.locator('[data-verdict="recovered"]').innerText();
  const found = text.match(/The PIN was (\d{4})/)?.[1];
  expect(found, 'the recovery must name the PIN it found').toBeTruthy();
  return found as string;
}

test.describe('what the page says on arrival', () => {
  test('the recipe box arrives holding a word, not an empty string', async ({ page }) => {
    await boot(page, 'dark');
    // The value itself, which is why this is here and not in boot(): a reworded
    // default must fail THIS test and nothing in the a11y gate. It matters more than
    // a cosmetic default usually would, because an empty box is a `fail` state and
    // arriving in one would make the lab's first action a refusal.
    await expect(page.locator('#recipe')).toHaveValue('monday');
  });

  test('every number the prose quotes comes from the code, not from the sentence', async ({
    page,
  }) => {
    await boot(page, 'dark');
    // A cross-check across surfaces that are written from one constant each. The PIN
    // space appears three times on this page; the digit count twice. If one route
    // broke they would disagree here rather than silently.
    const spaces = await page.locator('[data-pin-space]').allInnerTexts();
    expect(spaces.length).toBeGreaterThan(1);
    expect(new Set(spaces).size).toBe(1);
    expect(spaces[0]).toBe('10,000');

    const digits = await page.locator('[data-pin-digits]').allInnerTexts();
    expect(new Set(digits).size).toBe(1);
    expect(digits[0]).toBe('4');

    // And ten to the power of the digit count IS the search space, which is the one
    // arithmetic relation the whole lab rests on.
    expect(10 ** Number(digits[0])).toBe(Number(spaces[0]!.replace(/,/g, '')));

    // The candidate count the prose quotes matches the radios actually rendered.
    const claimed = Number(await page.locator('[data-candidate-count]').first().innerText());
    await expect(page.locator('.pin-choice input')).toHaveCount(claimed);
  });

  test('the on-ramp says what is real and names the one thing that is deliberate', async ({
    page,
  }) => {
    await boot(page, 'dark');
    const summary = page.locator('.intro-more > summary');
    await summary.click();
    const body = await page.locator('.intro-more-body').innerText();
    // Honest scoping, in the page and not only in the README (§0.2).
    expect(body).toContain('crypto.getRandomValues');
    expect(body).toContain('RFC 8439');
    expect(body).toContain('Not production code');
    // The specific deliberate weakness, named: a four-digit PIN and a fixed nonce.
    expect(body).toMatch(/four-digit PIN/);
    expect(body).toMatch(/nonce is fixed at zero/);
    // And the reason a toy generator was NOT used, which is the lab's whole argument.
    expect(body).toContain('the seed, not the algorithm');
  });

  test('nothing has been computed except the pinned cases', async ({ page }) => {
    await boot(page, 'dark');
    const status = await statusOf(page);
    for (const marker of MARKERS) expect(status[marker]).toBe('absent');
    // The one verdict that exists on arrival, and it is the one the reader did not
    // ask for because its job is to have already answered "can I trust this".
    await expect(page.locator('[data-verdict="pinned"]')).toBeVisible();
  });
});

test.describe('Step 1: the dice, and what the second roll proves', () => {
  test('the real dice are dice, and the bytes account for themselves', async ({ page }) => {
    await boot(page, 'dark');
    witness(test.info().title, 'dice-real');
    await page.getByRole('button', { name: 'Roll five dice' }).click();
    await expect(page.locator('[data-verdict="dice-real"]')).toBeVisible();

    const faces = (await facesIn(page, '#p1-real-out .dice-row'))[0]!;
    expect(faces).toHaveLength(5);
    for (const f of faces) expect(f).toBeGreaterThanOrEqual(1);
    for (const f of faces) expect(f).toBeLessThanOrEqual(6);

    // PARTS SUM TO WHOLE. The page says how many bytes it drew and how many it threw
    // away; the difference must be exactly the number of dice it printed. This is the
    // assertion that catches a build which reported a discard count it did not make.
    const aside = await page.locator('#p1-real-out .aside-note').innerText();
    const [, drawn, discarded] = aside.match(/^(\d+) bytes were drawn .*? and (\d+) of them/s) ?? [];
    expect(drawn, 'the page must say how many bytes it drew').toBeTruthy();
    expect(Number(drawn) - Number(discarded)).toBe(faces.length);

    // And the page explains the discard rather than only reporting it.
    expect(aside).toContain('256 does not divide by six');
  });

  test('the same recipe gives the same dice, and the page compares them for you', async ({
    page,
  }) => {
    await boot(page, 'dark');
    witness(test.info().title, 'same-again');
    await page.getByRole('button', { name: 'Roll with this recipe' }).click();
    await expect(page.locator('[data-verdict="dice-recipe"]')).toBeVisible();
    // One roll is not a comparison, and the page must not pretend otherwise.
    await expect(page.locator('[data-verdict="same-again"]')).toHaveCount(0);

    await page.getByRole('button', { name: 'Roll with this recipe' }).click();
    const verdict = page.locator('[data-verdict="same-again"]');
    await expect(verdict).toBeVisible();
    await expect(verdict).toHaveAttribute('data-tone', 'pass');

    // CROSS-CHECK: the page's claim against the two rows it is a claim about. The
    // faces are read off screen and compared here, so a page that printed "identical"
    // over two different rolls fails even though it agrees with itself.
    const [first, second] = await facesIn(page, '#p1-again-out .dice-row');
    expect(first).toHaveLength(5);
    expect(second).toEqual(first);
    const text = await verdict.innerText();
    expect(text).toContain('THE SAME 5 DICE, AGAIN');
    // The sentence the whole lab is built on.
    expect(text).toContain('A program given the same input takes the same steps');
    // The page prints the comparison it made, face by face, and that printed
    // comparison must be the faces actually on screen. It lives in the `.claim-note`
    // beside the verdict rather than inside it, which is why this reads the output
    // region and not the verdict card.
    expect(await page.locator('#p1-again-out .claim-note').innerText()).toContain(
      `${first!.join(' ')} against ${second!.join(' ')}`
    );
  });

  test('a different recipe gives different dice', async ({ page }) => {
    await boot(page, 'dark');
    await page.locator('#recipe').fill('monday');
    await page.getByRole('button', { name: 'Roll with this recipe' }).click();
    const monday = (await facesIn(page, '#p1-recipe-out .dice-row'))[0]!;
    await page.locator('#recipe').fill('tuesday');
    await page.getByRole('button', { name: 'Roll with this recipe' }).click();
    const tuesday = (await facesIn(page, '#p1-recipe-out .dice-row'))[0]!;
    // Not a probabilistic claim: these are two fixed words, so this is a fact about
    // two specific 64-byte streams. A build that ignored the recipe would fail here.
    expect(tuesday).not.toEqual(monday);
    // And the label beside each roll quotes the recipe it used.
    await expect(page.locator('#p1-recipe-out .dice-row-label')).toContainText('tuesday');
  });

  test('an empty recipe is refused, and the page names the cause', async ({ page }) => {
    await boot(page, 'dark');
    witness(test.info().title, 'dice-recipe');
    await page.locator('#recipe').fill('   ');
    await page.getByRole('button', { name: 'Roll with this recipe' }).click();
    const verdict = page.locator('[data-verdict="dice-recipe"]');
    await expect(verdict).toHaveAttribute('data-tone', 'fail');
    await expect(verdict.locator('.verdict-headline')).toHaveText('NOTHING TO START FROM');
    // It says what to do, and it says WHY — a generator with no input has nothing to
    // be deterministic about, which is the lesson rather than a validation message.
    await expect(verdict).toContainText('nothing here to be deterministic about');
    // No dice were drawn, so none are shown.
    await expect(page.locator('#p1-recipe-out .die')).toHaveCount(0);
  });
});

test.describe('Step 2: two keys, and the panel that must not give the game away', () => {
  test('both columns pass all four checks, and each count matches its own rows', async ({
    page,
  }) => {
    await boot(page, 'dark');
    witness(test.info().title, 'look-random');
    await makeKeys(page);

    // CROSS-CHECK, per column: the count the column prints against the PASS rows it
    // is counting. A column that printed "4 of 4" over three passing rows would agree
    // with a hardcoded assertion and fails this one.
    for (const col of ['real', 'seeded']) {
      const column = page.locator(`.key-col[data-col="${col}"]`);
      const rows = column.locator('.check-row');
      const passing = column.locator('.check-row-ok');
      const total = await rows.count();
      const passed = await passing.count();
      expect(total).toBe(4);
      expect(passed).toBe(4);
      await expect(column.locator('.key-col-count')).toHaveText(`${passed} of ${total} checks passed`);
      // Every row prints what it MEASURED, not only whether it passed.
      for (const observed of await column.locator('.check-row-observed').allInnerTexts()) {
        expect(observed).toMatch(/\d/);
      }
    }

    // The headline is computed from both columns, and quotes the row count.
    const headline = await page.locator('[data-verdict="look-random"] .verdict-headline').innerText();
    expect(headline).toBe('BOTH PASSED ALL 4 CHECKS');

    // And the two keys really are different 32-byte values, which is what makes the
    // columns a comparison rather than a mirror.
    const keys = await page.locator('.key-col-key-code').allInnerTexts();
    expect(keys).toHaveLength(2);
    expect(tight(keys[0]!)).toHaveLength(64);
    expect(tight(keys[1]!)).not.toBe(tight(keys[0]!));
  });

  test('the two columns are IDENTICAL in everything but their labels', async ({ page }) => {
    await boot(page, 'dark');
    await makeKeys(page);
    // The build brief's requirement, as a test: "visually indistinguishable, both
    // passing the reader's own checks, neither marked". The check-row structure of the
    // two columns is compared element for element, so a future edit that tinted one
    // of them, or gave one an extra row, fails here rather than at review.
    const shape = await page.locator('.key-col').evaluateAll((cols) =>
      cols.map((c) => ({
        rowClasses: Array.from(c.querySelectorAll('.check-row')).map((r) => r.className),
        states: Array.from(c.querySelectorAll('.check-row-state')).map((r) => r.textContent),
        marks: c.querySelectorAll('.key-col-mark').length,
        colClass: c.className,
      }))
    );
    expect(shape[1]!.rowClasses).toEqual(shape[0]!.rowClasses);
    expect(shape[1]!.states).toEqual(shape[0]!.states);
    expect(shape[1]!.colClass).toBe(shape[0]!.colClass);
    expect(shape[0]!.marks).toBe(0);
    expect(shape[1]!.marks).toBe(0);
  });

  test('the panel carries NO verdict tone until Step 3 resolves it', async ({ page }) => {
    await boot(page, 'dark');
    witness(test.info().title, 'look-random');
    await makeKeys(page);
    const verdict = page.locator('[data-verdict="look-random"]');
    // The brief: "No colour until panel 3 resolves which was which. Painting the
    // seeded one red in panel 2 would give the game away and destroy the lesson."
    await expect(verdict).toHaveAttribute('data-tone', 'neutral');
    await expect(page.locator('.key-col-mark')).toHaveCount(0);
    await expect(page.locator('.key-col-recovered')).toHaveCount(0);
    await expect(page.locator('.key-col-untouched')).toHaveCount(0);
    // And it says so in words rather than leaving the absence of colour to carry it.
    await expect(verdict).toContainText('Looking random is not evidence of anything');

    // Then the recovery repaints it, which is the one state change in this lab that
    // cannot be undone without a reload.
    await searchAll(page);
    await expect(verdict).toHaveAttribute('data-tone', 'alarm');
    await expect(page.locator('.key-col-mark')).toHaveCount(2);
    const pin = await recoveredPin(page);
    // The mark names the SAME PIN the recovery found, which is the cross-check that
    // catches a repaint wired to the wrong value.
    await expect(page.locator('.key-col[data-col="seeded"] .key-col-mark')).toContainText(pin);
    // And it says the marks came from Step 3, not from the checks.
    await expect(verdict).toContainText('put there by Step 3, not by the checks');
  });

  /*
   * THE PANEL MAY NOT REPORT A SEARCH THAT DID NOT RUN.
   *
   * This is the test that should have existed from the start, and its absence let a
   * real defect ship: recovering Source B set one flag, Step 2 read that flag for BOTH
   * columns, and Source A was immediately stamped "ten thousand guesses found nothing
   * here" with the comparison announcing that the same search against Source A had come
   * back empty. No such search had run.
   *
   * Worse, the test above USED TO ASSERT THAT BEHAVIOUR — it required Source A to read
   * "found nothing" after only Source B had been searched. A test that pins the bug is
   * the failure §4.1b warns about in as many words, and it is why this one checks the
   * two orders separately rather than checking that the page agrees with itself.
   */
  test('Source A is never reported as searched until it has been', async ({ page }) => {
    await boot(page, 'dark');
    witness(test.info().title, 'look-random');
    await makeKeys(page);
    await searchAll(page);

    const aMark = page.locator('.key-col[data-col="real"] .key-col-mark');
    await expect(aMark).toHaveText('Not searched yet');
    await expect(aMark).not.toContainText('found nothing');
    // Asserted against the DOM rather than the prose alone: no Source A verdict exists.
    await expect(page.locator('[data-verdict="no-seed"]')).toHaveCount(0);
    const said = await page.locator('[data-verdict="look-random"]').innerText();
    expect(said).toContain('Source A has NOT been searched yet');
    expect(said).not.toContain('came back with nothing');

    // Only once it really runs does the mark appear, and it quotes the count that ran.
    await page.getByRole('button', { name: 'Run the same search against Source A' }).click();
    await page.waitForSelector('[data-verdict="no-seed"]');
    await expect(aMark).toContainText('10,000 guesses found nothing here');
  });

  test('the other order is just as truthful: Source A first', async ({ page }) => {
    await boot(page, 'dark');
    witness(test.info().title, 'look-random');
    await makeKeys(page);
    await page.getByRole('button', { name: 'Run the same search against Source A' }).click();
    await page.waitForSelector('[data-verdict="no-seed"]');

    const verdict = page.locator('[data-verdict="look-random"]');
    // Source A reports its real result; Source B reports that nothing has been tried.
    await expect(page.locator('.key-col[data-col="real"] .key-col-mark')).toContainText(
      'found nothing here'
    );
    await expect(page.locator('.key-col[data-col="seeded"] .key-col-mark')).toHaveText(
      'Not searched yet'
    );
    // AND THE TONE IS STILL NEUTRAL. Ruling out Source A demonstrates nothing alarming;
    // the alarm belongs to Source B being recovered, which has not happened.
    await expect(verdict).toHaveAttribute('data-tone', 'neutral');
    await expect(verdict).toContainText('SOURCE A HELD — AND THAT SETTLES NOTHING');

    await searchAll(page);
    await expect(verdict).toHaveAttribute('data-tone', 'alarm');
    await expect(page.locator('.key-col[data-col="seeded"] .key-col-mark')).toContainText(
      await recoveredPin(page)
    );
  });

  test('both results are retired together when the keys change', async ({ page }) => {
    await boot(page, 'dark');
    await makeKeys(page);
    await searchAll(page);
    await page.getByRole('button', { name: 'Run the same search against Source A' }).click();
    await page.waitForSelector('[data-verdict="no-seed"]');
    await expect(page.locator('.key-col-mark')).toHaveCount(2);

    await makeKeys(page);
    // A Source A result that survived the regeneration would be the same lie in slower
    // motion: a mark describing a search against a key that no longer exists.
    await expect(page.locator('.key-col-mark')).toHaveCount(0);
    await expect(page.locator('[data-verdict="look-random"]')).toHaveAttribute(
      'data-tone',
      'neutral'
    );
  });

  test('the obviously bad generator is caught, and the page counts what it still passed', async ({
    page,
  }) => {
    await boot(page, 'dark');
    witness(test.info().title, 'visible-pattern');
    await page.getByRole('button', { name: 'Run them on an obviously bad generator' }).click();
    const verdict = page.locator('[data-verdict="visible-pattern"]');
    await expect(verdict).toBeVisible();
    // A refusal that is CORRECT, so `held` and not `fail`: the checks doing their job
    // is not a fault.
    await expect(verdict).toHaveAttribute('data-tone', 'held');

    // CROSS-CHECK: the headline's failure count against the failing rows, and the
    // detail's pass count against the passing rows. Both are counted from the rows,
    // so a check hard-wired to pass moves the rows and the numbers together — and the
    // numbers then disagree with the row CLASSES, which is what fails.
    const rows = page.locator('#p2-broken-out .check-row');
    const failing = await page.locator('#p2-broken-out .check-row-bad').count();
    const passing = await page.locator('#p2-broken-out .check-row-ok').count();
    const total = await rows.count();
    expect(total).toBe(4);
    expect(failing).toBeGreaterThan(0);
    expect(failing + passing).toBe(total);
    await expect(verdict.locator('.verdict-headline')).toHaveText(
      `CAUGHT — ${failing} OF ${total} CHECKS FAILED`
    );
    await expect(verdict).toContainText(`still PASSED ${passing} of the ${total}`);

    // THE COUNTING CHECK SPECIFICALLY MUST CATCH A COUNTER, and this is an
    // INDEPENDENT RE-DERIVATION rather than a cross-check: a counter's step is 1 and
    // there are 31 gaps between 32 bytes, so the test knows what the page should have
    // measured without asking the page.
    //
    // It is here because the three count assertions above are not enough on their
    // own. They are all computed from the same rows, so a check hard-wired to pass
    // moves the rows and every number with them and they stay perfectly consistent —
    // which is exactly the "a page can be consistently wrong" failure §4.1b warns
    // about. This one names the check that must fail and what it must say.
    const counting = page.locator('#p2-broken-out .check-row', {
      has: page.locator('[data-check="counting"]'),
    });
    await expect(counting).toHaveClass(/check-row-bad/);
    await expect(counting.locator('.check-row-observed')).toHaveText(
      'every one of the 31 steps is exactly 1'
    );

    // And the honest consequence is stated: a check passing has never meant much.
    await expect(verdict).toContainText('A check passing has never meant very much');
  });

  test('the one-in-two guess names Source B either way, and refuses to congratulate', async ({
    page,
  }) => {
    await boot(page, 'dark');
    await makeKeys(page);
    const result = page.locator('#p2-which-out');

    await page.locator('.check-opt', { hasText: 'Source A is the guessable one' }).click();
    await expect(result).toHaveClass(/pill-bad/);
    await expect(result).toContainText('Source B is the seeded one');
    await expect(result).toContainText('Real keys arrive without headings');

    await page.locator('.check-opt', { hasText: 'Source B is the guessable one' }).click();
    await expect(result).toHaveClass(/pill-ok/);
    // THE HONEST NOTE IS THE POINT, and it used to be the wrong note. This called the
    // choice "one-in-two", which it is not: the column headings say which source is
    // which, so a reader who reads them is not guessing at all. Claiming a coin flip
    // over a labelled choice overstates what the exhibit demonstrates.
    await expect(result).toContainText('You read the label, not the bytes');
    await expect(result).toContainText('this was not a blind test');
    await expect(result).not.toContainText('one-in-two');
  });
});

test.describe('Step 3: the recovery, checked by an independent route', () => {
  test('the gate note names what is missing, and the controls are really inert', async ({
    page,
  }) => {
    await boot(page, 'dark');
    // A control that looks available and silently does nothing is worse for a
    // beginner than a disabled one, so the prerequisite is declared per control and
    // the sentence beside it names the thing to go and do.
    await expect(page.locator('#panel-3 .gate-note')).toContainText('Make the two keys in Step 2');
    for (const id of ['try-guess', 'search-seeded', 'search-real']) {
      await expect(page.locator(`#${id}`)).toBeDisabled();
    }
    await makeKeys(page);
    await expect(page.locator('#panel-3 .gate-note')).toBeHidden();
    for (const id of ['try-guess', 'search-seeded', 'search-real']) {
      await expect(page.locator(`#${id}`)).toBeEnabled();
    }
  });

  test('exactly one of the four candidate PINs opens the message', async ({ page }) => {
    await boot(page, 'dark');
    witness(test.info().title, 'guess');
    await makeKeys(page);
    const pins = await page
      .locator('.pin-choice input')
      .evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));
    expect(pins).toHaveLength(4);

    const outcomes: string[] = [];
    for (const pin of pins) {
      await page.locator(`#pin-${pin}`).check();
      await page.getByRole('button', { name: 'Try this guess' }).click();
      const verdict = page.locator('[data-verdict="guess"]');
      await expect(verdict).toBeVisible();
      outcomes.push((await verdict.getAttribute('data-tone')) ?? '');
    }
    // ONE hit and three misses. This is the assertion that catches both halves of a
    // broken guess path at once: a path hard-wired to succeed gives four alarms, and
    // one hard-wired to fail gives four neutrals. Neither passes.
    expect(outcomes.filter((t) => t === 'alarm')).toHaveLength(1);
    expect(outcomes.filter((t) => t === 'neutral')).toHaveLength(3);
  });

  test('a wrong guess establishes NOTHING, and the page says so', async ({ page }) => {
    await boot(page, 'dark');
    witness(test.info().title, 'guess');
    await makeKeys(page);
    // Find a PIN that is not the one used, by trying until one misses.
    const pins = await page
      .locator('.pin-choice input')
      .evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));
    let missed: string | null = null;
    for (const pin of pins) {
      await page.locator(`#pin-${pin}`).check();
      await page.getByRole('button', { name: 'Try this guess' }).click();
      const verdict = page.locator('[data-verdict="guess"]');
      await expect(verdict).toBeVisible();
      if ((await verdict.getAttribute('data-tone')) === 'neutral') {
        missed = pin;
        break;
      }
    }
    expect(missed, 'at least three of the four candidates must miss').toBeTruthy();
    const verdict = page.locator('[data-verdict="guess"]');
    // NEUTRAL, not `held`. A miss is not the generator resisting — painting it as a
    // correct refusal would teach exactly the thing this lab exists to remove.
    await expect(verdict).toHaveAttribute('data-tone', 'neutral');
    await expect(verdict.locator('.verdict-headline')).toHaveText('REJECTED');
    await expect(verdict).toContainText(`${missed} was not it`);
    await expect(verdict).toContainText('not that the key is sound');
    await expect(verdict).toContainText('You have ruled out one number');
    // It names the oracle the attack actually uses, which is the thing that makes the
    // whole search possible and the thing a beginner has no way to guess at.
    await expect(verdict).toContainText('own integrity check');
    await expect(verdict).toContainText('Nothing compared it with the real key');
    // Nothing was recovered, so nothing came back and Step 2 is still the trap.
    await expect(page.locator('#p3-guess-out .recovered-text')).toHaveCount(0);
  });

  test('the recovered key is real: rebuilt and the message opened by OpenSSL', async ({ page }) => {
    await boot(page, 'dark');
    witness(test.info().title, 'recovered');
    await makeKeys(page);
    await searchAll(page);

    const pin = await recoveredPin(page);
    expect(pin).toMatch(/^\d{4}$/);

    // Everything the page put on screen, read off the page.
    await page.locator('summary', { hasText: 'Show the key that was rebuilt' }).click();
    await page.locator('summary', { hasText: 'Show the encrypted bytes' }).click();
    const keyHex = tight(
      await page.locator('[data-label="The 32 bytes, worked out from the PIN"] code').innerText()
    );
    const nonceHex = tight(
      await page.locator('[data-label="The nonce, which is not a secret"] code').innerText()
    );
    const sealedHex = tight(
      await page.locator('[data-label="The encrypted message, with its tag"] code').innerText()
    );
    const plaintext = await page.locator('#p3-recovered-out .recovered-text').innerText();

    // ── THE INDEPENDENT RE-DERIVATION ──────────────────────────────────────
    // Rebuild the key from the PIN using OpenSSL's SHA-256 and OpenSSL's ChaCha20,
    // through node:crypto. Not one line of `src/` is involved, so a hand-rolled
    // cipher that is wrong in a self-consistent way cannot agree with this.
    const cipherKey = createHash('sha256').update(pin, 'utf8').digest();
    const rebuilt = opensslKeystream(cipherKey, 0, Buffer.alloc(12), 32);
    expect(rebuilt.toString('hex')).toBe(keyHex);

    // And open the message with OpenSSL's AES-256-GCM. The tag verifies, so this is
    // not a comparison that could succeed by accident: a wrong key throws.
    expect(opensslGcmOpen(rebuilt, unhex(nonceHex), unhex(sealedHex))).toBe(plaintext);

    // The key the page rebuilt is the key Step 2 printed for Source B — the two
    // surfaces must agree, and nothing told the search what that value was.
    const seededKeyOnScreen = tight(
      await page.locator('.key-col[data-col="seeded"] .key-col-key-code').innerText()
    );
    expect(keyHex).toBe(seededKeyOnScreen);

    // The headline is the §4.1d shape: success and failure at once.
    await expect(page.locator('[data-verdict="recovered"] .verdict-headline')).toHaveText(
      'PASSED EVERY CHECK — AND FULLY RECOVERED'
    );
    await expect(page.locator('[data-verdict="recovered"]')).toHaveAttribute('data-tone', 'alarm');
  });

  test('the recovery reports its cost honestly: the try it hit on AND the whole space', async ({
    page,
  }) => {
    await boot(page, 'dark');
    witness(test.info().title, 'recovered');
    await makeKeys(page);
    await searchAll(page);
    const pin = await recoveredPin(page);
    const text = await page.locator('[data-verdict="recovered"]').innerText();

    // INDEPENDENT RE-DERIVATION of the try number: the candidates are enumerated from
    // 0000 upward, so the PIN's own numeric value plus one IS the try it was found on.
    // A page that printed a try number from a counter that had drifted fails here.
    const onTry = Number(text.match(/found on try ([\d,]+)/)?.[1]?.replace(/,/g, ''));
    expect(onTry).toBe(Number(pin) + 1);

    // CROSS-CHECK against the progress bar, which is a different surface written by a
    // different code path.
    const bar = page.locator('[role="progressbar"]');
    await expect(bar).toHaveAttribute('aria-valuemax', '10000');
    await expect(bar).toHaveAttribute('aria-valuenow', '10000');
    await expect(page.locator('.progress-count')).toHaveText('10,000 of 10,000 tried');
    expect(text).toContain('All 10,000 candidates were then tested anyway');

    // The page distinguishes the two numbers rather than quoting the flattering one.
    expect(text).toContain(`A stranger would have stopped at try ${onTry.toLocaleString('en-GB')}`);
    // And it says what the ten thousand actually ARE. This is the build brief's own
    // framing and it is literally true of the sweep that just ran: one key was derived
    // per candidate, and the candidates are the whole seed space — so the page did not
    // find A key, it enumerated all of them. A page that claimed this over a search
    // which had stopped early would be overstating, which is why it sits beside the
    // assertion above that the full count and the hit are reported separately.
    // SCOPED. This used to read "every seed this generator can be given" and "every
    // key it will ever produce", and neither is true: seededBytes accepts any string
    // at all -- Step 1's recipe box proves it -- and a generator run on past its first
    // 32 bytes keeps going. What the sweep really enumerated is still the point.
    expect(text).toContain('they are every four-digit PIN there is');
    expect(text).toContain('every PIN a program could have started from');
    expect(text).not.toContain('every seed this generator can be given');
    // And it says nothing was broken to do it, which is the lesson.
    expect(text).toContain('Nothing was broken to do this');
    expect(text).toContain('a full 256 bits');
  });

  test('the same search against the real key finds nothing, and proves it did the work', async ({
    page,
  }) => {
    await boot(page, 'dark');
    witness(test.info().title, 'no-seed');
    await makeKeys(page);
    await page.getByRole('button', { name: 'Run the same search against Source A' }).click();
    const verdict = page.locator('[data-verdict="no-seed"]');
    await expect(verdict).toBeVisible();
    // HELD, not fail: finding nothing is the correct outcome and must not read as a
    // fault. This is the tone assertion the brief's visual semantics require.
    await expect(verdict).toHaveAttribute('data-tone', 'held');
    await expect(verdict.locator('.verdict-headline')).toHaveText('NOTHING TO FIND');

    const text = await verdict.innerText();
    // It did the SAME work. "Found nothing" is also what a search that gave up early
    // produces, so the count is stated and cross-checked against the progress bar.
    expect(text).toContain('the same 10,000 candidates');
    await expect(page.locator('[role="progressbar"]')).toHaveAttribute('aria-valuenow', '10000');
    // And the failure is the search's, not the cipher's: the page checked that the
    // message still opens under the key that sealed it, and says so.
    expect(text).toContain('still perfectly readable with the key that made it');
    expect(text).toContain('this is the search failing, not the cipher');
    // No key was rebuilt, so none is shown.
    await expect(page.locator('#p3-noseed-out .recovered-text')).toHaveCount(0);
  });
});

/**
 * THE NEGATIVE CLAIM (§4.1d).
 *
 * The build brief names it: the belief a beginner most likely leaves with wrongly is
 * *"if the output looks random, the generator is fine."* The fixture is the state in
 * which the seeded generator's output has passed every one of the page's own
 * look-random checks AND its key has been rebuilt from a number a stranger can count
 * to.
 *
 * It is scoped to the construction on the page — these four checks, this generator —
 * and not to the field. "No test of output can detect a weak seed" would be a
 * stronger claim than this page demonstrates and is not what the sentence says.
 *
 * Three assertions, as the standard requires: reach the fixture through the UI, show
 * that EVERYTHING is green in that state, and show the limitation is on screen in that
 * state — visible, not in the README, not behind a disclosure.
 *
 * Assertion 2 is the one that makes this a result rather than a disclaimer. If any
 * check in the fixture failed, the fixture would be demonstrating the mechanism
 * working rather than its limit.
 */
test.describe('the negative claim: looking random establishes nothing', () => {
  test('every check passes, and the key is recovered anyway', async ({ page }) => {
    await boot(page, 'dark');
    witness(test.info().title, 'recovered');

    // 1. REACH THE FIXTURE, through the controls a reader has.
    await makeKeys(page);
    await searchAll(page);
    const fixture = page.locator('[data-verdict="recovered"]');
    await expect(fixture).toBeVisible();

    // 2. EVERYTHING IS GREEN — asserted against the RENDERED state, not a flag this
    // test set.
    //
    // No verdict anywhere is in the `fail` tone, and nothing has been superseded.
    await expect(page.locator('[data-verdict][data-tone="fail"]')).toHaveCount(0);
    await expect(page.locator('[data-verdict-retired]')).toHaveCount(0);
    // EVERY ONE of the eight check rows reports PASS — both columns, all four checks.
    // This is the assertion that makes the claim a result: the page's own checks are
    // unanimous in exactly the state where the key has just been handed over.
    await expect(page.locator('.check-row')).toHaveCount(8);
    await expect(page.locator('.check-row-ok')).toHaveCount(8);
    await expect(page.locator('.check-row-bad')).toHaveCount(0);
    // The pinned cases still agree, so the cipher is the real one.
    await expect(page.locator('[data-verdict="pinned"]')).toHaveAttribute('data-tone', 'pass');
    // And the decryption in the fixture SUCCEEDED — the property really is violated.
    const recovered = await page.locator('#p3-recovered-out .recovered-text').innerText();
    expect(recovered.length).toBeGreaterThan(0);

    // 3. THE LIMITATION IS ON SCREEN IN THIS STATE — visible, and tied to this
    // fixture rather than floating somewhere else on the page.
    const claim = page.locator('#p3-recovered-out .negative-claim');
    await expect(claim).toBeVisible();
    await expect(claim).toContainText('establishes nothing about whether a generator can be predicted');
    await expect(claim).toContainText('four-digit PIN');
    expect(
      await claim.evaluate((node) => node.closest('details') !== null),
      'the negative claim must not sit inside a disclosure'
    ).toBe(false);

    // And the page says why there is no error code, which is the exhibit. Where the
    // construction has no failure to raise, the absence of a code IS the result, and
    // a lab that invented one to look thorough would teach the opposite.
    const note = page.locator('#p3-recovered-out .claim-note');
    await expect(note).toContainText('no error code to show you here');
    await expect(note).toContainText('Nothing failed');
  });

  test('the recap states the limit as a rule, not only as this one result', async ({ page }) => {
    await boot(page, 'dark');
    // Every row of the recap names something observable and what it does NOT
    // establish, which is where the negative claim generalises from one fixture to a
    // habit of mind. Asserted as a shape: four rows, three cells each, none empty.
    const rows = page.locator('.recap-table tbody tr');
    await expect(rows).toHaveCount(4);
    for (let i = 0; i < 4; i += 1) {
      const cells = await rows.nth(i).locator('th, td').allInnerTexts();
      expect(cells).toHaveLength(3);
      for (const cell of cells) expect(cell.trim().length).toBeGreaterThan(3);
    }
    // The headline row of the argument, in the page's own words.
    await expect(page.locator('.recap-table')).toContainText('The output looks random');
    await expect(page.locator('.recap-table')).toContainText('how many keys could have been produced');
  });
});

test.describe('a result always describes inputs that are still on screen', () => {
  test('making the keys again supersedes everything downstream', async ({ page }) => {
    await boot(page, 'dark');
    await makeKeys(page);
    await searchAll(page);
    await page.getByRole('button', { name: 'Run the same search against Source A' }).click();
    await page.waitForSelector('[data-verdict="no-seed"]');

    const before = await statusOf(page);
    expect(before['recovered']).toBe('fresh');
    expect(before['no-seed']).toBe('fresh');

    await makeKeys(page);
    const after = await statusOf(page);
    // The stale verdicts are GONE, and the page says they were retired rather than
    // quietly removing them. A stale result that still reads as a result is worse than
    // no result, because a reader cannot tell which state it describes.
    expect(after['recovered']).toBe('stale');
    expect(after['no-seed']).toBe('stale');
    await expect(page.locator('[data-verdict-retired="recovered"]')).toContainText('OUT OF DATE');
    // The notice says what to DO, naming this panel's own next action.
    await expect(page.locator('[data-verdict-retired="recovered"]')).toContainText('Search again');
    // Step 1's verdicts are NOT downstream of the keys and must survive untouched.
    await page.getByRole('button', { name: 'Roll five dice' }).click();
    await makeKeys(page);
    expect((await statusOf(page))['dice-real']).toBe('fresh');
  });

  test('changing the recipe retires the roll it was about', async ({ page }) => {
    await boot(page, 'dark');
    await page.getByRole('button', { name: 'Roll with this recipe' }).click();
    await page.getByRole('button', { name: 'Roll with this recipe' }).click();
    expect((await statusOf(page))['same-again']).toBe('fresh');
    await page.locator('#recipe').fill('a different word');
    const after = await statusOf(page);
    expect(after['same-again']).toBe('stale');
    // And the notice names the recipe box rather than reporting that a dependency moved.
    await expect(page.locator('[data-verdict-retired="same-again"]')).toContainText(
      'recipe now in the box'
    );
  });

  test('re-entering the SAME recipe does not retire a fresh result', async ({ page }) => {
    await boot(page, 'dark');
    await page.getByRole('button', { name: 'Roll with this recipe' }).click();
    await page.getByRole('button', { name: 'Roll with this recipe' }).click();
    expect((await statusOf(page))['same-again']).toBe('fresh');
    // The no-op guard. Setting a field back to the value it already held recomputes an
    // identical basis, so only a REAL change retires anything.
    await page.locator('#recipe').fill('monday');
    expect((await statusOf(page))['same-again']).toBe('fresh');
    // And re-selecting the same PIN does not retire a fresh guess, for the same reason.
    await makeKeys(page);
    const pin = await page.locator('.pin-choice input:checked').getAttribute('value');
    await page.getByRole('button', { name: 'Try this guess' }).click();
    await page.waitForSelector('[data-verdict="guess"]');
    await page.locator(`#pin-${pin}`).check();
    expect((await statusOf(page))['guess']).toBe('fresh');
  });

  test('nothing can move the ground under a running search', async ({ page }) => {
    await boot(page, 'dark');
    await makeKeys(page);
    // Start the sweep and, WITHOUT waiting for it, check that every control which
    // could change what it is searching is inert. This is not a tidiness assertion:
    // a search holds its ciphertext in a local, so new keys made halfway through
    // would let it finish against the old message and then record the NEW keys as
    // its basis — and a basis captured after the inputs moved is indistinguishable
    // from one that never moved, so `retireStale` would leave a stale result
    // standing as a fresh one. The retirement machinery cannot see this door; it is
    // held shut instead.
    const sweep = page.getByRole('button', { name: /Try all/ }).click();
    await expect(page.locator('#panel-3')).toHaveAttribute('aria-busy', 'true');
    for (const id of ['make-keys', 'try-guess', 'search-seeded', 'search-real']) {
      await expect(page.locator(`#${id}`), `#${id} must be inert during a search`).toBeDisabled();
    }
    await sweep;
    await page.waitForSelector('[data-verdict="recovered"]');
    // And everything comes back afterwards, including the ungated Step 2 button —
    // which `settled()` does not restore, because it only re-enables controls that
    // declare a prerequisite.
    await expect(page.locator('#panel-3')).not.toHaveAttribute('aria-busy', 'true');
    for (const id of ['make-keys', 'try-guess', 'search-seeded', 'search-real']) {
      await expect(page.locator(`#${id}`)).toBeEnabled();
    }
  });

  test('the finish link waits for BOTH halves of Step 3', async ({ page }) => {
    await boot(page, 'dark');
    await makeKeys(page);
    // A lucky one-in-four guess is a real recovery, and it used to be enough to offer
    // the recap -- so a reader could be sent to the summary having seen neither the
    // ten-thousand count nor the half that makes it mean anything.
    await searchAll(page);
    await expect(page.locator('#p3-next .next-step-link')).toHaveCount(0);
    await page.getByRole('button', { name: 'Run the same search against Source A' }).click();
    await page.waitForSelector('[data-verdict="no-seed"]');
    await expect(page.locator('#p3-next .next-step-link')).toBeVisible();
  });

  test('a [hidden] element really is not rendered', async ({ page }) => {
    await boot(page, 'dark');
    // The `[hidden]` cascade trap: a class rule setting `display` outranks the UA's
    // `[hidden]` rule, so an element paints while the code believes it is hidden. Four
    // live instances are recorded in the build standard. Asked of the
    // DOM rather than of the stylesheet.
    const painted = await page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLElement>('[hidden]'))
        .filter((el) => el.checkVisibility({ checkVisibilityCSS: true }))
        .map((el) => `${el.tagName.toLowerCase()}#${el.id}`)
    );
    expect(painted).toEqual([]);
  });
});

test.describe('what one attempt looks like', () => {
  test('the attacker is shown what it was handed BEFORE it runs', async ({ page }) => {
    await boot(page, 'dark');
    // Nothing to show before there is a ciphertext.
    await expect(page.locator('#p3-intercepted summary')).toHaveCount(0);
    await makeKeys(page);
    // A reader cannot judge whether an attack is impressive or trivial until they know
    // what it was given, so this is available before the search rather than after it.
    const summary = page.locator('#p3-intercepted summary');
    await expect(summary).toBeVisible();
    await summary.click();
    await expect(page.locator('#p3-intercepted [data-label="The nonce, which is not a secret"]')).toBeVisible();
    await expect(page.locator('#p3-intercepted')).toContainText('no key, no PIN, no message');
  });

  test('a rejected guess shows the key it really built', async ({ page }) => {
    await boot(page, 'dark');
    witness(test.info().title, 'guess');
    await makeKeys(page);
    const pins = await page
      .locator('.pin-choice input')
      .evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));
    let missed: string | null = null;
    for (const pin of pins) {
      await page.locator(`#pin-${pin}`).check();
      await page.getByRole('button', { name: 'Try this guess' }).click();
      await expect(page.locator('[data-verdict="guess"]')).toBeVisible();
      if ((await page.locator('[data-verdict="guess"]').getAttribute('data-tone')) === 'neutral') {
        missed = pin;
        break;
      }
    }
    expect(missed).toBeTruthy();
    // The common outcome of a single guess is a miss, so a miss that showed nothing
    // meant the one state a reader almost always meets was the one state with no
    // mechanism visible in it.
    await page.locator('summary', { hasText: 'Show the key this wrong PIN produced' }).click();
    const built = tight(
      await page.locator(`[data-label="The 32 bytes behind the PIN ${missed}"] code`).innerText()
    );
    expect(built).toHaveLength(64);

    // INDEPENDENT RE-DERIVATION: that really is the key those four digits produce,
    // recomputed here with OpenSSL rather than with this lab's own modules.
    const cipherKey = createHash('sha256').update(missed as string, 'utf8').digest();
    expect(opensslKeystream(cipherKey, 0, Buffer.alloc(12), 32).toString('hex')).toBe(built);

    // And it is NOT Source B's key, which is why the message refused it.
    const real = tight(
      await page.locator('.key-col[data-col="seeded"] .key-col-key-code').innerText()
    );
    expect(built).not.toBe(real);
  });
});

test.describe('the comparison that is the remedy', () => {
  test('names the decision row, and scopes what the null result proves', async ({
    page,
  }) => {
    await boot(page, 'dark');
    witness(test.info().title, 'no-seed');
    await makeKeys(page);
    await searchAll(page);
    await page.getByRole('button', { name: 'Run the same search against Source A' }).click();
    await page.waitForSelector('[data-verdict="no-seed"]');

    const rows = page.locator('#p3-noseed-out .recap-table tbody tr');
    await expect(rows).toHaveCount(5);
    // CROSS-CHECK: the three rows that must read identically for both sources really do,
    // and the row that must differ really does. A table that claimed "same cipher" while
    // the two cells disagreed would pass a hardcoded assertion and fails this one.
    for (const label of ['Encryption', 'Key length', 'Step 2 checks']) {
      const cells = await rows
        .filter({ hasText: label })
        .locator('td')
        .allInnerTexts();
      expect(cells, `${label} must read the same for both sources`).toHaveLength(2);
      expect(cells[0]).toBe(cells[1]);
    }
    const started = await rows.filter({ hasText: 'Where the key started' }).locator('td').allInnerTexts();
    expect(started[0]).not.toBe(started[1]);
    const note = page.locator('#p3-noseed-out .claim-note');
    await expect(note).toContainText('keep the encryption, change where the key starts');
    // THE NOTE MUST NOT MISCOUNT ITS OWN TABLE. It said "one row differs" when two do
    // -- the setup row and the outcome row -- which is the kind of small overstatement
    // this lab cannot afford. The division it draws now is between the rows that
    // describe a decision and the one that describes what the decision cost.
    await expect(note).toContainText('Only one row describes a decision');
    await expect(note).not.toContainText('One row differs');
    const differing = (await rows.evaluateAll((rs) =>
      rs.filter((r) => {
        const [b, a] = [...r.querySelectorAll('td')].map((c) => c.textContent?.trim());
        return b !== a;
      }).length
    )) as number;
    expect(differing, 'two rows differ: the decision and its consequence').toBe(2);

    // The null result is scoped: this attack found nothing, which is not a proof that
    // none could.
    await expect(page.locator('[data-verdict="no-seed"]')).toContainText(
      'not a proof that no attack ever could'
    );
  });

  test('the comparison is not drawn before both halves exist', async ({ page }) => {
    await boot(page, 'dark');
    witness(test.info().title, 'no-seed');
    await makeKeys(page);
    await page.getByRole('button', { name: 'Run the same search against Source A' }).click();
    await page.waitForSelector('[data-verdict="no-seed"]');
    // Source B has not been searched, so there is no "This PIN attack" row to fill in
    // honestly -- and a comparison against an experiment that has not run is the exact
    // defect this pass was opened to fix.
    await expect(page.locator('#p3-noseed-out .recap-table')).toHaveCount(0);
  });
});

test.describe('the pinned cases, and what they are allowed to claim', () => {
  test('the headline counts its own rows, and separates published from derived', async ({
    page,
  }) => {
    await boot(page, 'dark');
    witness(test.info().title, 'pinned');
    const verdict = page.locator('[data-verdict="pinned"]');
    const headline = await verdict.locator('.verdict-headline').innerText();
    const [, agreed, total] = headline.match(/^(\d+) OF (\d+) AGREE$/) ?? [];

    await page.locator('#pinned-out details > summary').click();
    const rows = await page.locator('#pinned-out .case').count();
    const ok = await page.locator('#pinned-out .case-ok').count();
    // CROSS-CHECK: the headline against the rows it counts. A page printing "10 OF 10"
    // over nine rows passes a hardcoded assertion and fails this one.
    expect(Number(total)).toBe(rows);
    expect(Number(agreed)).toBe(ok);
    expect(Number(agreed)).toBe(Number(total));
    await expect(verdict).toHaveAttribute('data-tone', 'pass');

    // THE SPLIT IS COUNTED, NOT QUOTED. Folding this lab's own derived cases into the
    // published count would borrow RFC 8439's authority for cases this lab invented.
    const published = await page.locator('#pinned-out .case-where', { hasText: 'published' }).count();
    const derived = await page.locator('#pinned-out .case-where', { hasText: 'this lab' }).count();
    expect(published + derived).toBe(rows);
    expect(derived).toBeGreaterThan(0);
    await expect(verdict).toContainText(`${published} of the ${rows} are published vectors`);
    await expect(verdict).toContainText(`The other ${derived} are this lab’s own`);
  });

  test('the must-differ half exists, and says what it is for', async ({ page }) => {
    await boot(page, 'dark');
    await page.locator('#pinned-out details > summary').click();
    const mustDiffer = await page.locator('#pinned-out .case-kind', { hasText: 'must differ' }).count();
    const mustMatch = await page.locator('#pinned-out .case-kind', { hasText: 'must match' }).count();
    // The half with teeth. A regeneration that dropped it would leave a panel that
    // passes while measuring only the direction an input-ignoring build satisfies.
    expect(mustDiffer).toBeGreaterThan(0);
    expect(mustMatch).toBeGreaterThan(mustDiffer);
    await expect(page.locator('[data-verdict="pinned"]')).toContainText(
      'ignoring its nonce would pass the published cases and fail here'
    );
  });

  test('the source is RFC 8439, and the page admits the transcription was checked', async ({
    page,
  }) => {
    await boot(page, 'dark');
    const line = await page.locator('#pinned-out .source-line').innerText();
    expect(line).toContain('RFC 8439');
    await expect(page.locator('#pinned-out .source-line a')).toHaveAttribute(
      'href',
      'https://www.rfc-editor.org/rfc/rfc8439'
    );
    // The honest part: the numbers were transcribed by hand, one was wrong, and a
    // separate implementation checks them on every build. A page that said only
    // "from RFC 8439" would be claiming more than it can support.
    expect(line).toContain('transcribed by hand');
    expect(line).toContain('separate implementation');
  });
});

/**
 * What the brief says must NOT be on this page.
 *
 * "No entropy figures, no min-entropy, no statistical test names, no state diagrams."
 * That is a scoping decision with teeth — the lab's whole approach is to count tries
 * instead — and a rule nothing checks is a rule that drifts the first time somebody
 * adds a "helpful" number. So it is checked.
 */
test.describe('the vocabulary this lab deliberately does not use', () => {
  test('counts tries, and never quotes entropy or a test battery', async ({ page }) => {
    await boot(page, 'dark');
    // Reach the state carrying the most prose on the page, so the check covers the
    // rendered verdicts and not only the static markup.
    await makeKeys(page);
    await page.getByRole('button', { name: 'Run them on an obviously bad generator' }).click();
    await searchAll(page);
    await page.getByRole('button', { name: 'Run the same search against Source A' }).click();
    await page.waitForSelector('[data-verdict="no-seed"]');
    for (const summary of await page.locator('details > summary').all()) await summary.click();

    const prose = (await page.locator('#app').innerText()).toLowerCase();
    for (const banned of [
      'min-entropy',
      'bits of entropy',
      'shannon',
      'chi-squared',
      'chi squared',
      'dieharder',
      'nist sts',
      'statistical test suite',
      'sp 800-90',
    ]) {
      expect(prose, `the brief rules out "${banned}" on this page`).not.toContain(banned);
    }
    // And the thing it uses instead is there: guessability as a count of tries.
    expect(prose).toContain('10,000');
    expect(prose).toContain('tries');
  });

  test('does not teach that determinism is the defect', async ({ page }) => {
    await boot(page, 'dark');
    // The wrong takeaway this lab is most likely to leave behind: that deterministic
    // generators are insecure and the operating system produces numbers nobody could
    // ever guess. Both halves are false and both are easy to pick up from Step 1, so
    // the page has to say otherwise in its own voice.
    await page.locator('#scenario-4 .check-opt').first().click();
    const answer = await page.locator('#scenario-4 .check-result').innerText();
    expect(answer).toContain('Every generator on this page is deterministic');
    expect(answer).toContain('That is not the defect');
    // And Step 1 says it where a reader meets the idea, not only in the quiz.
    await page.getByRole('button', { name: 'Roll with this recipe' }).click();
    await page.getByRole('button', { name: 'Roll with this recipe' }).click();
    await expect(page.locator('[data-verdict="same-again"]')).toContainText(
      'Repeating is not the fault'
    );
  });

  test('never claims that hashing a guessable seed helps', async ({ page }) => {
    await boot(page, 'dark');
    // The most common objection a reader arrives with, and the one a careless page
    // would accidentally endorse. The lab's own generator hashes its seed, so the page
    // has to say explicitly that this buys nothing.
    // The option a reader picks states the arithmetic; the answer states the
    // mechanism. Both surfaces are asserted, because a lab whose generator hashes its
    // own seed cannot afford either of them to go soft.
    const option = page.locator('#scenario-3 .check-opt').first();
    expect(await option.innerText()).toContain('ten thousand inputs gives ten thousand outputs');
    await option.click();
    const answer = await page.locator('#scenario-3 .check-result').innerText();
    expect(answer).toContain('does not create choices that were never there');
    // The page admits that it does this itself, which is what stops the question being
    // rhetorical. It also has to describe its own construction CORRECTLY: this said
    // "Source B's key IS the SHA-256 of a PIN", and it is not -- the hash is ChaCha20's
    // key, and the displayed key is the keystream that comes out of it.
    expect(answer).toContain('this page already does exactly that');
    expect(answer).toContain('the PIN is hashed with SHA-256, and ChaCha20 turns that hash');
    expect(answer).not.toContain('key IS the SHA-256');
    // And a slow password hash is a real brake, which the page must not deny while
    // making the point that it is not a fix.
    await page.locator('#scenario-3 .check-opt').last().click();
    const wrong = await page.locator('#scenario-3 .check-result').innerText();
    expect(wrong).toContain('would be a real improvement in cost');
    expect(wrong).toContain('not a fix');
    // And the remedy named is the right one: more starting points, from a source the
    // attacker cannot enumerate.
    expect(answer).toContain('more starting points');
    expect(answer).toContain('cannot\u2009enumerate'.replace('\u2009', ' '));
  });

  test('the real-world line is scoped to what really happened', async ({ page }) => {
    await boot(page, 'dark');
    const recap = await page.locator('#recap').innerText();
    // Scoped to TLS and SSH hosts shipping duplicate and guessable keys, which is what
    // happened, and explicitly not to a flaw in the cryptography.
    expect(recap).toContain('duplicate and guessable keys');
    expect(recap).toContain('no flaw in the cryptography');
    // And it hands off to the lab that shows it rather than claiming to show it here.
    await expect(
      page.locator('#recap a[href*="entropy-collapse"]')
    ).toHaveCount(1);
  });
});
