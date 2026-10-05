import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';
import { auditContrast, formatContrastFailures } from './contrast';
import { auditNonText } from './nontext';
import { NONTEXT_BASELINE } from './nontext-baseline';

export const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

/**
 * The three widths every state is scanned at.
 *
 * WIDE is the two-column rendering: the hero's why-box beside its title block,
 * Step 2's two key columns side by side, the recap table unscrolled. PHONE is the
 * single-column one. NARROWEST is 320px, which is the floor WCAG 1.4.10 names and
 * the width at which this page's hazards actually live — two 64-character keys, an
 * `auto-fit` grid whose automatic minimum size is the min-content width of its
 * widest child, a four-column recap table, and a row of five dice. 390 passes
 * those by a margin that 320 does not, so scanning only a "phone" width would miss
 * them.
 */
export const WIDE = { width: 1280, height: 900 };
export const PHONE = { width: 390, height: 844 };
export const NARROWEST = { width: 320, height: 800 };

/**
 * Shared machinery for the WCAG gate.
 *
 * Taken from the reference gate the build standard names — the one it records as
 * verified clean on every known oracle defect, including the per-side `paintedSides`
 * border measurement — and then rewritten passage by passage for what THIS lab
 * paints. The oracle engines in `contrast.ts` and `nontext.ts` are code-identical to
 * that reference; everything that describes a page is about this one.
 *
 * Five rules govern everything here, and each one corrects something the retired
 * template gate did:
 *
 *  1. NOTHING IS INJECTED INTO THE PAGE BEFORE A SCAN. The old spec pushed
 *     `animation:none!important; transition:none!important` through `addStyleTag`,
 *     which BYPASSES a lab's own `@media (prefers-reduced-motion: reduce)` block
 *     instead of exercising it. This lab declares no keyframes at all, so the
 *     thing worth measuring is that the block is in effect and that nothing
 *     disappeared once it was. The preference is set through `emulateMedia`,
 *     asserted from inside the page (`test.use({ reducedMotion })` is a measured
 *     no-op on Playwright 1.61.x), and nothing is injected.
 *
 *  2. IT FORCED EVERY PANEL VISIBLE FROM SCRIPT. The old drive stripped every
 *     `[hidden]` attribute and set every `<details>.open` by JS before its only
 *     scan — so the SHUT state, which is what every reader arrives at, was never
 *     scanned, and the `[hidden]` cascade trap became invisible. This lab has five
 *     disclosures and two hidden regions that all ship shut, and this gate opens
 *     each one through its own `<summary>` or reaches it through its own control.
 *
 *  3. IT DROVE BLIND AND THEN THREW THE STATES AWAY. The old drive clicked every
 *     button matching a regex, swallowed every failure with `.catch(() => {})`,
 *     waited a fixed 120ms, and scanned ONCE at the end. Every interesting
 *     rendering in this lab is destroyed by the next click, and one of them —
 *     Step 2's uncoloured verdict — can NEVER BE RECOVERED once Step 3 has run,
 *     because the whole design is that the recovery repaints it. So that state is
 *     scanned before Step 3 is touched, at all three widths, or it is not scanned
 *     at all.
 *
 *  4. `violations` IS NOT THE WHOLE ORACLE. See `scan`, which asserts nine things.
 *     Note what this file does NOT claim, where the reference it came from does:
 *     axe-core 4.12 resolves this page's `color-mix()` fills perfectly well, and
 *     `incomplete` comes back EMPTY here. That was measured, not assumed. The other
 *     eight assertions are still the reason this gate is worth more than an axe call
 *     — reflow, non-text contrast and the focusable-but-invisible check have no axe
 *     rule at all.
 *
 *  5. IT HAD NO REFLOW, NON-TEXT-CONTRAST OR GENERATED-CONTENT ORACLE. The old
 *     spec hand-rolled one luminance check over two input selectors, reading
 *     DECLARED colours — blind to `color-mix()`, to composited backdrops, and to
 *     every state past first paint. `nontext.ts` replaces it with a measured
 *     oracle over every control at every driven state, and
 *     `expectNoHorizontalOverflow` adds the 1.4.10 check axe has no rule for —
 *     which on this page, at 320px, is the check most likely to bite.
 */

/**
 * Wait for every running animation and transition to drain.
 *
 * Two rAFs are not enough. A transition sampled mid-flight has a colour that
 * exists in no state of the page, and axe will happily report it: the build standard
 * records a phantom 2.00:1 failure produced that way, on a button whose settled ratio
 * was 9:1. Transitions also drain in waves rather than in one batch, so a poll for
 * "nothing running right now" can exit through a gap between waves — hence six
 * consecutive quiet frames rather than one.
 *
 * Bounded three ways, because a gate that can hang is a gate nobody runs:
 * animations that never finish (`iterations: Infinity`) are excluded from the
 * quiescence test rather than waited on, a wall-clock budget inside the page gives
 * up and proceeds, and Playwright's own timeout is the backstop.
 *
 * This lab declares NO keyframes, so under the reduced motion this gate asserts
 * there is normally nothing running and this returns on the sixth frame. It stays
 * for two reasons: the shared top bar's `.cl-btn` transitions are declared OUTSIDE
 * this lab's `@media` block and are only cancelled by its
 * `* { transition: none !important }` — a property of today's stylesheet rather
 * than of the page — and the copy button's label revert is a real timer the drive
 * has to not race.
 */
export async function settle(page: Page, budgetMs = 4000): Promise<void> {
  await page.waitForFunction(
    (budget: number) => {
      const w = window as unknown as { __quietFrames?: number; __settleStart?: number };
      if (w.__settleStart === undefined) w.__settleStart = performance.now();
      const done = (): boolean => {
        w.__quietFrames = 0;
        w.__settleStart = undefined;
        return true;
      };
      const running = document.getAnimations().filter((a) => {
        if (a.playState !== 'running') return false;
        const timing = a.effect?.getComputedTiming?.();
        // An infinite decorative animation never drains; waiting on it hangs.
        return timing?.iterations !== Infinity;
      });
      w.__quietFrames = running.length === 0 ? (w.__quietFrames ?? 0) + 1 : 0;
      if (w.__quietFrames >= 6) return done();
      if (performance.now() - (w.__settleStart ?? 0) > budget) return done();
      return false;
    },
    budgetMs,
    { timeout: 20_000, polling: 'raf' }
  );
}

/**
 * Assert that reduced motion left the page visible, not merely un-animated.
 *
 * The failure mode this guards against is an element whose only route to its
 * visible state is an animation, in a stylesheet whose reduced-motion block cancels
 * that animation without restoring its end state — the element then renders at
 * `opacity: 0` for every reader with the preference set.
 *
 * THIS LAB IS CURRENTLY IMMUNE BY CONSTRUCTION, and the assertion is how that stays
 * true. `src/style.css` declares no `@keyframes` whatever, so no content here is
 * parked at `opacity: 0` waiting for an animation's `forwards` fill to reveal it.
 * The build standard records it as a real hazard — one lab scanned both its query
 * masks invisible in every run — and it would arrive here the first time somebody
 * animates the progress bar or fades a verdict in, both of which are natural things
 * to want on a page built out of searches and verdicts. Running it at every state
 * means that edit fails this rather than shipping.
 *
 * `aria-hidden` subtrees are excluded; what this lab hides is its seven glyphs and
 * the dice pips, each beside words that say the same thing — and `scan()` measures
 * their contrast separately with the exemption lifted.
 */
