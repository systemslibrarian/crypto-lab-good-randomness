/*
 * The run-scoped sink that makes a mutation record UNFORGEABLE.
 *
 * §4.1c of the build standard asks that every `observed` record be written by the
 * thing that ran it, never typed. Writing them is the easy half. The half that
 * matters is this: an archived record is only worth something if an UNPERFORMED
 * record fails the suite. Otherwise the ledger is a second copy of an answer
 * nobody is checking, and a kill that stopped happening stays recorded forever.
 *
 * So each claims test calls `witness()` with the (test, marker) pair it actually
 * asserted, an `afterEach` records which tests ran at all, and `enforceLedger()`
 * fails the run when a recorded kill names a pair its own test ran without
 * witnessing.
 *
 * `crypto-lab-privacy-pass` writes its observed lines into its ledger;
 * `crypto-lab-hidden-bit` and `crypto-lab-pqxdh-wire` deliberately do not, and
 * their reason is the better one — enforcement is the requirement, archival is a
 * choice. This lab does both, because `README.md` quotes the ledger, and a quoted
 * record that nothing enforces is exactly the drift this file prevents.
 *
 * ONE THING WORTH KNOWING ABOUT THIS PARTICULAR LAB. Two of its six mutations own
 * the same test and the same marker, in opposite directions: one makes the
 * recovery claim success without decrypting, the other makes it claim failure
 * after a real decryption. The witness key is (test, marker), so both records
 * resolve to one witness — which is correct and is the behaviour to want. The
 * enforcement question is "does the assertion that produced these kills still
 * exist", and for those two it is the same assertion.
 *
 * WHY THIS IS NOT A `globalTeardown`. It was, and that was wrong in a way worth
 * recording. The teardown tried to decide whether the claims suite had run by
 * asking whether `claims` was in `config.projects` — on the belief that
 * Playwright filters that list to the selected projects. IT DOES NOT: the full
 * project list is passed whatever `--project` was given. So an a11y-only run
 * enforced the claims ledger, found no witnesses, and failed the accessibility
 * gate — three passing a11y tests reported under a red step naming the wrong
 * subject, which is the precise failure §4.1a exists to prevent, reintroduced by
 * the machinery meant to enforce honesty. Caught on CI, where the a11y gate and
 * the claims suite run as separate steps.
 *
 * The fix is not a better guess at which projects ran. It is to stop asking: each
 * ledger entry is checked only if ITS OWN owning test ran in this invocation, so
 * the check is scoped by observation rather than by inference. A full claims run
 * checks everything; a single `-g` test checks only itself; an a11y run checks
 * nothing, because no claims test ran.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';

const DIR = 'test-results';
/** (test, marker) pairs a test asserted. */
export const SINK = `${DIR}/verdict-sink.jsonl`;
/** Test titles that executed at all, pass or fail. */
export const RAN = `${DIR}/tests-ran.jsonl`;

/** One key per (test, marker) pair. The separator cannot occur in a marker. */
export const key = (test: string, marker: string): string => `${test} >> ${marker}`;

function append(file: string, value: object): void {
  mkdirSync(dirname(file), { recursive: true });
  // Append-only, one JSON object per line, so parallel workers cannot lose each
  // other's entries to a read-modify-write race — which a JSON array would.
  appendFileSync(file, `${JSON.stringify(value)}\n`);
}

/** Record that this test really asserted this marker. */
export function witness(testTitle: string, marker: string): void {
  append(SINK, { test: testTitle, marker });
}

/** Record that this test executed, whatever its outcome. Called from afterEach. */
export function ran(testTitle: string): void {
  append(RAN, { test: testTitle });
}

function readLines<T>(file: string): T[] {
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
}

interface LedgerKill {
  readonly id: string;
  readonly owningTest: string;
  readonly marker: string;
  readonly outcome: string;
}

/**
 * Fail if a recorded kill's own test ran without witnessing its marker.
 *
 * Called from an `afterAll` in the claims spec, so it runs when — and only when
 * — that file ran. `MUTATION_RUN` skips it because `scripts/mutate.mjs` runs one
 * test at a time while BUILDING the ledger, and a test that is failing under a
 * mutation may never reach its `witness()` call. The runner's final act is a full
 * claims pass without that flag, which is what validates the ledger it wrote.
 */
export function enforceLedger(): void {
  if (process.env.MUTATION_RUN) return;
  if (!existsSync('mutations/LEDGER.json')) return;

  const ledger = JSON.parse(readFileSync('mutations/LEDGER.json', 'utf8')) as {
    mutations: LedgerKill[];
  };
  const executed = new Set(readLines<{ test: string }>(RAN).map((e) => e.test));
  const witnessed = new Set(
    readLines<{ test: string; marker: string }>(SINK).map((e) => key(e.test, e.marker))
  );

  const unperformed = ledger.mutations
    .filter((m) => m.outcome === 'KILLED')
    .filter((m) => executed.has(m.owningTest))
    .filter((m) => !witnessed.has(key(m.owningTest, m.marker)))
    .map((m) => `${m.id}: recorded as killed by "${m.owningTest}" on marker "${m.marker}"`);

  if (unperformed.length > 0) {
    throw new Error(
      'mutations/LEDGER.json records kills whose owning test ran in this suite WITHOUT ' +
        'asserting the marker the record names. Either the assertion was removed and the ' +
        'record is now false, or the marker was renamed and the ledger needs regenerating ' +
        'with `npm run mutations`:\n  ' +
        unperformed.join('\n  ')
    );
  }
}
