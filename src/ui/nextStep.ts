/*
 * "Continue to Step N" — the link that appears once a step has actually produced
 * something.
 *
 * A guided path only guides if it says where the path goes next. The three steps
 * read as a sequence, but after a reader gets a result there is nothing telling them
 * the result was the point of that step and that another one follows — so the
 * obvious failure is a reader who rolls some dice, finds it mildly interesting, and
 * stops before the panel that does the work.
 *
 * It appears only AFTER the step's own result exists, which keeps the arrival screen
 * uncluttered, and it is a plain in-page anchor: no focus is stolen and no scrolling
 * happens on its own. A reader exploring out of order is never blocked, only offered.
 */
import { byId } from './dom';
import { rollsUnderCurrentRecipe, state } from './state';

interface Hop {
  readonly host: string;
  /** True once this step has produced the thing the next step builds on. */
  readonly ready: () => boolean;
  readonly href: string;
  readonly label: string;
}

const HOPS: readonly Hop[] = [
  {
    host: 'p1-next',
    // Not merely "a roll happened": the step's point is the SECOND roll under the
    // same recipe, which is where determinism stops being a sentence.
    ready: () => rollsUnderCurrentRecipe() >= 2,
    href: '#panel-2',
    label: 'Continue to Step 2 — two keys, and no way to tell them apart',
  },
  {
    host: 'p2-next',
    ready: () => state.keys !== null,
    href: '#panel-3',
    label: 'Continue to Step 3 — guess the seed, take the key',
  },
  {
    host: 'p3-next',
    // BOTH halves, not just the recovery. Step 3's lesson is a COMPARISON: one key
    // rebuilt by counting, and the same search against the other finding nothing.
    // This used to offer the recap as soon as anything had been recovered, which a
    // one-in-four lucky guess satisfies — so a reader could be sent to the summary
    // having seen neither the ten-thousand count nor the half that makes it mean
    // something. Nothing is blocked by this; the reader can scroll wherever they
    // like. It is only the page declining to say "finished" before it is.
    ready: () => state.recovered !== null && state.realSearch !== null,
    href: '#recap',
    label: 'Finish — what this does and does not tell you',
  },
];

export function refreshNextSteps(): void {
  for (const hop of HOPS) {
    const host = byId(hop.host);
    const show = hop.ready();
    host.hidden = !show;
    if (!show) {
      host.replaceChildren();
      continue;
    }
    if (host.querySelector('a')) continue;
    const link = document.createElement('a');
    link.className = 'next-step-link';
    link.href = hop.href;
    link.textContent = hop.label;
    host.replaceChildren(link);
  }
}