async function expectNotBlank(page: Page, label: string): Promise<void> {
  const invisible = await page.evaluate(() => {
    const out: string[] = [];
    for (const el of Array.from(document.querySelectorAll('body *'))) {
      const own = Array.from(el.childNodes)
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => n.textContent ?? '')
        .join('')
        .trim();
      if (!own) continue;
      // Deliberately hidden subtrees are not "blank", they are closed.
      if (!(el as HTMLElement).checkVisibility?.({ checkVisibilityCSS: true })) continue;
      if (el.closest('[aria-hidden="true"]')) continue;
      let effective = 1;
      let node: Element | null = el;
      while (node) {
        effective *= parseFloat(getComputedStyle(node).opacity);
        node = node.parentElement;
      }
      if (effective === 0) {
        out.push(`${el.tagName.toLowerCase()}.${(el.getAttribute('class') ?? '').trim()}`);
      }
    }
    return Array.from(new Set(out));
  });
  expect(invisible, `no visible text may render at opacity 0 in state: ${label}`).toEqual([]);
}

/**
 * Uncaught page errors and console errors, collected from the moment the page is
 * created. Attach before `boot`, assert after the drive.
 *
 * THIS CAUGHT A REAL DEFECT DURING THIS LAB'S FIRST DRIVE, which is why the note
 * is specific. Panel 2's renderer built its resolved-state detail array eagerly, so
 * it dereferenced `state.recovered!.seed` on the very first render, when nothing
 * had been recovered. The promise behind the button was fired with `void`, so the
 * rejection was silent in the DOM: Step 2 simply rendered NOTHING, and an empty
 * output region is exactly what a scan reports as perfectly accessible. Without
 * this collector the gate would have passed a page whose central panel was blank.
 */
