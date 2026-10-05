/** Element helpers. Nothing here knows any cryptography. */

type Attrs = Record<string, string | number | boolean | undefined>;

/**
 * Create an element with attributes and children.
 *
 * Attributes are set with `setAttribute` rather than as JS properties, which
 * matters for `role`: the gate's `assertListSemantics` asks the DOM what roles are
 * present, and a role assigned as a property would not be there to find.
 */
export function el(tag: string, attrs: Attrs = {}, children: (Node | string)[] = []): HTMLElement {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    node.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children) node.append(c);
  return node;
}

/** Shorthand for a paragraph of plain text. */
export function p(text: string, cls?: string): HTMLElement {
  return el('p', cls ? { class: cls } : {}, [text]);
}

/** Replace an element's contents in one go. */
export function fill(host: HTMLElement, ...children: (Node | string)[]): void {
  host.replaceChildren(...children);
}

export function byId<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`#${id} is not in index.html`);
  return found as T;
}

/**
 * A disclosure that ships SHUT, carrying the real bytes.
 *
 * The page reads in plain language and the reader who wants the actual values
 * opens one of these. Shut is the default on every one, and the gate asserts it —
 * which matters more in this lab than in most, because the brief's instruction was
 * plain language BEFORE any hex, and a disclosure that shipped open would put a
 * 64-character key on the first screen.
 */
export function disclosure(summary: string, body: (Node | string)[]): HTMLElement {
  return el('details', { class: 'bytes-details' }, [
    el('summary', {}, [summary]),
    el('div', { class: 'bytes-body' }, body),
  ]);
}

/**
 * A long value that wraps instead of scrolling.
 *
 * WCAG 1.4.10 at 320px is the constraint. A 64-character key inside an
 * `overflow-x: auto` box would need a keyboard route and a label (2.1.1); grouped
 * and wrapped it needs neither, and a reader at phone width can read all of it.
 * `toGroupedHex` is what gives the browser somewhere to break.
 */
export function longValue(text: string, label: string): HTMLElement {
  return el('p', { class: 'long-value', 'data-label': label }, [
    el('span', { class: 'long-value-label' }, [label]),
    el('code', { class: 'long-value-code' }, [text]),
  ]);
}

/**
 * A copy button that reports what happened.
 *
 * The label reverts after a moment. Headless Chromium denies clipboard access, so
 * "Copy failed" is a real state the a11y gate scans rather than a bug — which is
 * why the failure path paints the same way the success path does instead of
 * throwing.
 */
export function copyButton(label: string, value: () => string): HTMLElement {
  const btn = el('button', { type: 'button', class: 'btn btn-quiet copy-btn' }, [label]);
  btn.addEventListener('click', () => {
    const done = (word: string): void => {
      btn.textContent = word;
      window.setTimeout(() => (btn.textContent = label), 1200);
    };
    navigator.clipboard?.writeText(value()).then(
      () => done('Copied'),
      () => done('Copy failed')
    );
  });
  return btn;
}
