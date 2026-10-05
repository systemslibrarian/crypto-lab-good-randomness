#!/usr/bin/env node
/*
 * mutate.mjs — run the mutations in mutations/mutations.json and write the ledger.
 *
 * Run: npm run mutations
 *
 * §4.1c of the catalog's _MASTER-TEMPLATE.md says a green suite is not evidence
 * until you have watched it fail, and that for a lab rendering verdict markers
 * the watching is done by a script rather than by a person — because a person
 * who performs the five steps then writes the result down afterwards, and a
 * sentence describing a run is the author's side of the claim rather than the
 * run's.
 *
 * THE FOUR KILL RULES, AND WHERE EACH IS ENFORCED BELOW.
 *
 *   1. The owning test PASSED UNMUTATED in the same run.   -> `baseline()`
 *   2. The patch actually CHANGED the file.                -> `applyPatches()`
 *   3. The run served the MUTATED code.                    -> `hashBundle()`
 *   4. A patch that does not compile is DOES NOT BUILD,
 *      and is never a kill.                                -> `build()`
 *
 * Rule 3 is a property rather than a mechanism, and §4.1c allows two ways of
 * satisfying it: require the built bundle's hash to MOVE, or CLASSIFY the failure
 * and refuse any red run whose output looks like a build error or a server that
 * never started. THIS SCRIPT DOES BOTH, and the second half matters more than it
 * looks here: Playwright's `reuseExistingServer: !process.env.CI` means a preview
 * server already listening on 4213 is reused and the webServer command — the
 * command that BUILDS — never runs at all. A mutation run against a stale server
 * would read every mutation as a survivor. So `CI=1` is set on every child
 * process, which turns that reuse off and makes the port strict.
 *
 * Rule 1 is why the baseline is re-measured in the same invocation rather than
 * assumed from a previous green run: a test that was already failing for an
 * unrelated reason would otherwise be recorded as killed by every mutation that
 * touched it.
 *
 * The ledger it writes is enforced, not merely archived. Each claims test calls
 * `witness()` from e2e/evidence.ts with the (test, marker) pair it actually
 * asserted, and an `afterAll` in that spec fails any later full claims run in
 * which a recorded kill's own test ran WITHOUT asserting the marker the record
 * names. So a kill can only stay recorded while the assertion that produced it
 * still exists.
 *
 * (That enforcement lived in a `globalTeardown` first. Playwright passes the FULL
 * project list there whatever `--project` was given, so an a11y-only run enforced
 * the claims ledger and failed the ACCESSIBILITY GATE with all its tests passing.
 * See e2e/evidence.ts.)
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const LEDGER_DIR = 'mutations';
const SPEC = join(LEDGER_DIR, 'mutations.json');

/** Every child runs with CI=1 so no already-listening preview can be reused. */
const ENV = { ...process.env, CI: '1', MUTATION_RUN: '1' };

/** Output that means the build or the server failed, not that a test failed. */
const NOT_A_TEST_FAILURE =
  /was not able to start|Exit code: 2|error TS\d+|ECONNREFUSED|EADDRINUSE|net::ERR_CONNECTION_REFUSED/;

function run(cmd, args) {
  try {
    return { code: 0, out: execFileSync(cmd, args, { env: ENV, encoding: 'utf8', stdio: 'pipe' }) };
  } catch (e) {
    return {
      code: e.status ?? 1,
      out: `${e.stdout ?? ''}${e.stderr ?? ''}`,
    };
  }
}

/**
 * The hash of the JS bundle that was last built.
 *
 * Read AFTER the Playwright run, because Playwright's webServer command is what
 * builds — so `dist/` then holds the bundle the browser was actually served.
 * Hashing before the run would only prove a build happened, not that the run
 * used it.
 */
function hashBundle() {
  const dir = 'dist/assets';
  if (!existsSync(dir)) return null;
  const js = readdirSync(dir).filter((f) => f.endsWith('.js')).sort();
  if (js.length === 0) return null;
  const h = createHash('sha256');
  for (const f of js) h.update(readFileSync(join(dir, f)));
  return h.digest('hex').slice(0, 16);
}

/** Rule 4: does the mutated source compile? */
function build() {
  const r = run('npm', ['run', 'build']);
  return { ok: r.code === 0, out: r.out };
}

/** Output that means `-g` matched nothing, rather than that a test failed. */
const NO_SUCH_TEST = /No tests found|Error: No tests found/i;

/** Run exactly the owning test. */
function runOwningTest(m) {
  return run('npx', ['playwright', 'test', `--project=${m.project}`, '-g', m.owningTest]);
}

/**
 * Rule 2: apply every patch, asserting each anchor occurs EXACTLY ONCE.
 *
 * An anchor that matches twice would patch one site and leave the other, and an
 * anchor that matches zero times is a mutation that silently did nothing — which
 * reads as a survivor and sends someone to fix a test that works. Both abort.
 */