export function watchPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`);
  });
  return errors;
}

/**
 * Exactly one banner landmark.
 *
 * The shared `.cl-topbar` carries an explicit `role="banner"`. This lab's hero is a
 * `<div class="cl-hero">` and not a `<header>`, so nothing here implies a second
 * banner today — but the shared bar ships `dedupeBanner()` because labs this header is
 * shared with have shipped one, and the hero markup is the part of this page most likely
 * to be re-templated from a lab that uses `<header>`. The page's one real
 * `<header>`-shaped element, the `.scripture-footer`, is a `<footer>`. Asserting
 * the OUTCOME rather than the markup is what catches that edit.
 */
export async function assertSingleBanner(page: Page): Promise<void> {
  const banners = await page.evaluate(() => {
    const scoped = new Set(['MAIN', 'ARTICLE', 'ASIDE', 'NAV', 'SECTION']);
    const isBanner = (el: Element): boolean => {
      if (el.getAttribute('role') === 'banner') return true;
      if (el.tagName !== 'HEADER') return false;
      if (el.getAttribute('role')) return false; // explicit non-banner role wins
      for (let p = el.parentElement; p; p = p.parentElement) if (scoped.has(p.tagName)) return false;
      return true;
    };
    return [...document.querySelectorAll('header,[role="banner"]')].filter(isBanner).length;
  });
  expect(banners, 'exactly one banner landmark').toBe(1);
}

/**
 * List semantics survive their styling.
 *
 * This lab has six styled lists and every one of them is `list-style: none`, which
 * is exactly the declaration that makes Safari and VoiceOver DROP a list's implicit
 * role: `ul.dice` (the five faces), `ul.check-rows` (the four checks, twice over in
 * Step 2), `ul.check-opts` (every question's answers), `ol.case-list` (the pinned
 * cases) and `ul.footer-links`. All compensate the documented way — an explicit
 * `role="list"` on the container and `role="listitem"` on every child — so here an
 * explicit role on a list is the fix rather than the defect, which is the opposite of
 * how an explicit ARIA role usually reads.
 *
 * What is asserted is therefore the SHAPE of that fix: any explicit role on a
 * `ul`/`ol` must be `list` (any other value orphans every `<li>` under it), and a
 * `role="list"` must never sit on an empty element, because axe applies
 * `aria-required-children` to the explicit role and fails it the day a list renders
 * with no rows.
 *
 * Roles can be assigned as JS properties rather than attributes, so this asks the
 * DOM rather than grepping the source. `src/ui/dom.ts` sets them with
 * `setAttribute` for that reason.
 */
export async function assertListSemantics(page: Page): Promise<void> {
  const broken = await page.$$eval('ul[role], ol[role]', (els) =>
    els
      .filter((e) => e.getAttribute('role') !== 'list' || e.children.length === 0)
      .map(
        (e) =>
          `${e.tagName.toLowerCase()}[role=${e.getAttribute('role')}] with ${e.children.length} children`
      )
  );
  expect(
    broken,
    'an explicit non-list role on a list deletes its semantics; an empty role="list" fails aria-required-children'
  ).toEqual([]);
}

/**
 * Shared setup. Runs before EVERY test that imports it, so an assertion here fails
 * all of them at once, under whatever name those tests carry.
 *
 * SO THIS FUNCTION ASSERTS STRUCTURE AND NEVER PRODUCT COPY. §4.1a of the build
 * standard records what that costs: a lab changed one textarea's default string, its
 * `gate.ts` still asserted the old sentence, `boot()` threw, both axe runs failed,
 * the build job failed and the deploy was skipped. The step that went red was called
 * "Accessibility gate", and four of its six a11y tests had passed — so for three days
 * the live site served claims that `main` had already corrected, and the one red
 * thing in sight named the wrong subject.
 *
 * Structure is: the control EXISTS, the arrival state is the one that ships, counts,
 * `[hidden]`/`toBeEmpty()` on regions nothing has rendered into yet, `details[open]`
 * at zero, no theme control, and a default matching a SHAPE rather than a sentence.
 * What a string SAYS belongs in `e2e/claims.spec.ts`, where a failure names copy as
 * the subject — including the one assertion this lab would most want here, that the
 * recipe box arrives holding a word.
 *
 * THE ARRIVAL STATE IS WORTH ASSERTING AT THIS LENGTH because of something specific
 * to this lab: the thing it must not do on arrival is make a key. A page that
 * generated its two keys at mount would lose the whole of Step 2 — the reader has to
 * press the button and then fail to tell them apart. So "exactly one verdict exists,
 * and it is the pinned run's" is asserted as a total, which is the assertion that
 * catches an auto-running panel.
 *
 * The theme is seeded through `localStorage` rather than by clicking a toggle (there
 * is none), which pins down a real coupling as a side effect: index.html's
 * anti-flash script WRITES `theme` and this reads it back off `data-theme`. If the
 * script were ever dropped or renamed, this fails on `data-theme` rather than
 * quietly scanning an unpinned page.
 */
export async function boot(page: Page, theme: 'dark'): Promise<void> {
  // A click on a control that never becomes actionable otherwise burns the whole
  // test timeout and reports nothing useful. 30s turns that silent hang into a named
  // failure naming the locator — generous because a ten-thousand-candidate sweep
  // happens behind two of these clicks.
  page.setDefaultTimeout(30_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript((t) => localStorage.setItem('theme', t), theme);
  await page.goto('.');
  expect(
    await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches),
    'reduced-motion emulation must actually be in effect'
  ).toBe(true);
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
  await assertSingleBanner(page);
  await assertListSemantics(page);

  // ── The page really rendered ────────────────────────────────────────────
  await expect(page.locator('main')).toHaveCount(1);
  await expect(page.locator('h1')).toHaveCount(1);
  // Three numbered steps, the recap, and the pinned section. A fourth numbered
  // step, or a lost one, is a change to the shape of the lab and should fail here
  // rather than silently.
  await expect(page.locator('main > section.step')).toHaveCount(5);
  for (const id of ['panel-1', 'panel-2', 'panel-3', 'recap', 'pinned-section']) {
    await expect(page.locator(`#${id}`)).toBeVisible();
  }

  // The shared skip link points at an id that exists. axe's skip-link rule is
  // best-practice, not WCAG-tagged, so `withTags` never runs it — a skip link aimed
  // at a missing element is exactly the kind of thing a green axe run says nothing
  // about.
  await expect(page.locator('a.cl-skip-link')).toHaveAttribute('href', '#app');
  await expect(page.locator('#app')).toHaveCount(1);

  // Dark is the only theme, so the page must carry no theme control at all — not
  // the shared bar's, which was removed, and not a lab-local one.
  await expect(
    page.locator('#theme-toggle, #themeToggle, .theme-toggle, .theme-toggle-btn, [data-theme-toggle]')
  ).toHaveCount(0);
  await expect(page.locator('#cl-theme-toggle')).toHaveCount(0);

  // ── Arrival: nothing rolled, no keys, nothing searched ──────────────────
  for (const id of [
    'p1-real-out',
    'p1-recipe-out',
    'p1-again-out',
    'p2-out',
    'p2-which-out',
    'p2-broken-out',
    'p3-guess-out',
    'p3-recovered-out',
    'p3-noseed-out',
  ]) {
    await expect(page.locator(`#${id}`)).toBeEmpty();
  }
  // Exactly ONE verdict exists on arrival and it is the pinned run's, which is the
  // only thing this lab computes without being asked. Asserted as a total rather
  // than per-marker so a panel that started auto-running on mount — the easy way to
  // lose the "press the button" moment Step 2 is built around — fails here.
  await expect(page.locator('[data-verdict]')).toHaveCount(1);
  await expect(page.locator('[data-verdict="pinned"]')).toHaveCount(1);
  // And no key exists yet, which is the specific thing that must not have happened.
  await expect(page.locator('.key-col')).toHaveCount(0);

  // GATING IS PER CONTROL, and that is the structural fact worth asserting. Every
  // gated control declares its own prerequisite in markup; on arrival the only
  // disabled controls in the whole document are Step 3's.
  const gated = page.locator('button[data-needs]');
  const gatedCount = await gated.count();
  expect(gatedCount, 'Step 3 must declare its prerequisite in markup').toBeGreaterThan(2);
  await expect(page.locator('button[data-needs]:disabled')).toHaveCount(gatedCount);
  await expect(page.locator('#panel-3 .gate-note')).toBeVisible();
  await expect(page.locator('#panel-3 .gate-note')).not.toBeEmpty();
  // Steps 1 and 2 are not gated at all: every control in them works on arrival,
  // which is what makes the first action reachable from the first screen.
  for (const id of ['roll-real', 'roll-recipe', 'make-keys', 'check-broken']) {
    await expect(page.locator(`#${id}`)).toBeEnabled();
  }

  // The progress bar does not exist until a search runs, and the next-step links
  // appear only once a step has produced something.
  await expect(page.locator('#p3-progress')).toBeHidden();
  await expect(page.locator('[role="progressbar"]')).toHaveCount(0);
  await expect(page.locator('.next-step-link')).toHaveCount(0);

  // WebCrypto is present in this browser, so the unavailable banner stays shut.
  // Asserting it HIDDEN rather than absent keeps the element — and the branch that
  // shows it — in the document where a reader of this file can find it.
  await expect(page.locator('#unavailable')).toBeHidden();

  // ── Shipped control defaults, as SHAPES ─────────────────────────────────
  await expect(page.locator('#recipe')).not.toHaveValue('');
  // The four candidate PINs are rendered, each four digits, with exactly one
  // selected. A fifth would change the odds the page states; a zeroth would make
  // "Try this guess" a no-op.
  await expect(page.locator('.pin-choice input[type="radio"]')).toHaveCount(4);
  await expect(page.locator('.pin-choice input:checked')).toHaveCount(1);
  for (const value of await page
    .locator('.pin-choice input')
    .evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value))) {
    expect(value).toMatch(/^\d{4}$/);
  }
  // Every number the prose quotes is written from a constant at mount, so a blank
  // span here means the wiring broke rather than that a sentence was reworded.
  await expect(page.locator('[data-pin-space]').first()).toHaveText(/^[\d,]+$/);
  await expect(page.locator('[data-pin-digits]').first()).toHaveText(/^\d$/);
  await expect(page.locator('[data-candidate-count]').first()).toHaveText(/^\d$/);

  // ── Disclosures ship shut ───────────────────────────────────────────────
  await expect(page.locator('details[open]')).toHaveCount(0);
  // The on-ramp, three predictions, and the pinned case list.
  await expect(page.locator('details')).toHaveCount(5);

  // ── The pinned run finished, synchronously, at mount ────────────────────
  await expect(page.locator('#pinned-out [data-verdict="pinned"]')).toBeVisible();

  // ── The closing questions are rendered, and unanswered ──────────────────
  // The per-question shape is asserted rather than one magic total: a total is the
  // kind of number that is wrong on the first write and tells you nothing about
  // WHICH question lost its options.
  await expect(page.locator('#recap .scenario')).toHaveCount(3);
  await expect(page.locator('#recap .check-result')).toHaveCount(3);
  for (const n of [1, 2, 3]) {
    const options = page.locator(`#scenario-${n} .check-opt`);
    expect(
      await options.count(),
      `scenario ${n} must offer a choice, not a single button`
    ).toBeGreaterThan(1);
    await expect(page.locator(`#scenario-${n} .check-q`)).not.toBeEmpty();
    await expect(page.locator(`#scenario-${n} .check-result`)).toBeEmpty();
  }

  await settle(page);
  await expectNotBlank(page, `${theme} first paint`);
}

