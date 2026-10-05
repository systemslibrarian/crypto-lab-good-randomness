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

export function settled(): void {
  retireStale();
  applyGates();
  refreshNextSteps();
}
