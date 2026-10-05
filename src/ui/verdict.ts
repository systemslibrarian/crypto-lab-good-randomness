/*
 * Verdicts — the markers the claims suite and the mutation runner both address.
 *
 * ON THE FIVE TONES, AND WHY THERE ARE FIVE.
 *
 * Colour tracks SYSTEM INTEGRITY, never the raw return value:
 *
 *   pass     the thing worked, and working is correct.
 *   held     it found NOTHING, and finding nothing is correct — ten thousand
 *            candidates against a key that had no seed. Calm, not alarming: a
 *            reader who meets that panel must not read it as a fault.
 *   alarm    every check passed and the property a reader expected is absent
 *            anyway. The recovered key, and Panel 2 once the recovery has told it
 *            what it was looking at.
 *   fail     a real error in what the reader supplied — an empty recipe box.
 *   neutral  NOTHING HAS BEEN ESTABLISHED. This is the tone this lab needed and
 *            no generic palette has, and it exists because of a line in the build
 *            brief: "No colour until panel 3 resolves which was which. Painting
 *            the seeded one red in panel 2 would give the game away and destroy
 *            the lesson, which is precisely that you cannot see it."
 *
 * So Panel 2's verdict is deliberately uncoloured while it is the trap, and
 * Panel 3's recovery is what re-renders it in `alarm`. That re-render is the whole
 * teaching mechanism of the page: the thing you could not read becomes readable
 * only after something else told you the answer.
 *
 * `neutral` is also what a wrong single guess gets. A miss is not a refusal that
 * is correct — painting it `held` would quietly teach that the generator resisted,
 * which is false. It establishes nothing, so it says nothing.
 *
 * EVERY VERDICT IS ICON + TEXT + COLOUR (WCAG 1.4.1). The glyph is `aria-hidden`
 * and sits beside words that say the same thing, so the state survives greyscale,
 * deuteranopia and a screen reader alike. That matters more than usual here,
 * because `neutral` is defined by the ABSENCE of colour — a reader who cannot see
 * colour at all must still get the whole distinction from the words, and does.
 *
 * ON `data-verdict`. Each verdict carries its marker as an attribute. That is what
 * `e2e/claims.spec.ts` asserts against and what `mutations/mutations.json` names,
 * so a mutation record points at a surface rather than at a sentence.
 */
import { cross, die, held, key, question, tick, warn } from './icons';
import { el, fill } from './dom';

export type Tone = 'pass' | 'held' | 'alarm' | 'fail' | 'neutral';

export type Glyph = 'tick' | 'cross' | 'warn' | 'held' | 'question' | 'die' | 'key';

const GLYPHS: Record<Glyph, () => SVGElement> = { tick, cross, warn, held, question, die, key };

export interface VerdictSpec {
  /** The stable marker. Claims tests and mutation records both use it. */
  readonly marker: string;
  readonly tone: Tone;
  readonly glyph: Glyph;
  /** The headline, in capitals, read as the state. */
  readonly headline: string;
  /** One or more plain sentences under it. */
  readonly detail: readonly string[];
}

/**
 * Everything a rendered verdict depends on, as one string.
 *
 * A verdict is a statement about inputs that existed when it was computed. Change
 * one of those inputs and the verdict on screen becomes a claim about a state the
 * page is no longer in — which is the quiet way a demo starts lying. So each slot
 * declares how to recompute its basis, the basis is stored at render time, and
 * `retireStale` compares.
 *
 * The comparison gives the no-op guard for free: setting a field back to the value
 * it already held recomputes an IDENTICAL basis, so a fresh verdict survives it.
 * Only a real change retires anything.
 */
export interface Slot {
  readonly marker: string;
  readonly host: HTMLElement;
  readonly basis: () => string;
  /**
   * What to DO about it, named per slot. A reader who has just changed the recipe
   * box wants to be told "roll again with this recipe", not informed that a
   * dependency moved.
   */
  readonly nextAction: string;
}

interface Rendered {
  readonly slot: Slot;
  readonly basisAtRender: string;
  readonly headline: string;
}

const slots = new Map<string, Slot>();
const rendered = new Map<string, Rendered>();

/** Declare a verdict slot. Called once per marker, at panel build time. */
export function slot(
  marker: string,
  host: HTMLElement,
  basis: () => string,
  nextAction: string
): Slot {
  const s: Slot = { marker, host, basis, nextAction };
  slots.set(marker, s);
  return s;
}

/** Render a verdict into its slot and remember what it was computed from. */
export function render(marker: string, spec: VerdictSpec, extra: Node[] = []): HTMLElement {
  const s = slots.get(marker);
  if (!s) throw new Error(`no verdict slot declared for "${marker}"`);
  const node = el(
    'div',
    { class: `verdict verdict-${spec.tone}`, 'data-verdict': marker, 'data-tone': spec.tone },
    [
      el('p', { class: 'verdict-head' }, [
        GLYPHS[spec.glyph](),
        el('span', { class: 'verdict-headline' }, [spec.headline]),
      ]),
      ...spec.detail.map((d) => el('p', { class: 'verdict-detail' }, [d])),
    ]
  );
  fill(s.host, node, ...extra);
  rendered.set(marker, { slot: s, basisAtRender: s.basis(), headline: spec.headline });
  return node;
}

/** Drop a verdict and everything rendered beside it, leaving the slot empty. */
export function clear(marker: string): void {
  const s = slots.get(marker);
  if (!s) return;
  fill(s.host);
  rendered.delete(marker);
}

/**
 * Replace every verdict whose inputs have changed with a retirement notice.
 *
 * The notice is deliberately a separate shape rather than a greyed-out copy of the
 * old verdict: a stale verdict that still reads like a result is worse than no
 * verdict, because a reader cannot tell which state the page is describing.
 * `data-verdict-retired` carries the marker that was retired, so a claims test can
 * assert BOTH that the stale verdict is gone and that the page says why.
 */
export function retireStale(): void {
  for (const [marker, r] of Array.from(rendered.entries())) {
    if (r.slot.basis() === r.basisAtRender) continue;
    fill(
      r.slot.host,
      el('div', { class: 'verdict verdict-retired', 'data-verdict-retired': marker }, [
        el('p', { class: 'verdict-head' }, [
          GLYPHS.warn(),
          el('span', { class: 'verdict-headline' }, ['OUT OF DATE']),
        ]),
        el('p', { class: 'verdict-detail' }, [r.slot.nextAction]),
      ])
    );
    rendered.delete(marker);
  }
}

/** Whether a marker currently holds a live (non-retired) verdict. */
export function isLive(marker: string): boolean {
  return rendered.has(marker);
}

/** The headline a marker is currently showing, for a panel that reads another's. */
export function headlineOf(marker: string): string | null {
  return rendered.get(marker)?.headline ?? null;
}