/**
 * Assert the page does not require horizontal scrolling.
 *
 * WCAG 1.4.10 (Reflow, AA). axe has no rule for this at all, and on this page it is
 * the oracle most likely to find something, because the lab's longest values are
 * two 64-character keys shown side by side and its layout is built from `auto-fit`
 * grids.
 *
 * Four shapes are at risk and all four are deliberately defended in `src/style.css`
 * rather than hidden behind a scroller:
 *
 *  - both keys in Step 2 and the rebuilt key in Step 3, which wrap through
 *    `overflow-wrap: anywhere` over hex grouped in fours, so there is a break
 *    opportunity that is not inside a byte;
 *  - `.key-cols`, `.compare` and `.check-rows`, whose grid items carry
 *    `min-width: 0` because a grid item's automatic minimum size is the min-content
 *    width of its widest child — which for an unbroken key would be the whole key;
 *  - the row of five `.die` elements, which wraps;
 *  - the four-column recap table, which is the one shape here allowed to scroll
 *    sideways and does so inside its own labelled, focusable `.table-wrap`.
 *
 * At 320px that is precisely what this check exists to catch, which is why 320 is
 * scanned and not only a comfortable phone width.
 *
 * ONE LIMITATION OF THE REPORT, worth knowing before chasing a finding. The culprit
 * search looks for an ELEMENT whose bounding rect extends past the viewport, and
 * inline content that overflows a box which keeps its own width has none — so
 * `widest` reads "(none identified)" while `scrollWidth` is plainly larger. When
 * that happens the element is still findable — walk `body *` for
 * `scrollWidth > clientWidth + 1` instead of comparing rects — and the shape to
 * look for is a long unbreakable token, not a wide box. The engine is deliberately
 * left code-identical to the lab it came from rather than forked to improve this,
 * so the knowledge lives here.
 */
export async function expectNoHorizontalOverflow(page: Page, label: string): Promise<void> {
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    if (doc.scrollWidth <= doc.clientWidth) return null;

    // Only elements that actually push the DOCUMENT sideways are culprits. A wide
    // box inside an `overflow: auto` wrapper has a huge bounding rect but is
    // clipped by its scroller and contributes nothing to the document's scroll
    // width — naming it sends you off fixing the wrong element.
    const clipped = (el: Element): boolean => {
      let n = el.parentElement;
      while (n && n !== doc) {
        const ox = getComputedStyle(n).overflowX;
        if (ox === 'auto' || ox === 'scroll' || ox === 'hidden' || ox === 'clip') return true;
        n = n.parentElement;
      }
      return false;
    };

    const over = Array.from(document.querySelectorAll('body *'))
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter((x) => x.r.width > 0 && x.r.right > doc.clientWidth + 1)
      .sort((a, b) => b.r.right - a.r.right);
    const widest = over.filter((x) => !clipped(x.el))[0] ?? over[0];
    return {
      scrollWidth: doc.scrollWidth,
      clientWidth: doc.clientWidth,
      widest: widest
        ? `${clipped(widest.el) ? '[clipped] ' : ''}${widest.el.tagName.toLowerCase()}${widest.el.id ? '#' + widest.el.id : ''}` +
          `${widest.el.getAttribute('class') ? '.' + widest.el.getAttribute('class')!.trim().split(/\s+/).join('.') : ''}` +
          ` @${Math.round(widest.r.width)}px right=${Math.round(widest.r.right)}`
        : '(none identified)',
    };
  });
  expect(overflow, `page must not scroll horizontally in state: ${label}`).toBeNull();
}

/**
 * Every scrolling container must be operable from the keyboard (WCAG 2.1.1). If it
 * holds no focusable content it needs `tabindex="0"`, so it becomes a focus target
 * arrow keys can then scroll.
 *
 * This lab has exactly one deliberate scroller, the recap table's `.table-wrap`,
 * which declares `tabindex="0"`, `role="region"` and an `aria-label` in markup and
 * is scanned focused by the drive. The assertion runs at every state anyway, because
 * the requirement MATERIALISES the moment someone reaches for `overflow-x: auto` on
 * a key column or the pinned case list — the obvious first instinct for both — and a
 * scroller born without a keyboard route is invisible to axe.
 */
export async function expectScrollersReachable(page: Page, label: string): Promise<void> {
  const unreachable = await page.evaluate(() => {
    const FOCUSABLE = 'a[href],button,input,select,textarea,summary,[tabindex]:not([tabindex="-1"])';
    return Array.from(document.querySelectorAll<HTMLElement>('body *'))
      .filter((el) => el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1)
      .filter((el) => {
        const cs = getComputedStyle(el);
        return ['auto', 'scroll'].includes(cs.overflowX) || ['auto', 'scroll'].includes(cs.overflowY);
      })
      .filter((el) => el.tabIndex < 0 && !el.querySelector(FOCUSABLE))
      .map(
        (el) =>
          `${el.tagName.toLowerCase()}.${(el.getAttribute('class') ?? '').trim()}` +
          ` (${el.scrollWidth}x${el.scrollHeight} in ${el.clientWidth}x${el.clientHeight})`
      );
  });
  expect(
    Array.from(new Set(unreachable)),
    `scrolling regions with no keyboard route in state: ${label}`
  ).toEqual([]);
}

/**
 * Nothing may be focusable while it paints nothing (WCAG 2.4.3 / 2.4.7).
 *
 * `opacity: 0` with `pointer-events: none` is NOT hiding: the element keeps
 * `tabIndex: 0`, so a keyboard reader tabs to a control that is not on screen and
 * the focus ring lands nowhere. `display: none` and `visibility: hidden` DO remove
 * an element from the tab order, so those are skipped rather than flagged — the
 * failure is specifically the invisible-but-tabbable pair.
 *
 * Two shapes on this page are legitimately near that line and neither is flagged.
 * Step 3's disabled controls are at `opacity: .5` and are removed from the tab order
 * by `disabled`, not by CSS. The `.out:empty { display: none }` rule takes the
 * `display` route, which is why nine empty output regions on arrival contribute
 * nothing to the tab order.
 *
 * Off-screen-but-focusable is the WCAG-sanctioned skip-link idiom and is
 * deliberately not flagged: the shared skip link parks at `top:-3rem` with full
 * opacity and slides in on focus. The drive scans it focused.
 */
export async function expectNoInvisibleFocusTargets(page: Page, label: string): Promise<void> {
  const bad = await page.evaluate(() => {
    const FOCUSABLE = 'a[href],button,input,select,textarea,summary,[tabindex]:not([tabindex="-1"])';
    const out: string[] = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>(FOCUSABLE))) {
      if (el.tabIndex < 0) continue;
      // display:none / visibility:hidden already remove it from the tab order.
      if (!el.checkVisibility?.({ checkVisibilityCSS: true })) continue;
      let effective = 1;
      for (let n: Element | null = el; n; n = n.parentElement) {
        effective *= parseFloat(getComputedStyle(n).opacity);
      }
      const r = el.getBoundingClientRect();
      if (effective !== 0 && r.width > 0 && r.height > 0) continue;
      // Confirm it really is reachable rather than inferring it.
      const before = document.activeElement;
      el.focus();
      const took = document.activeElement === el;
      (before as HTMLElement | null)?.focus?.();
      if (took) {
        out.push(
          `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}.${(el.getAttribute('class') ?? '').trim()}` +
            ` (opacity ${effective}, ${Math.round(r.width)}x${Math.round(r.height)})`
        );
      }
    }
    return Array.from(new Set(out));
  });
  expect(bad, `focusable elements that paint nothing in state: ${label}`).toEqual([]);
}