function applyPatches(m, direction) {
  const touched = [];
  for (const patch of m.patches) {
    const before = readFileSync(patch.file, 'utf8');
    const from = direction === 'apply' ? patch.anchor : patch.replacement;
    const to = direction === 'apply' ? patch.replacement : patch.anchor;
    const hits = before.split(from).length - 1;
    if (hits !== 1) {
      throw new Error(
        `${m.id}: anchor occurs ${hits} times in ${patch.file} (must be exactly 1).\n` +
          `--- looking for ---\n${from}\n`
      );
    }
    const after = before.replace(from, to);
    if (after === before) throw new Error(`${m.id}: patch changed nothing in ${patch.file}`);
    writeFileSync(patch.file, after);
    touched.push({ file: patch.file, bytesBefore: before.length, bytesAfter: after.length });
  }
  return touched;
}

/** Restore by applying every patch in reverse. Surgical, never `git checkout`. */
function revert(m) {
  applyPatches(m, 'revert');
}

const spec = JSON.parse(readFileSync(SPEC, 'utf8'));
const started = new Date().toISOString();

console.log('── Baseline ───────────────────────────────────────────────────────');
const buildBaseline = build();
if (!buildBaseline.ok) {
  console.error('the UNMUTATED tree does not build; nothing below would mean anything');
  console.error(buildBaseline.out.slice(-2000));
  process.exit(1);
}

/* Rule 1, measured once per distinct owning test rather than once per mutation —
 * six mutations share three tests here, and running a passing test twice proves
 * nothing the first run did not. */
const baselineByTest = new Map();
for (const m of spec.mutations) {
  if (baselineByTest.has(m.owningTest)) continue;
  const r = runOwningTest(m);
  // A name that matches no test is a STALE RECORD, not a failing test. Reported
  // as its own outcome because the first time it happened -- a test renamed in
  // the same pass that reworded the page -- it surfaced as "BASELINE FAILED",
  // which sends you to read a test when the problem is the name beside it.
  if (NO_SUCH_TEST.test(r.out)) {
    baselineByTest.set(m.owningTest, 'no-such-test');
    console.log(`  NO SUCH TEST  ${m.owningTest}`);
    continue;
  }
  const passed = r.code === 0 && !NOT_A_TEST_FAILURE.test(r.out);
  baselineByTest.set(m.owningTest, passed);
  console.log(`  ${passed ? 'PASS' : 'FAIL'}  ${m.owningTest}`);
  if (!passed) console.error(r.out.slice(-2000));
}
const baselineHash = hashBundle();
console.log(`  unmutated bundle ${baselineHash}`);

const records = [];
for (const m of spec.mutations) {
  console.log(`\n── ${m.id} ───────────────────────────────────────────`);
  const record = {
    id: m.id,
    verdict: m.verdict,
    owningTest: m.owningTest,
    marker: m.marker,
    files: [...new Set(m.patches.map((p) => p.file))],
  };

  // Rule 1.
  const baseline = baselineByTest.get(m.owningTest);
  record.baselinePassed = baseline === true;
  if (!record.baselinePassed) {
    record.outcome = baseline === 'no-such-test' ? 'STALE RECORD' : 'BASELINE FAILED';
    record.observed =
      baseline === 'no-such-test'
        ? `no test is named "${m.owningTest}" any more, so this record points at nothing; rename it in mutations.json`
        : 'the owning test did not pass unmutated, so no red run under this mutation could be attributed to it';
    records.push(record);
    console.log(`  ${record.outcome}`);
    continue;
  }

  // Rule 2.
  let touched;
  try {
    touched = applyPatches(m, 'apply');
  } catch (e) {
    record.outcome = 'PATCH DID NOT APPLY';
    record.observed = String(e.message).split('\n')[0];
    records.push(record);
    console.log(`  ${record.outcome}: ${record.observed}`);
    continue;
  }
  record.fileChanged = touched.every((t) => t.bytesBefore !== t.bytesAfter || true);
  record.patchSites = touched.length;

  try {
    // Rule 4.
    const built = build();
    if (!built.ok) {
      record.outcome = 'DOES NOT BUILD';
      record.observed =
        'the mutated source does not compile, so the suite would have run against the previous bundle; this is never a kill';
      records.push(record);
      console.log(`  ${record.outcome}`);
      continue;
    }

    const r = runOwningTest(m);
    const postHash = hashBundle();

    // Rule 3, both ways: the served bundle moved, AND the red run is not a
    // build error or a server that never came up.
    record.bundleBefore = baselineHash;
    record.bundleAfter = postHash;
    record.bundleMoved = postHash !== null && postHash !== baselineHash;
    record.looksLikeInfraFailure = NOT_A_TEST_FAILURE.test(r.out);

    if (!record.bundleMoved) {
      record.outcome = 'MUTATION NEVER REACHED THE BROWSER';
      record.observed = `the built bundle hash did not move (${baselineHash}); the run cannot have served the mutated code`;
    } else if (record.looksLikeInfraFailure) {
      record.outcome = 'INFRASTRUCTURE FAILURE';
      record.observed = 'the run failed for a reason that is not a test failure (build, server or connection)';
    } else if (r.code === 0) {
      record.outcome = 'SURVIVED';
      record.observed =
        'the owning test still passed under the mutation. Either the test does not bite, or the mutated branch is unreachable — which is evidence about the source, not the test';
    } else {
      record.outcome = 'KILLED';
      // Written by the run, never typed: the failing test's own report lines.
      record.observed = firstFailureLines(r.out);
    }
  } finally {
    revert(m);
  }
  records.push(record);
  console.log(`  ${record.outcome}`);
  if (record.observed) console.log(`  ${record.observed.split('\n')[0]}`);
}

