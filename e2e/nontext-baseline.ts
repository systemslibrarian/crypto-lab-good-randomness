/**
 * Known WCAG 1.4.11 / generated-content findings in this lab, captured through
 * the gate's own path so the baseline and the check cannot disagree.
 *
 * THIS FILE IS A TO-DO LIST, NOT A SET OF EXEMPTIONS. The gate ratchets on it:
 *   - a finding NOT listed here fails the run, so a regression cannot land;
 *   - a listed finding whose ratio gets WORSE fails, so the list cannot rot;
 *   - a listed finding that no longer appears ALSO fails, so a fixed entry must
 *     be deleted and the file can only shrink toward empty.
 * The last rule is what stops an allowlist becoming a permanent exemption.
 *
 * `unverified: true` marks an absolutely-positioned pseudo-element. It can paint
 * outside its host and the oracle measures it against the host's backdrop, so
 * that ratio is NOT trustworthy — hand-measure before acting on it.
 *
 * IT IS EMPTY. That is a weaker claim than it sounds, and the honest version
 * matters: an empty baseline is also what an oracle that never ran produces. That is
 * why §4.1c of the build standard requires the oracle to be proved rather than
 * inferred from a green run, and it was — by degrading the token it owns:
 *
 *   `--control-border` was changed from #727e8c to #2b3440 — the value of the
 *   decorative `--border` divider — `npm run build` was confirmed to SUCCEED, the
 *   built CSS hash was confirmed to MOVE (47263e19b4747 → 46e69ef4e24ec), and the
 *   gate then failed in the ARRIVAL state naming the controls and their ratios:
 *   `textarea#recipe` and `button#check-broken.btn` at 1.37:1, and six
 *   `button.check-opt` at 1.27:1, each "border-top N:1 vs surround", against a
 *   required 3:1. On restore the hash returned to 47263e19b4747.
 *
 * Why the file is empty: every operable control here takes `--control-border`, the
 * `--border` token (#2b3440) measures about 1.4:1 against the card it divides and is
 * used for dividers only, and `.btn-primary` draws its edge in `--accent-ink` rather
 * than in its own accent fill — a border the same colour as the fill it surrounds is
 * not a boundary at all. The shared top bar's `.cl-btn` draws its edge from
 * `--cl-ink` rather than from `--accent` and clears 3:1 here, which is why the entry
 * a gate copied from an older stylesheet would carry is absent too.
 *
 * IT WAS NOT EMPTY ON THE FIRST FULL DRIVE, and what it held is worth recording
 * because the shape is one a stylesheet inherited from elsewhere will not have been
 * sized for: an operable control on a TINTED surface. The copy button inside each
 * `.key-col` sits on `--surface-2` until Step 3 marks the columns, at which point the
 * background becomes `color-mix(alarm 10%, surface-2)` or
 * `color-mix(ok 9%, surface-2)`. At the `--control-border` of #626d7a the reference
 * stylesheet carries — which clears the plain surface by three hundredths, 3.03:1 —
 * that tint pushed it under, and the gate named `button.btn.btn-quiet.copy-btn` at
 * 2.62:1 and 2.57:1 in the marked state at all three widths. The token is now
 * #727e8c, which clears 3.27:1 against the worse of those backdrops and 3.85:1
 * against the plain surface. Raising the token was the right fix rather than reducing
 * the tint: the tint is what Step 3 uses to say which column it recovered.
 *
 * ONE MORE SHAPE WORTH A NOTE, because it is this lab's own design constraint rather
 * than a generic one. `.verdict-neutral` is required by the build brief to carry no
 * colour at all, so it cannot borrow a tone's border the way the other four verdict
 * cards do. Its left edge is therefore `--control-border`, not `--border`. A reviewer
 * tempted to "tidy" that to `--border` for consistency with the card frames would
 * reintroduce a finding here.
 *
 * A run with `NT_BASELINE_CAPTURE=1` set prints every finding through this same
 * path and asserts nothing, which is how this file is regenerated.
 */
export const NONTEXT_BASELINE: Record<
  string,
  { ratio: number; required: number; unverified: boolean }
> = {};
