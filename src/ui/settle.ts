/*
 * The one choke point every action goes through after it changes anything.
 *
 * `retireStale()` only does its job when something calls it. Rather than remember
 * to call three functions in the right order at the end of every handler, every
 * handler calls this — so an action added later gets invalidation, gating and the
 * next-step link for free and cannot forget them. That is the only kind of fix that
 * survives the next edit.
 */
import { applyGates } from './gates';
import { retireStale } from './verdict';
import { refreshNextSteps } from './nextStep';

/**
 * Extra work to run after every action, registered by the panel that owns it.
 *
 * A panel sometimes has to re-render because of something ANOTHER panel did —
 * Step 3's "what a stranger was handed" block has to appear when Step 2 makes the
 * keys, and Step 2 is the wrong place to know that. Importing one panel from the
 * other would make a cycle, so the panel that owns the rendering registers it here
 * and `settled()` calls it. Nothing in this file knows what any of them do.
 *
 * A registered function is called on EVERY action, so it must be cheap and must not
 * destroy reader state it did not create — see `renderIntercepted` in panel3.ts,
 * which rebuilds only when the keys have actually changed, because rebuilding
 * unconditionally would snap its disclosure shut under the reader every time they
 * pressed anything.
 */
const extras: (() => void)[] = [];

export function alsoOnSettle(fn: () => void): void {
  extras.push(fn);
}

export function settled(): void {
  retireStale();
  applyGates();
  refreshNextSteps();
  for (const fn of extras) fn();
}
