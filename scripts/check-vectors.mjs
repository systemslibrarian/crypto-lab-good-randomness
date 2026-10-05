#!/usr/bin/env node
/*
 * check-vectors.mjs — re-derive every pinned vector with an INDEPENDENT ChaCha20.
 *
 * Run: it is the first thing `npm run build` does, so every build and every browser
 * suite runs it. CI ALSO runs it as its own step before the typecheck, which is not
 * redundant: as a named step it fails first and says `Pinned vectors` rather than
 * failing inside a step called `Build`, and the whole point of this script is that a
 * disagreement should name the DATA rather than the lab.
 *
 * The vectors in src/crypto/vectors.json were transcribed BY HAND from RFC 8439.
 * A hand transcription of 64 bytes of hex is exactly the kind of thing that is
 * wrong in one byte, and when this lab was first written ONE OF THEM WAS — the
 * tail of Appendix A.1 vector 4, from offset 44 onward. A unit test comparing the
 * lab's own ChaCha20 against a wrong vector reports a failure and cannot say
 * which side is wrong. This says which.
 *
 * The oracle is Node's own `crypto.createCipheriv('chacha20', ...)`, which is
 * OpenSSL's implementation and shares not one line with this repository. It is
 * NOT the RFC — the RFC is where the numbers were read from, and `where` on each
 * case cites the section. What this proves is narrower and is the thing worth
 * proving: every committed value is a correct ChaCha20 answer for its committed
 * inputs, so a transcription slip cannot survive.
 *
 * ON OPENSSL'S IV. OpenSSL's `chacha20` takes a SIXTEEN-byte IV: a 4-byte
 * little-endian block counter followed by the 12-byte nonce. RFC 8439 states the
 * counter as a separate 32-bit state word. Packing that wrongly would make this
 * script disagree with everything and read as a transcription disaster, so the
 * packing is pinned first: `guard` in the JSON is checked before anything else
 * and this script exits 2 — a different code from a real disagreement — if it
 * fails. Without that, "the oracle is miswired" and "the data is wrong" look
 * identical, and the wrong one of the two gets fixed.
 */
import { createCipheriv } from 'node:crypto';
import { readFileSync } from 'node:fs';

const SRC = 'src/crypto/vectors.json';
const data = JSON.parse(readFileSync(SRC, 'utf8'));

/** OpenSSL's keystream: encrypting zeros IS the keystream. */
function keystream(keyHex, counter, nonceHex, nbytes) {
  return openssl(keyHex, counter, nonceHex, Buffer.alloc(nbytes));
}

function openssl(keyHex, counter, nonceHex, input) {
  const iv = Buffer.alloc(16);
  iv.writeUInt32LE(counter, 0);
  Buffer.from(nonceHex, 'hex').copy(iv, 4);
  const c = createCipheriv('chacha20', Buffer.from(keyHex, 'hex'), iv);
  return Buffer.concat([c.update(input), c.final()]).toString('hex');
}

// ── The oracle's wiring is pinned before any case is judged ─────────────────
const g = data.guard;
const guard = keystream(g.keyHex, g.counter, g.nonceHex, g.expectHex.length / 2);
if (guard !== g.expectHex) {
  console.error(
    "this script is packing OpenSSL's 16-byte IV wrongly, so it cannot judge\n" +
      'anything. Fix the packing before reading any result as a transcription error.'
  );
  console.error(`  committed ${g.expectHex}\n  openssl   ${guard}`);
  process.exit(2);
}

const problems = [];
let checked = 0;

function compare(label, expected, actual, detail) {
  checked += 1;
  if (expected === actual) return;
  let at = 0;
  while (at < expected.length && expected[at] === actual[at]) at += 1;
  problems.push(
    `${label}: ${detail}\n     committed  ${expected}\n     openssl    ${actual}\n` +
      `     first difference at hex offset ${at} (byte ${Math.floor(at / 2)})`
  );
}

for (const c of data.blockCases) {
  compare(
    c.label,
    c.expectHex,
    keystream(c.keyHex, c.counter, c.nonceHex, c.expectHex.length / 2),
    'block-function keystream'
  );
}

for (const c of data.streamCases) {
  compare(
    c.label,
    c.expectHex,
    openssl(c.keyHex, c.counter, c.nonceHex, Buffer.from(c.plaintext, 'utf8')),
    `encryption of ${Buffer.byteLength(c.plaintext, 'utf8')} bytes of text`
  );
}

/*
 * The derived cases are checked in the direction they claim: OpenSSL must also
 * produce something OTHER than the published answer. A case that agreed would
 * mean the derived input is not actually different from the published one, which
 * would make the case vacuous rather than wrong — and a vacuous case in the half
 * that is supposed to have teeth is the worse of the two failures.
 */
for (const c of data.mustDiffer) {
  checked += 1;
  const got = keystream(c.keyHex, c.counter, c.nonceHex, c.mustNotEqualHex.length / 2);
  if (got === c.mustNotEqualHex) {
    problems.push(
      `${c.label}: OpenSSL reproduced the published answer, so this input is NOT ` +
        'different from the published one and the case proves nothing'
    );
  }
}

// A step that checks zero cases exits 0 and reads as a pass (§4.1e), so the
// count is asserted against the file's own arrays rather than assumed.
const expected = data.blockCases.length + data.streamCases.length + data.mustDiffer.length;
if (checked !== expected || checked === 0) {
  console.error(`checked ${checked} cases but ${SRC} holds ${expected}`);
  process.exit(1);
}

if (problems.length > 0) {
  console.error(`${problems.length} of ${checked} pinned vectors disagree with OpenSSL's ChaCha20:\n`);
  for (const p of problems) console.error(`  ${p}\n`);
  console.error(
    'OpenSSL is the independent implementation here, so a disagreement means the\n' +
      'COMMITTED value is a bad transcription. Read the RFC 8439 section the case\n' +
      'names and fix src/crypto/vectors.json.'
  );
  process.exit(1);
}

console.log(
  `all ${checked} pinned vectors re-derived with OpenSSL's ChaCha20 and agree ` +
    `(${data.blockCases.length} block, ${data.streamCases.length} stream, ` +
    `${data.mustDiffer.length} must-differ)`
);
