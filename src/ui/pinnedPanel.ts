/*
 * The pinned vectors, run in the reader's browser.
 *
 * Everything else on this page is the lab agreeing with itself. This section is the
 * lab agreeing with somebody else, and it runs on arrival so nobody has to press
 * anything to find out whether this build is trustworthy.
 *
 * IT MATTERS MORE HERE THAN IN MOST LABS. The cipher this lab leans on is hand-rolled,
 * and the one thing a reader cannot check by looking is whether it is really ChaCha20 —
 * a build with the block function's final addition dropped would produce output that
 * passes every check in Step 2 and every instinct a reader has. The published numbers
 * are the only thing that could tell them.
 *
 * THE THREE DERIVED CASES ARE REPORTED AS DERIVED. They are this lab's own, not the
 * RFC's, and each row says so. Folding them into a published count would borrow the
 * RFC's authority for cases this lab invented — a small dishonesty that happens to be
 * the exact failure a pinned-vector panel exists to prevent.
 */
import { EXPECTED_CASE_COUNT, runPinned } from '../crypto/pinned';
import { VECTOR_SOURCE } from '../crypto/vectors';
import { disclosure, el } from './dom';
import { render, slot } from './verdict';

export function mountPinned(): void {
  const host = document.getElementById('pinned-out') as HTMLElement;
  // The pinned set is fixed at build time, so nothing a reader does can retire this.
  slot('pinned', host, () => 'pinned', 'Reload the page to run the pinned cases again.');

  const run = runPinned();
  const allAgreed = run.agreed === run.total && run.total === EXPECTED_CASE_COUNT;

  const rows = el(
    'ol',
    { class: 'case-list', role: 'list' },
    run.results.map((r) =>
      el('li', { class: `case case-${r.agreed ? 'ok' : 'bad'}`, role: 'listitem' }, [
        el('span', { class: 'case-id' }, [r.label]),
        el('span', { class: 'case-kind' }, [r.requirement]),
        el('span', { class: 'case-where' }, [r.kind === 'published' ? 'published' : 'this lab']),
        el('span', { class: 'case-why' }, [r.why]),
        el('span', { class: 'case-got' }, [
          r.agreed ? `agreed — ${r.observed}` : `DISAGREED — this build ${r.observed}`,
        ]),
      ])
    )
  );

  render(
    'pinned',
    allAgreed
      ? {
          marker: 'pinned',
          tone: 'pass',
          glyph: 'tick',
          headline: `${run.agreed} OF ${run.total} AGREE`,
          detail: [
            'Every case came out the way it should, in this browser, just now. The cipher ' +
              'driving Step 1 and Step 2 really is the ChaCha20 that RFC 8439 specifies.',
            `${run.published} of the ${run.total} are published vectors from that ` +
              `specification. The other ${run.derived} are this lab’s own, and they are ` +
              'the half with teeth: each takes a published case, changes exactly one input, ' +
              'and requires the answer to change — so an implementation quietly ignoring ' +
              'its nonce would pass the published cases and fail here.',
          ],
        }
      : {
          marker: 'pinned',
          tone: 'alarm',
          glyph: 'warn',
          headline: `${run.agreed} OF ${run.total} AGREE`,
          detail: [
            'At least one case did not come out the way it should, so the generator on this ' +
              'page is not the cipher it claims to be. Do not trust anything else here until ' +
              'that is explained.',
          ],
        },
    [
      // The rows go BEHIND a disclosure: ten of them read as a second lesson competing
      // with the three steps, and a screen reader announcing all ten at once in a live
      // region is worse still. The summary is the result; the rows are the evidence.
      disclosure(`Show all ${run.total} cases`, [rows]),
      el('p', { class: 'source-line' }, [
        'Published cases from ',
        el('a', { href: VECTOR_SOURCE.url, target: '_blank', rel: 'noopener noreferrer' }, [
          VECTOR_SOURCE.name,
        ]),
        ` — ${VECTOR_SOURCE.detail}. They were transcribed by hand, and one of them was ` +
          'wrong in its last twenty bytes when this lab was first written. So the ' +
          'transcription is not trusted: a script re-derives every value on every build with ' +
          'a completely separate implementation of the same cipher, and that is what caught ' +
          'it.',
      ]),
    ]
  );
}