/**
 * When `A11Y_COLLECT` is set, `scan` records failures instead of throwing.
 *
 * A strict gate reports the first failing assertion in the first failing state and
 * stops, so a page with defects in several states needs one full run per defect to
 * enumerate them. The collection pass turns that into a single run. It is a
 * debugging aid only: `A11Y_COLLECT` is never set in CI, and a run with it set
 * prints every finding as it happens and then fails at the end, so a green
 * collection run cannot be mistaken for a green gate.
 */
const COLLECTING = !!process.env.A11Y_COLLECT;
const collected: string[] = [];

function record(entry: string): void {
  collected.push(entry);
  // Printed as it happens, not only at the end: a hard assertion later in the drive
  // would otherwise abort the test before anything collected so far was ever shown.
  console.log(`\n[A11Y_COLLECT #${collected.length}] ${entry}`);
}

export function softExpect(actual: unknown, message: string, expected: unknown): void {
  if (!COLLECTING) {
    expect(actual, message).toEqual(expected);
    return;
  }
  try {
    expect(actual, message).toEqual(expected);
  } catch {
    record(`${message}\n  ${JSON.stringify(actual, null, 2)}`);
  }
}

/**
 * Fail the test if the collection pass recorded anything. Without this a collection
 * run would end green, and a green collection run is indistinguishable from a green
 * gate — which is the exact confusion the whole exercise exists to remove.
 */
export function reportCollected(): void {
  if (!COLLECTING) return;
  expect(collected, `A11Y_COLLECT recorded ${collected.length} failure(s)`).toEqual([]);
}

async function soft(fn: () => Promise<void>): Promise<void> {
  if (!COLLECTING) return fn();
  try {
    await fn();
  } catch (e) {
    // Generous, not 900: a truncated oracle dump is how a second and third finding
    // in the same state get missed on a collection pass.
    record(String(e).slice(0, 6000));
  }
}

/**
 * WCAG 1.4.11 and generated content, ratcheted against a per-repo baseline.
 *
 * Neither class has ANY other oracle: axe has no rule for non-text contrast, and
 * the arithmetic text walk cannot reach a control's boundary or a `::before` glyph,
 * because a pseudo-element is not an element and owns no text node.
 *
 * IT IS CALLED FROM `scan()`, deliberately and not by accident. The build standard
 * records the defect this avoids: the oracle called from inside a soft wrapper AFTER
 * its `if (!COLLECTING) return` guard, so in a strict run — which is every run in CI
 * and every run anyone reads as a pass — the guard returned first and `nontext.ts`
 * never executed at all, and the gates that shipped that way certified themselves
 * clean on an oracle that had never looked. Calling it here means it runs at every
 * driven state, including `:hover`, and this repo's baseline was captured by that
 * live path.
 *
 * A check that merely logs is not a gate, so it ratchets: anything NOT in the
 * baseline fails, anything in the baseline that got WORSE fails, and anything in the
 * baseline that has been FIXED fails until its entry is deleted. That last rule is
 * what stops the allowlist becoming a permanent exemption.
 */
const nonTextSeen = new Set<string>();

export async function expectNoNewNonTextFailures(page: Page, label: string): Promise<void> {
  const found = await auditNonText(page);
  // Capture mode: emit every finding and assert nothing, so a baseline can be
  // generated by the SAME path that checks it.
  if (process.env.NT_BASELINE_CAPTURE) {
    for (const f of found) {
      console.log(`NTCAP|${f.kind}|${f.selector}|${f.ratio}|${f.required}|${/POSITIONED/.test(f.detail)}`);
    }
    return;
  }
  const problems: string[] = [];
  for (const f of found) {
    const key = `${f.kind}|${f.selector}`;
    nonTextSeen.add(key);
    const base = NONTEXT_BASELINE[key];
    if (!base) {
      problems.push(`NEW ${f.ratio}:1 (needs ${f.required}:1) [${f.kind}] ${f.selector} — ${f.detail}`);
    } else if (f.ratio < base.ratio - 0.01) {
      problems.push(`WORSE ${f.selector}: ${f.ratio}:1, baseline recorded ${base.ratio}:1`);
    }
  }
  expect(problems, `new or worsened non-text contrast in state: ${label}`).toEqual([]);
}

/**
 * Fail if a baselined finding never appeared during the whole drive.
 *
 * It has either been fixed — in which case delete the entry, which is the point — or
 * the drive stopped reaching the state that shows it, which is a coverage regression
 * worth knowing about. Call once, after `driveAllStates`.
 */
export function expectBaselineNotStale(): void {
  const unseen = Object.keys(NONTEXT_BASELINE).filter((k) => !nonTextSeen.has(k));
  expect(
    unseen,
    'baselined non-text findings that no longer appear — delete them from nontext-baseline.ts (or restore the drive state that showed them)'
  ).toEqual([]);
}

/**
 * Scan the page as it currently stands.
 *
 * Nine assertions, because axe's `violations` array alone is not a complete oracle:
 *
 *  - reduced-motion end state — see `expectNotBlank`.
 *  - `violations` — the usual WCAG A/AA rule failures, plus four landmark
 *    best-practice rules `withTags` does not run on its own.
 *  - `incomplete` — axe's "could not decide" bucket, which never reaches the
 *    violations array. ON THIS PAGE IT IS CURRENTLY EMPTY, measured rather than
 *    assumed: axe-core 4.12 resolves every `color-mix()` fill here. So this
 *    assertion is a tripwire rather than a sweep, and the two rules it exists for
 *    are `aria-prohibited-attr`, which is where an `aria-label` on a role-less
 *    element hides, and `aria-required-children`, where an empty `role="list"`
 *    hides. This page leans on both: six lists carry explicit list roles, and
 *    `ul.dice` carries an `aria-label` naming its faces. `color-contrast` is the
 *    one id filtered out, because the next assertion computes those ratios for
 *    real; nothing else is.
 *  - arithmetic contrast — composite-aware WCAG 1.4.3 over every text node. A
 *    second, independent implementation of a measurement axe currently also makes,
 *    kept because two oracles agreeing is worth more than one and because axe's
 *    willingness to resolve a backdrop is a property of an axe version. Proved live
 *    rather than inferred: see `contrast.ts`.
 *  - the same walk over `aria-hidden` content with the exemption lifted — SC 1.4.3
 *    is about what a reader SEES, and axe skips that content by design. It finds
 *    nothing here, because nothing `aria-hidden` on this page owns a text node:
 *    the seven glyphs are SVG paths and the dice pips are empty spans.
 *  - non-text contrast and generated content — SC 1.4.11, ratcheted; see
 *    `expectNoNewNonTextFailures`. This is the only oracle that judges a control's
 *    boundary against the surface OUTSIDE it, which on this page is what judges the
 *    deliberately hueless `.verdict-neutral` card.
 *  - keyboard reachability of scrolling regions — WCAG 2.1.1.
 *  - no focusable element that paints nothing — WCAG 2.4.3/2.4.7.
 *  - reflow — WCAG 1.4.10, which axe has no rule for at all.
 */
