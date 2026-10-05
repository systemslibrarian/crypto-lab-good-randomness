import { expect, test } from '@playwright/test';
import {
  NARROWEST,
  PHONE,
  WIDE,
  boot,
  driveAllStates,
  expectBaselineNotStale,
  reportCollected,
  watchPageErrors,
} from './gate';

/**
 * WCAG A/AA regression gate.
 *
 * The lab is driven along everything it teaches, and every state is scanned at each
 * of three widths: the arrival state exactly as a reader gets it, with nothing
 * rolled, no keys and Step 3 gated; the shared skip link focused; Step 1's real dice
 * once and twice, its empty-recipe refusal, one recipe roll, its byte disclosure and
 * then the two-roll comparison; Step 2's UNCOLOURED trap with neither column marked,
 * its one-in-two guess both ways, and the obviously-bad generator's failing check
 * rows; Step 3's single guess driven until both a miss and a hit have been scanned,
 * the repaint that hit causes in Step 2, the negative-claim fixture where every check
 * passes and the key is recovered anyway, and the calm refusal against the real key;
 * the recap answered wrong and then right; the pinned list expanded; a copy button in
 * its just-clicked state; new keys retiring the stale recovery; six hover states; and
 * four focus rings.
 *
 * All five verdict tones are reached, which is the reason the drive is as long as it
 * is: on this page the tone carries the teaching, and a tone nothing drives is a tone
 * nothing measures. ONE OF THEM IS UNRECOVERABLE — Step 2's `neutral` verdict is
 * repainted `alarm` by the first successful recovery and there is no way back without
 * a reload — so the drive scans it before Step 3 is touched, at all three widths, or
 * it is never scanned at all.
 *
 * See `gate.ts` for why nothing is injected into the page (the retired gate's
 * `addStyleTag` motion kill bypassed the stylesheet's own reduced-motion block, so
 * the rendering reduced-motion readers get was never the one scanned), why every
 * disclosure is opened through its own `<summary>` rather than from script, why the
 * arrival state is asserted at length rather than assumed, and why `violations` is
 * not the whole oracle.
 */

const WIDTHS = [
  { label: '1280px', size: WIDE },
  { label: '390px', size: PHONE },
  { label: '320px', size: NARROWEST },
] as const;

for (const { label, size } of WIDTHS) {
  test(`no WCAG A/AA violations in dark theme at ${label}`, async ({ page }) => {
    test.setTimeout(1_800_000);
    const errors = watchPageErrors(page);
    await page.setViewportSize(size);
    await boot(page, 'dark');
    await driveAllStates(page, `dark @${label}`);
    expect(errors, errors.join('\n')).toEqual([]);
    expectBaselineNotStale();
    reportCollected();
  });
}
