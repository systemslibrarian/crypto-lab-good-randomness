/*
 * The glyphs, drawn.
 *
 * Stroke-only SVG in `currentColor`, so each one takes the colour of the verdict
 * it sits in and needs no second asset per tone. Every one is `aria-hidden` and
 * sits beside its own words — the state is never carried by the picture alone, nor
 * by colour alone (WCAG 1.4.1): every verdict on this page is icon AND text AND
 * colour.
 *
 * Stroke-only on purpose. A filled shape would be measured by the non-text
 * contrast oracle as an opaque region; a stroke is a boundary, which is what these
 * actually are. SVG's initial `fill` is black and `getComputedStyle` reports it
 * even for geometry that paints no fill, so the stroke-only form also keeps
 * `contrast.ts`'s underlay walk from treating a glyph as a black rectangle behind
 * the text beside it.
 *
 * THE QUESTION MARK IS THE ONE THIS LAB NEEDED. Panel 2 renders a verdict that is
 * deliberately not a verdict: two outputs, four checks each, and nothing
 * established either way. A tick there would say "fine" and a warning would give
 * the game away, so the glyph has to say "no information" as plainly as the words
 * beside it do.
 */

const SVG = 'http://www.w3.org/2000/svg';

function shell(paths: string[], extra: string): SVGElement {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', `glyph ${extra}`);
  for (const d of paths) {
    const path = document.createElementNS(SVG, 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  return svg;
}

/** A tick, for an outcome that is simply right. */
export const tick = (): SVGElement => shell(['M4 13l5 5L20 7'], 'glyph-tick');

/** A cross, for a real error in what the reader supplied. */
export const cross = (): SVGElement => shell(['M6 6l12 12', 'M18 6 6 18'], 'glyph-cross');

/** An exclamation in a triangle, for a limit that has just been demonstrated. */
export const warn = (): SVGElement =>
  shell(['M12 3 2 20h20L12 3z', 'M12 9v5', 'M12 17.5v.5'], 'glyph-warn');

/** A barred circle, for a refusal that is CORRECT — nothing was found because
 *  there was nothing there. Not a failure, so not a cross. */
export const held = (): SVGElement =>
  shell(['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z', 'M6 18 18 6'], 'glyph-held');

/** A question mark, for a result that establishes nothing either way. */
export const question = (): SVGElement =>
  shell(['M9 9a3 3 0 1 1 4.6 2.5c-1 .7-1.6 1.3-1.6 2.5', 'M12 17.5v.5'], 'glyph-question');

/**
 * A die with five pips, for the two rolling panels.
 *
 * The pips are drawn as zero-length strokes with round caps, which is how a
 * stroke-only renderer draws a dot — a `<circle fill>` would reintroduce the
 * opaque-region problem the whole file is shaped to avoid.
 */
export const die = (): SVGElement =>
  shell(
    [
      'M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z',
      'M8.5 8.5v0',
      'M15.5 8.5v0',
      'M12 12v0',
      'M8.5 15.5v0',
      'M15.5 15.5v0',
    ],
    'glyph-die'
  );

/** A key, for a key that has just been handed to somebody who guessed it. */
export const key = (): SVGElement =>
  shell(
    [
      'M14.5 9.5a3.5 3.5 0 1 1 -3.5 -3.5',
      'M11 6h8',
      'M17 6v3',
      'M14 6v2',
      'M11 9.5 4 16.5V20h3.5l1-1v-2h2v-2h1.5',
    ],
    'glyph-key'
  );