export async function scan(page: Page, label: string): Promise<void> {
  await settle(page);
  await expectNotBlank(page, label);
  // TWO axe runs, deliberately, and this is not a style choice.
  //
  // `AxeBuilder.withTags()` and `AxeBuilder.withRules()` both write the same
  // `options.runOnly` field, so the second call SILENTLY REPLACES the first — the
  // axe-core/playwright source says so in as many words on `withRules` ("Cannot be
  // used with AxeBuilder#withTags"). Chained as
  // `.withTags(TAGS).withRules([...4 landmark rules])`, axe runs those FOUR
  // best-practice rules and NOT ONE WCAG RULE, while a green result reads exactly
  // like a full A/AA pass. For scale, `withTags(TAGS)` selects 69 of axe-core
  // 4.12's 105 rule definitions; the chained form executes 4.
  //
  // The landmark four are still wanted because they are best-practice rather than
  // WCAG-tagged, so `withTags` alone does not reach them — and this page has exactly
  // the shape they catch: a sticky `<header role="banner">` above a `<div id="app">`
  // holding an `<aside class="cl-hero-why">`, one `<nav>` (the shared bar's
  // actions), one `<main>` of five `<section>`s, and a `<footer>`. The hero aside is
  // a top-level complementary landmark inside `#app` and not inside the `<main>`,
  // which is the arrangement `landmark-complementary-is-top-level` exists to judge.
  const wcag = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const landmarks = await new AxeBuilder({ page })
    .withRules([
      'landmark-no-duplicate-banner',
      'landmark-unique',
      'landmark-one-main',
      'landmark-complementary-is-top-level',
    ])
    .analyze();
  const results = {
    violations: [...wcag.violations, ...landmarks.violations],
    incomplete: [...wcag.incomplete, ...landmarks.incomplete],
  };

  const violations = results.violations.map((v) => ({
    state: label,
    id: v.id,
    impact: v.impact,
    help: v.help,
    nodes: v.nodes.map((n) => n.target.join(' ')).slice(0, 8),
  }));
  softExpect(violations, `axe violations in state: ${label}`, []);

  // The `incomplete` bucket is asserted, not skimmed. `aria-prohibited-attr` and
  // `aria-required-children` appear ONLY here — never in `violations` — so a gate
  // that ignores this bucket cannot see either. Only `color-contrast` is allowed to
  // remain, and only because the arithmetic walk below judges those ratios for real;
  // no other rule is filtered out.
  const unexplainedIncomplete = results.incomplete
    .filter((v) => v.id !== 'color-contrast')
    .map((v) => ({
      state: label,
      id: v.id,
      nodes: v.nodes.map((n) => n.target.join(' ')).slice(0, 8),
    }));
  softExpect(unexplainedIncomplete, `axe incomplete results in state: ${label}`, []);

  const contrast = Array.from(new Set(formatContrastFailures(await auditContrast(page))));
  softExpect(contrast, `measured contrast failures in state: ${label}`, []);

  // The aria-hidden walk, exemption lifted — axe skips this text entirely and the
  // default walk honours the same boundary, so this second call is the ONLY thing
  // that ever measures it. See `contrast.ts` for the inventory.
  const hiddenContrast = Array.from(
    new Set(
      formatContrastFailures(
        await auditContrast(page, '[aria-hidden="true"], [aria-hidden="true"] *', true)
      )
    )
  );
  softExpect(hiddenContrast, `measured aria-hidden contrast failures in state: ${label}`, []);

  await soft(() => expectNoNewNonTextFailures(page, label));
  await soft(() => expectScrollersReachable(page, label));
  await soft(() => expectNoInvisibleFocusTargets(page, label));
  await soft(() => expectNoHorizontalOverflow(page, label));
}

// ── The drive ───────────────────────────────────────────────────────────────

/**
 * Press a button and wait for the verdict it is supposed to produce.
 *
 * Named rather than inferred: a click that silently did nothing is
 * indistinguishable from one that worked unless something is asserted after it, and
 * that is precisely how the retired gate drove — `.catch(() => {})` around every
 * click, then a fixed wait. Waiting on the marker ALSO waits out the ten-thousand-
 * candidate sweep behind two of these presses without a timeout anywhere.
 *
 * `tone` is asserted alongside the marker because on this page the tone IS the
 * teaching. Step 2's verdict reading `alarm` before Step 3 has run would be a
 * regression in what the lab says rather than in whether it says it — the build
 * brief forbids that colour at that moment by name — and the drive is where it gets
 * noticed in the state it happens in.
 */
async function press(
  page: Page,
  name: string | RegExp,
  marker: string,
  tone: 'pass' | 'held' | 'alarm' | 'fail' | 'neutral'
): Promise<void> {
  await page.getByRole('button', { name }).click();
  const verdict = page.locator(`[data-verdict="${marker}"]`);
  await expect(verdict).toBeVisible();
  await expect(verdict).toHaveAttribute('data-tone', tone);
}

/**
 * Open a disclosure the way a reader does, and prove it opened.
 *
 * `nth` is needed because the three predictions deliberately share one summary
 * wording ("Predict first — optional"): a reader meets them one at a time and a
 * different label for each would be noise. `.first()` would silently reopen the same
 * one, so the index is explicit where it matters.
 */
async function reveal(page: Page, summary: string | RegExp, nth = 0): Promise<void> {
  const details = page.locator('details', { has: page.getByText(summary) }).nth(nth);
  await details.locator('> summary').click();
  await expect(details).toHaveAttribute('open', '');
}