// The tree is back to its committed state, and the bundle hash proves it.
const restored = build();
const restoredHash = hashBundle();
console.log(
  `\n── Restored ───────────────────────────────────────────────────────\n` +
    `  builds: ${restored.ok}  bundle ${restoredHash} ` +
    `(${restoredHash === baselineHash ? 'matches the unmutated hash' : 'DOES NOT MATCH — the tree is dirty'})`
);

/** The lines the failing run itself printed, trimmed to what names the finding. */
function firstFailureLines(out) {
  const lines = out.split('\n');
  const start = lines.findIndex((l) => /Error:|expect\(/.test(l));
  if (start < 0) return out.trim().slice(0, 600);
  return lines
    .slice(start, start + 8)
    .map((l) => l.trim())
    .filter(Boolean)
    .join('\n');
}

mkdirSync(LEDGER_DIR, { recursive: true });
const ledger = {
  $comment:
    'GENERATED by scripts/mutate.mjs. Every `observed` value was written by the run that produced it. ' +
    'Do not hand-edit: re-run `npm run mutations`. An afterAll in e2e/claims.spec.ts fails any full ' +
    'claims run in which a kill recorded here names a test that ran without asserting its marker.',
  generated: started,
  baselineBundle: baselineHash,
  restoredBundle: restoredHash,
  restoredMatchesBaseline: restoredHash === baselineHash,
  killRules: [
    'the owning test PASSED unmutated in the same run',
    'the patch actually CHANGED the file',
    'the run served the MUTATED code (bundle hash moved, and the red run is not a build or server failure)',
    'a patch that does not compile is DOES NOT BUILD and is never a kill',
  ],
  mutations: records,
};
writeFileSync(join(LEDGER_DIR, 'LEDGER.json'), `${JSON.stringify(ledger, null, 2)}\n`);

const md = [
  '# Mutation ledger',
  '',
  '**GENERATED by `scripts/mutate.mjs` — do not hand-edit.** Re-run `npm run mutations`.',
  '',
  'Every `observed` line below was written by the run that produced it, never typed.',
  'The records are also enforced rather than archived: an `afterAll` in `e2e/claims.spec.ts`',
  'fails any full claims run in which a kill recorded here names a test that ran WITHOUT',
  'asserting its marker, so a kill can only stay recorded while its assertion still exists.',
  '',
  `Generated ${started}.`,
  '',
  '## A kill is defined by four rules, and the script enforces all four',
  '',
  ...ledger.killRules.map((r, i) => `${i + 1}. ${r}`),
  '',
  `Unmutated bundle \`${baselineHash}\`; restored bundle \`${restoredHash}\` ` +
    `(${ledger.restoredMatchesBaseline ? 'matches' : '**DOES NOT MATCH**'}).`,
  '',
  '## Results',
  '',
  '| Mutation | Verdict | Outcome | Bundle moved | Owning test |',
  '|---|---|---|---|---|',
  ...records.map(
    (r) =>
      `| \`${r.id}\` | \`${r.verdict}\` | **${r.outcome}** | ${r.bundleMoved ? `${r.bundleBefore} → ${r.bundleAfter}` : 'n/a'} | ${r.owningTest} |`
  ),
  '',
  '## Each mutation in full',
  '',
];
for (const m of spec.mutations) {
  const r = records.find((x) => x.id === m.id);
  md.push(
    `### \`${m.id}\``,
    '',
    `**What it changes.** ${m.what}`,
    '',
    `**Why this one.** ${m.why}`,
    '',
    `**What the page then shows.** ${m.expectOnPage}`,
    '',
    `**Patch sites.** ${m.patches.map((p) => `\`${p.file}\``).join(', ')} ` +
      `(${m.patches.length} ${m.patches.length === 1 ? 'site' : 'sites'}, each anchored on text that occurs exactly once).`,
    '',
    `**Owning test.** \`${m.owningTest}\` — asserts the \`${m.marker}\` verdict marker.`,
    '',
    `**Outcome: ${r?.outcome}.** Baseline passed: ${r?.baselinePassed}. ` +
      `Bundle ${r?.bundleBefore ?? 'n/a'} → ${r?.bundleAfter ?? 'n/a'}.`,
    '',
    '```',
    (r?.observed ?? '(no record)').trim(),
    '```',
    ''
  );
}
writeFileSync(join(LEDGER_DIR, 'LEDGER.md'), `${md.join('\n')}\n`);

const kills = records.filter((r) => r.outcome === 'KILLED').length;
console.log(`\nwrote mutations/LEDGER.json and mutations/LEDGER.md — ${kills}/${records.length} killed`);
if (!ledger.restoredMatchesBaseline || kills !== records.length) process.exitCode = 1;
