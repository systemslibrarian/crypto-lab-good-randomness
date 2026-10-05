/*
 * The four checks, rendered as rows.
 *
 * ONE RENDERER FOR ALL THREE COLUMNS, and that is load-bearing rather than tidy.
 * Panel 2 puts the real source's output and the seeded output side by side and the
 * entire argument is that the two columns read identically; two renderers, however
 * carefully kept in step, would make that a coincidence maintained by hand. The
 * obviously-broken generator below them uses the same renderer too, which is what
 * makes its failing rows recognisable as the same rows.
 *
 * EACH ROW PRINTS WHAT WAS MEASURED, not only whether it passed. "22 of 32 bytes are
 * 128 or above" is a number a reader can argue with; "PASS" is not. It is also what
 * lets `e2e/claims.spec.ts` cross-check the summary count against the rows rather
 * than against a string this file chose.
 *
 * PASS AND FAIL ARE NAMED IN WORDS, inside the row, beside a glyph and a colour
 * (WCAG 1.4.1). The two columns in Panel 2 are deliberately not tinted — the panel
 * is uncoloured until Panel 3 resolves it — so the per-row ink is the only colour in
 * there, and it is doing a different job from the panel's own tone: it reports what
 * the check said, never whether the generator is sound.
 */
import type { Check } from '../crypto/looksRandom';
import { cross, tick } from './icons';
import { el } from './dom';

export function checkRows(checks: readonly Check[], labelPrefix: string): HTMLElement {
  return el(
    'ul',
    { class: 'check-rows', role: 'list', 'aria-label': `${labelPrefix}: the four checks` },
    checks.map((c) =>
      el('li', { class: `check-row check-row-${c.passed ? 'ok' : 'bad'}`, role: 'listitem' }, [
        el('span', { class: 'check-row-head' }, [
          c.passed ? tick() : cross(),
          el('span', { class: 'check-row-state' }, [c.passed ? 'PASS' : 'FAIL']),
          el('span', { class: 'check-row-name' }, [c.name]),
        ]),
        el('span', { class: 'check-row-question' }, [c.question]),
        el('span', { class: 'check-row-observed', 'data-check': c.id }, [c.observed]),
      ])
    )
  );
}
