/*
 * Good Randomness — wiring.
 *
 * The page is a path, not a set of tabs: three numbered steps top to bottom, each
 * answering a question the one before it raises. Dice, then two keys nobody can tell
 * apart, then one of them taken by counting to ten thousand.
 *
 * NOTHING RUNS AT MOUNT EXCEPT THE PINNED CASES. The dice are rolled when the reader
 * asks, because pressing the button is where the lesson starts; the pinned cases run on
 * their own because their whole purpose is to have already answered "can I trust this
 * page" before it is asked.
 *
 * WHERE THE RULES LIVE:
 *   gates.ts   what each control needs, declared per control in markup
 *   settle.ts  the one function every action calls after changing anything
 *   state.ts   the dependency graph every verdict's freshness is judged against
 * An action added later gets invalidation, gating and the next-step link for free, which
 * is the only kind of fix that survives the next edit.
 */
import './style.css';
import { CANDIDATE_PINS } from './ui/state';
import { PIN_DIGITS, PIN_SPACE } from './crypto/seeded';
import { mountPanel1 } from './ui/panel1';
import { mountPanel2 } from './ui/panel2';
import { mountPanel3 } from './ui/panel3';
import { mountPinned } from './ui/pinnedPanel';
import { mountQuestions } from './ui/quiz';
import { settled } from './ui/settle';

/**
 * Report an environment that cannot run this lab, instead of leaving controls to fail
 * one by one.
 *
 * `crypto.subtle` is undefined in a non-secure context (plain http on a host that is not
 * localhost) and in a few locked-down configurations. Without this check every button
 * throws on click and the reader sees dead controls with no explanation — the page would
 * look broken rather than unavailable, which is a worse failure than saying so.
 *
 * `crypto.getRandomValues` is checked separately and deliberately: a build could have one
 * without the other, and this lab is the one place where silently proceeding without a
 * real random source would be worse than not running at all.
 */
function webCryptoMissing(): boolean {
  return (
    typeof crypto === 'undefined' ||
    !crypto.subtle ||
    typeof crypto.getRandomValues !== 'function'
  );
}

function reportUnavailable(): void {
  const banner = document.getElementById('unavailable');
  if (banner) banner.hidden = false;
  for (const control of Array.from(document.querySelectorAll<HTMLButtonElement>('main button'))) {
    control.disabled = true;
  }
}

function boot(): void {
  // Printed from the same constants the code uses, so a sentence on the page and the
  // number of candidates the search enumerates cannot drift apart.
  for (const node of Array.from(document.querySelectorAll('[data-pin-space]'))) {
    node.textContent = PIN_SPACE.toLocaleString('en-GB');
  }
  for (const node of Array.from(document.querySelectorAll('[data-pin-digits]'))) {
    node.textContent = String(PIN_DIGITS);
  }
  for (const node of Array.from(document.querySelectorAll('[data-candidate-count]'))) {
    node.textContent = String(CANDIDATE_PINS.length);
  }

  mountQuestions();

  if (webCryptoMissing()) {
    reportUnavailable();
    return;
  }

  mountPanel1();
  mountPanel2();
  mountPanel3();
  // Synchronous: the pinned run is pure arithmetic over committed bytes, with no
  // WebCrypto in it, so there is no promise here for a failure to hide inside.
  mountPinned();
  settled();
}

boot();