/**
 * Drive the lab through every state that renders content, scanning each.
 *
 * Six things shape this drive:
 *
 *  - THE ARRIVAL STATE IS SCANNED FIRST, exactly as a reader gets it: nothing
 *    rolled, no keys, nine empty output regions, Step 3 gated behind one note,
 *    every disclosure shut, and the pinned cases already green. The retired gate
 *    force-revealed everything before its only scan.
 *
 *  - ONE STATE HERE IS UNRECOVERABLE, which shapes the order of everything. Step
 *    2's verdict ships in the `neutral` tone and is REPAINTED `alarm` the moment a
 *    recovery succeeds, by design — that repaint is the lab's central teaching
 *    mechanism. There is no way back to the neutral rendering without reloading, so
 *    it is scanned at all three widths before Step 3 is touched, or it is never
 *    scanned at all. A drive that walked the page in button order would have
 *    measured the four-tone page and missed the five-tone one.
 *
 *  - ALL FIVE TONES ARE SCANNED, which is the point of a page whose palette has
 *    five. `pass` on all three Step 1 verdicts and the pinned run; `neutral` on
 *    Step 2's trap and on a wrong single guess; `held` on the obviously-broken
 *    generator and on the search that finds nothing; `alarm` on the recovery and on
 *    Step 2 after it; `fail` on the empty-recipe refusal. A tone nothing drives is a
 *    tone nothing measures.
 *
 *  - THE REFUSAL PATH IS REACHED THROUGH THE UI, not from script: the recipe box is
 *    cleared and the button pressed, which is the only way a reader meets it.
 *
 *  - RETIREMENT IS A STATE. Making the keys again after a recovery replaces three
 *    verdicts with retirement notices in their own tone, which is a rendering a
 *    reader meets by ordinary use and which no other scan would reach.
 *
 *  - HOVER PERSISTS AFTER A CLICK. `:hover` stays on the element under the pointer
 *    after `page.click()` resolves, so it is the state a reader occupies the instant
 *    after pressing a button — and `.btn:hover`, `.check-opt:hover`,
 *    `.pin-choice:hover` and `.cl-btn:hover` all repaint their fill. Each is scanned
 *    explicitly.
 *
 *  - NO FIXED TIMEOUTS. Every wait is on a real DOM completion signal: a verdict
 *    marker appearing, a tone attribute, a progress bar's value, `details[open]`.
 */
