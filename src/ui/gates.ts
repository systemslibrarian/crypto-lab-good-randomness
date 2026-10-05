/*
 * What each control needs before it can do anything, and the one place that
 * decides.
 *
 * THE PREREQUISITE IS DECLARED PER CONTROL, in markup, as `data-needs` — not per
 * section. A section-wide gate is how a button ends up enabled with nothing to act
 * on, running its handler, hitting an early `return`, and rendering nothing at all.
 * A button that looks available and silently does nothing is worse for a beginner
 * than a disabled one, because the only thing it teaches is that the page is
 * broken.
 *
 * Nothing is hidden. A hidden control cannot be read, and a reader who cannot see
 * where the path leads does not know there is one — so the shape of the whole lab
 * is legible from the first screen and the disabled controls keep their accessible
 * names. `aria-describedby` is not used here because the note is per STEP rather
 * than per control; the note sits immediately above the controls it explains, in
 * reading order, which is what a screen reader follows.
 */
import { state } from './state';

/** The one thing a control in this lab can be waiting for. */
export type Need = 'keys';

interface Prerequisite {
  readonly holds: () => boolean;
  /** What a reader must do, and where. Shown beside the disabled controls. */
  readonly todo: string;
}

export const NEEDS: Record<Need, Prerequisite> = {
  keys: {
    holds: () => state.keys !== null,
    todo: 'Make the two keys in Step 2 first — there is nothing here to search yet.',
  },
};

export function applyGates(): void {
  for (const control of Array.from(
    document.querySelectorAll<HTMLButtonElement>('button[data-needs]')
  )) {
    const need = control.dataset.needs as Need;
    const prerequisite = NEEDS[need];
    if (!prerequisite) continue;
    control.disabled = !prerequisite.holds();
  }

  for (const note of Array.from(document.querySelectorAll<HTMLElement>('.gate-note'))) {
    const step = note.closest('section');
    if (!step) continue;
    const blocked = Array.from(
      step.querySelectorAll<HTMLButtonElement>('button[data-needs]')
    ).find((c) => c.disabled);
    const todo = blocked ? NEEDS[blocked.dataset.needs as Need]?.todo : undefined;
    note.textContent = todo ?? '';
    note.hidden = !todo;
  }
}