export async function driveAllStates(page: Page, theme: string): Promise<void> {
  const scanAt = (s: string): Promise<void> => scan(page, `${theme} / ${s}`);
  const recipe = page.locator('#recipe');

  await scanAt('arrival: nothing rolled, no keys, Step 3 gated, disclosures shut, pinned cases green');

  // ── The shared skip link, focused ───────────────────────────────────────
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
  await page.keyboard.press('Tab');
  await expect(page.locator('a.cl-skip-link')).toBeFocused();
  await scanAt('the shared skip link focused, slid in from top:-3rem');

  // ── The on-ramp disclosure, which carries the honesty note ──────────────
  await reveal(page, /What is real here/);
  await scanAt('the on-ramp disclosure open — what is real and what this is not');

  // ── Step 1: the real dice ───────────────────────────────────────────────
  await press(page, 'Roll five dice', 'dice-real', 'pass');
  await expect(page.locator('#p1-real-out .die')).toHaveCount(5);
  await scanAt('Step 1: five dice from the real source, with the discard count beside them');

  // A second roll adds the computed comparison sentence, which is a new paint.
  await press(page, 'Roll five dice', 'dice-real', 'pass');
  await expect(page.locator('[data-verdict="dice-real"] .verdict-detail')).toHaveCount(2);
  await scanAt('Step 1: rolled twice — the page states whether the two rolls differ');

  // ── Step 1: the refusal first, so the pass verdict is not what replaces it
  await recipe.fill('');
  await press(page, 'Roll with this recipe', 'dice-recipe', 'fail');
  await scanAt('Step 1: an empty recipe box — the one state on this page that is a real error');

  await recipe.fill('monday');
  await press(page, 'Roll with this recipe', 'dice-recipe', 'pass');
  await expect(page.locator('[data-verdict="same-again"]')).toHaveCount(0);
  await scanAt('Step 1: one roll from a recipe — no comparison yet, because there is nothing to compare');

  await reveal(page, /Show the bytes the recipe produced/);
  await scanAt('Step 1: the recipe generator’s own bytes disclosed');

  await press(page, 'Roll with this recipe', 'same-again', 'pass');
  await expect(page.locator('#p1-again-out .die')).toHaveCount(10);
  await expect(page.locator('#p1-next .next-step-link')).toBeVisible();
  await scanAt('Step 1: the same five dice twice — the side-by-side comparison and the next-step link');

  await reveal(page, /Predict first/, 0);
  await page.locator('#predict-recipe .check-opt').last().click();
  await expect(page.locator('#predict-recipe .check-result')).toHaveClass(/pill-bad/);
  await scanAt('Step 1: the prediction answered wrong — the pill-bad tint and its explanation');

  await page.locator('#predict-recipe .check-opt').first().click();
  await expect(page.locator('#predict-recipe .check-result')).toHaveClass(/pill-ok/);
  await scanAt('Step 1: the same prediction answered right — the pill-ok tint');

  // ── Step 2: THE UNRECOVERABLE STATE. Everything neutral is scanned here ──
  await press(page, 'Make two keys', 'look-random', 'neutral');
  await expect(page.locator('.key-col')).toHaveCount(2);
  await expect(page.locator('.check-row')).toHaveCount(8);
  // Neither column is marked. This is the assertion that the trap is still a trap.
  await expect(page.locator('.key-col-mark')).toHaveCount(0);
  await expect(page.locator('#p2-next .next-step-link')).toBeVisible();
  await scanAt('Step 2: two keys, eight check rows, NEITHER COLUMN MARKED — the uncoloured trap');

  await page.locator('.check-opt', { hasText: 'Source A is the guessable one' }).click();
  await expect(page.locator('#p2-which-out')).toHaveClass(/pill-bad/);
  await scanAt('Step 2: "which is guessable" answered wrong, while the panel is still neutral');

  await page.locator('.check-opt', { hasText: 'Source B is the guessable one' }).click();
  await expect(page.locator('#p2-which-out')).toHaveClass(/pill-ok/);
  await scanAt('Step 2: answered right — and the page refuses to congratulate');

  await press(page, 'Run them on an obviously bad generator', 'visible-pattern', 'held');
  // The only state in which a check row paints FAIL, which is the row the
  // non-text oracle has to measure in its alarm colouring.
  await expect(page.locator('#p2-broken-out .check-row-bad').first()).toBeVisible();
  await scanAt('Step 2: the obviously bad generator caught — failing check rows in the alarm tint');

  await reveal(page, /Predict first/, 1);
  await page.locator('#predict-checks .check-opt').last().click();
  await expect(page.locator('#predict-checks .check-result')).toHaveClass(/pill-bad/);
  await scanAt('Step 2: its prediction answered wrong');

  // ── Step 3: the single guess, then the two searches ─────────────────────
  await expect(page.locator('#try-guess')).toBeEnabled();
  await expect(page.locator('#panel-3 .gate-note')).toBeHidden();
  await reveal(page, /Predict first/, 2);
  await page.locator('#predict-search .check-opt').first().click();
  await expect(page.locator('#predict-search .check-result')).toHaveClass(/pill-ok/);
  await scanAt('Step 3: ungated once keys exist, with its prediction answered');

  // A single guess, driven through every candidate until BOTH outcomes have been
  // scanned. Exactly one of the four is right, so both renderings are reachable and
  // neither is reachable by choosing a fixed one — which is why this is a loop
  // rather than two presses: the PIN is drawn from the real source at mount, so a
  // drive that picked a fixed candidate would scan a different pair of states on
  // different runs and never know it.
  //
  // THE RE-PRESS AT THE END IS NOT TIDYING. Each guess REPLACES the previous one, so
  // which rendering is on screen when the loop ends depends on the order the two
  // outcomes happened to arrive in. The first version of this drive ended wherever
  // the loop did and passed at 1280 and 320 and failed at 390 — not because of the
  // width, but because that run's PIN was the first candidate, so the hit came first
  // and a miss overwrote it, taking the rebuilt-key disclosure with it. Ending on the
  // hit deliberately is what makes everything after this point a fixed state.
  const pins = await page
    .locator('.pin-choice input')
    .evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));
  let sawMiss = false;
  let hitPin: string | null = null;
  const guessVerdict = page.locator('[data-verdict="guess"]');
  for (const pin of pins) {
    if (sawMiss && hitPin) break;
    await page.locator(`#pin-${pin}`).check();
    await page.getByRole('button', { name: 'Try this guess' }).click();
    await expect(guessVerdict).toBeVisible();
    const tone = await guessVerdict.getAttribute('data-tone');
    if (tone === 'neutral' && !sawMiss) {
      sawMiss = true;
      await scanAt(`Step 3: the guess ${pin} missed — neutral, because a miss establishes nothing`);
    } else if (tone === 'alarm' && !hitPin) {
      hitPin = pin;
      await expect(page.locator('#p3-guess-out .recovered-text')).toBeVisible();
      await scanAt(`Step 3: the guess ${pin} landed — one in four, and the page says so`);
    }
  }
  expect(
    [sawMiss, hitPin !== null],
    'both guess outcomes must be reachable from the four candidates'
  ).toEqual([true, true]);

  // Back to the hit, so every state below is the same state on every run.
  await page.locator(`#pin-${hitPin}`).check();
  await press(page, 'Try this guess', 'guess', 'alarm');

  // The hit also repaints Step 2, so the marked columns are scanned here.
  await expect(page.locator('.key-col-mark')).toHaveCount(2);
  await expect(page.locator('[data-verdict="look-random"]')).toHaveAttribute('data-tone', 'alarm');
  await scanAt('Step 2 repainted by Step 3 — both columns marked, the panel in alarm');

  await reveal(page, /Show the key that was rebuilt/);
  await scanAt('Step 3: the rebuilt key disclosed beside the message it opened');

  // ── The exhaustive search: the negative-claim fixture ───────────────────
  await press(page, /Try all/, 'recovered', 'alarm');
  await expect(page.locator('[role="progressbar"]')).toHaveAttribute('aria-valuenow', '10000');
  await expect(page.locator('.negative-claim')).toBeVisible();
  await expect(page.locator('#p3-next .next-step-link')).toBeVisible();
  await scanAt('Step 3: PASSED EVERY CHECK — AND FULLY RECOVERED, the negative-claim fixture');

  await press(page, 'Run the same search against Source A', 'no-seed', 'held');
  await scanAt('Step 3: NOTHING TO FIND — the same search, the same work, a calm refusal');

  // ── The recap and the closing questions ─────────────────────────────────
  await page.locator('#scenario-1 .check-opt').last().click();
  await expect(page.locator('#scenario-1 .check-result')).toHaveClass(/pill-bad/);
  await scanAt('the recap table, with a closing question answered wrong');

  await page.locator('#scenario-1 .check-opt').first().click();
  await expect(page.locator('#scenario-1 .check-result')).toHaveClass(/pill-ok/);
  await scanAt('the recap table, with a closing question answered right');

  // The recap table is the one shape on this page allowed to scroll sideways, so it
  // is scanned focused — that is where its keyboard route and label are judged
  // (WCAG 2.1.1).
  await page.locator('.table-wrap').focus();
  await expect(page.locator('.table-wrap')).toBeFocused();
  await scanAt('the recap table focused as a scroll region');

  // ── The pinned case list, which ships shut ──────────────────────────────
  await reveal(page, /Show all 10 cases/);
  await expect(page.locator('#pinned-out .case')).toHaveCount(10);
  await scanAt('the pinned case list expanded — ten rows, published and derived');

  // ── The copy button, in its just-clicked state ──────────────────────────
  // Either wording is a real state, because headless Chromium denies the clipboard.
  // Scanned while still hovered, then waited out so no later scan races the revert.
  const copyBtn = page.locator('.key-col .copy-btn').first();
  await copyBtn.click();
  await expect(copyBtn).toHaveText(/Copied|Copy failed/);
  await scanAt('a copy button in its just-clicked state, still hovered');
  await expect(copyBtn).not.toHaveText(/Copied|Copy failed/, { timeout: 5000 });

  // ── Supersession is a state a reader reaches by ordinary use ────────────
  await press(page, 'Make two keys', 'look-random', 'neutral');
  await expect(page.locator('[data-verdict-retired="recovered"]')).toBeVisible();
  await expect(page.locator('[data-verdict-retired="no-seed"]')).toBeVisible();
  await expect(page.locator('[data-verdict="recovered"]')).toHaveCount(0);
  await scanAt('new keys supersede the recovery — the OUT OF DATE notices beside a fresh neutral panel');

  // ── Hover, which persists after a click ─────────────────────────────────
  await page.getByRole('button', { name: 'Make two keys' }).hover();
  await scanAt('a primary button hovered — its accent fill repainted');

  await page.getByRole('button', { name: 'Run them on an obviously bad generator' }).hover();
  await scanAt('a quiet button hovered');

  await page.locator('#scenario-2 .check-opt').first().hover();
  await scanAt('a closing-question option hovered — its accent wash repainted');

  await page.locator('.pin-choice').first().hover();
  await scanAt('a PIN choice hovered');

  await page.locator('#p1-next .next-step-link').hover();
  await scanAt('a next-step link hovered');

  await page.locator('.cl-topbar .cl-btn').first().hover();
  await scanAt('a shared top bar control hovered');

  // ── Focus rings on the controls that take them ──────────────────────────
  await recipe.focus();
  await expect(recipe).toBeFocused();
  await scanAt('the recipe textarea focused, showing its focus-visible outline');

  await page.locator('.pin-choice input').first().focus();
  await scanAt('a PIN radio focused — the native control keeps its own ring');

  await page.getByRole('button', { name: 'Roll five dice' }).focus();
  await scanAt('a primary button focused');

  await page.locator('#pinned-out .source-line a').focus();
  await scanAt('the pinned-source link focused — an inline link with a persistent underline');

  // ── A gated control again, beside a fresh verdict ───────────────────────
  // Disabled controls are inactive components and exempt from contrast, but the gate
  // note beside them is real prose and is not. Reloading is the only way back to the
  // gated state once keys exist, and the note has to be scanned beside Step 1's
  // results rather than only on an empty page.
  await page.reload();
  await expect(page.locator('#panel-3 .gate-note')).toBeVisible();
  await press(page, 'Roll five dice', 'dice-real', 'pass');
  await scanAt('Step 3 gated again after a reload — the gate note beside a fresh Step 1 verdict');
}
