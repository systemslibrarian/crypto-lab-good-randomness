/*
 * Predictions, and the three questions at the end.
 *
 * TWO DIFFERENT JOBS, deliberately not merged.
 *
 * A PREDICTION comes before an experiment and asks the reader to commit. It matters
 * because the paragraph above a button tends to give the answer away, so the
 * experiment confirms a sentence rather than testing a belief. Being wrong about
 * something you have just committed to is the moment the idea sticks. Predictions are
 * optional, they never block a button, and the feedback explains the mechanism instead
 * of marking an answer.
 *
 * A SCENARIO CHECK comes at the end and asks the reader to apply the idea somewhere the
 * page has not already shown them. Clicking every button is not evidence of
 * understanding; these are. They are low-pressure by design: no score, no gate, and the
 * explanation is the content.
 *
 * Every option is a real button with an accessible name, every answer is
 * icon-and-text-and-colour, and the whole set ships inside disclosures that start shut
 * so a reader who already knows is not made to scroll past a quiz.
 */
import { el, fill } from './dom';
import { cross, tick } from './icons';

interface Option {
  readonly label: string;
  readonly correct: boolean;
  /** Why — shown whichever option is chosen, because the mechanism is the point. */
  readonly because: string;
}

interface Question {
  readonly host: string;
  readonly prompt: string;
  readonly options: readonly Option[];
}

const QUESTIONS: readonly Question[] = [
  {
    host: 'predict-recipe',
    prompt:
      'Before you press it a second time without changing the box: will you get the same ' +
      'five dice?',
    options: [
      {
        label: 'Yes — the same recipe, the same dice',
        correct: true,
        because:
          'Right. A program handed the same input takes the same steps, every time, on every ' +
          'machine. That is not a weakness of this particular generator; it is what a program ' +
          'is. The question the rest of the lab asks is where the input came from.',
      },
      {
        label: 'No — it will be different, like the dice above',
        correct: false,
        because:
          'Not quite, and this is the single most useful thing to be wrong about here. The dice ' +
          'above came from outside the program. These are worked out from the word in the box, ' +
          'so the same word gives the same answer — for you, and for anybody else who types it.',
      },
    ],
  },
  {
    host: 'predict-checks',
    prompt:
      'Before you look: will the checks be able to tell the two keys apart?',
    options: [
      {
        label: 'No — both can pass all four',
        correct: true,
        because:
          'Right. Both examples can pass the four checks shown here. A random sample can also flag a pattern by chance. These checks describe the ' +
          'displayed bytes; they don’t tell you how the seed was chosen. The PIN-seeded ' +
          'example is still predictable — Step 3 shows how.',
      },
      {
        label: 'Yes — the seeded one will look worse somehow',
        correct: false,
        because:
          'Not quite. It is a reasonable expectation and it is the one this lab exists to ' +
          'remove: a guessable key does not produce bad-looking output. If it did, this would ' +
          'be an easy problem.',
      },
    ],
  },
  {
    host: 'predict-search',
    prompt:
      'The seeded key is a full 256 bits, just like the other one. How many tries should it ' +
      'take to find?',
    options: [
      {
        label: 'Ten thousand — the number of PINs',
        correct: true,
        because:
          'Right. The key is 256 bits long and there are only ten thousand of it. Length is a ' +
          'ceiling, not a measurement: what matters is how many DIFFERENT keys the process ' +
          'could have produced.',
      },
      {
        label: 'About 2^256 — it is a 256-bit key',
        correct: false,
        because:
          'Not quite, and this is the arithmetic worth getting straight. 2^256 is how many ' +
          '32-byte values exist. It is not how many this generator can produce: it can produce ' +
          'ten thousand, one per PIN. The other 2^256 minus ten thousand never happen.',
      },
    ],
  },
  {
    host: 'scenario-1',
    prompt:
      'A program seeds its generator with the current time in milliseconds, then produces a ' +
      '256-bit key. Is the key 256 bits strong?',
    options: [
      {
        label: 'No — it is as strong as the number of times it could have started from',
        correct: true,
        because:
          'Right. If an attacker can narrow the moment to a day, that is 86 million ' +
          'milliseconds — fewer tries than a six-character password. The key is still 256 ' +
          'bits long. Length and strength are different measurements, and only one of them is ' +
          'printed on the tin.',
      },
      {
        label: 'Yes — the output is 256 bits, so it is 256-bit security',
        correct: false,
        because:
          'No, and this is the belief the whole lab is aimed at. You just watched a 256-bit key ' +
          'fall to ten thousand tries. The length of the output says nothing about how many ' +
          'different outputs were possible.',
      },
    ],
  },
  {
    host: 'scenario-2',
    prompt:
      'Somebody runs a battery of statistical tests on their generator’s output and it ' +
      'passes all of them. What have they established?',
    options: [
      {
        label: 'That the output has no obvious pattern — and nothing about the seed',
        correct: true,
        because:
          'Right. Tests like these describe the bytes they were shown; they don’t tell you how ' +
          'the seed was chosen, which is a property of the process that made the output. ' +
          'Step 2 showed one case of it: both examples can pass the four checks shown here, and ' +
          'the PIN-seeded example is still predictable. Passing tells you the tests found no ' +
          'pattern they look for — not that the seed was hard to guess.',
      },
      {
        label: 'That the generator is safe to use for keys',
        correct: false,
        because:
          'No. The PIN-seeded generator on this page passed all four checks in Step 2, and ' +
          'its key took ten thousand tries. Those checks describe the displayed bytes; they ' +
          'don\u2019t tell you how the seed was chosen \u2014 what caught it here is Step 3, ' +
          'which tries the starting points instead.',
      },
    ],
  },
  {
    host: 'scenario-3',
    prompt:
      'A team fixes a weak generator by hashing the seed with SHA-256 before using it. Does ' +
      'that help?',
    options: [
      {
        label: 'No — hashing ten thousand inputs gives ten thousand outputs',
        correct: true,
        because:
          'Right, and this page already does exactly that: the PIN is hashed with SHA-256, and ' +
          'ChaCha20 turns that hash into Source B\u2019s key. Two respectable steps, and still ' +
          'only ten thousand possible answers \u2014 a hash spreads a value out, it does not ' +
          'create choices that were never there. The only fix is more starting points, from a ' +
          'source the attacker cannot enumerate.',
      },
      {
        label: 'Yes — SHA-256 output is unpredictable',
        correct: false,
        because:
          'Not here. SHA-256 is unpredictable only if you do not know the input. The attacker ' +
          'in Step 3 knew the shape of the input and tried all of them \u2014 through the hash, ' +
          'which cost nothing. A deliberately slow password hash would be a real improvement ' +
          'in cost: ten thousand tries could be made to take days instead of a moment. It ' +
          'still would not make them fewer than ten thousand, which is why it is a brake and ' +
          'not a fix.',
      },
    ],
  },
  {
    /*
     * A DIFFERENT QUESTION FROM "DO THE BYTES LOOK RANDOM".
     *
     * Kept as a pointer, not a lesson: this page does not assess physical sources,
     * and the answer sends the reader to the lab that does.
     */
    host: 'scenario-5',
    prompt:
      'Suppose the randomness came from a new physical noise source instead. What evidence ' +
      'would you ask for?',
    options: [
      {
        label: 'How the raw source behaves, how it behaves after restarts, and how failures are caught',
        correct: true,
        because:
          'Right. That is a different question from whether the displayed bytes look random. ' +
          'You would want to understand the raw noise before any processing, check that the ' +
          'source does not repeat itself after a restart, and have it monitored for failures ' +
          'while it runs. Noise to Numbers, linked at the foot of this page, is the lab about ' +
          'assessing a physical source.',
      },
      {
        label: 'That its output passes the four checks on this page',
        correct: false,
        because:
          'Not enough. The four checks describe the bytes they were shown; they don\u2019t tell ' +
          'you how the source produced them, whether it starts from the same place after a ' +
          'restart, or whether it has quietly failed. The PIN-seeded example on this page ' +
          'passes all four and is still predictable.',
      },
    ],
  },
  {
    /*
     * THE QUESTION AIMED AT THE WRONG TAKEAWAY.
     *
     * The failure mode of a lab like this one is a reader who leaves believing that
     * deterministic generators are the problem and that the operating system produces
     * numbers which cannot possibly be guessed. Both halves of that are false, and
     * both are easy to acquire from Step 1 if nothing says otherwise. This is the one
     * question whose right answer is "determinism is fine".
     */
    host: 'scenario-4',
    prompt:
      'A generator is completely deterministic, but its starting point is kept secret and ' +
      'is far too large to try. Is the determinism the problem?',
    options: [
      {
        label: 'No — the problem was only ever a starting point somebody can try',
        correct: true,
        because:
          'Right, and this is the thing most worth taking away. Every generator on this page ' +
          'is deterministic, including the browser’s own: give it the same internal state ' +
          'and it produces the same bytes. That is not the defect. The defect in Step 3 was a ' +
          'list of ten thousand starting points that a stranger could work through in under a ' +
          'second.',
      },
      {
        label: 'Yes — anything deterministic can be reproduced, so it cannot be secret',
        correct: false,
        because:
          'Not quite. Reproducible BY WHOM is the question. You could reproduce a key if you ' +
          'knew the starting point, and so could anybody else who could find it — which ' +
          'in Step 3 took ten thousand tries, and for a secret, large starting point takes ' +
          'longer than anyone has. Nearly all real cryptography is deterministic machinery ' +
          'fed from one unguessable place.',
      },
    ],
  },
];

export function mountQuestions(): void {
  for (const question of QUESTIONS) {
    const host = document.getElementById(question.host);
    if (!host) continue;
    const answer = el('p', { class: 'check-result', role: 'status', 'aria-live': 'polite' });
    const options = el(
      'ul',
      { class: 'check-opts', role: 'list' },
      question.options.map((option) =>
        el('li', { role: 'listitem' }, [
          (() => {
            const btn = el('button', { type: 'button', class: 'check-opt' }, [option.label]);
            btn.addEventListener('click', () => {
              answer.className = `check-result ${option.correct ? 'pill-ok' : 'pill-bad'}`;
              fill(
                answer,
                el('span', { class: 'pill-head' }, [
                  option.correct ? tick() : cross(),
                  el('span', {}, [option.correct ? 'Correct' : 'Not quite']),
                ]),
                el('span', { class: 'pill-why' }, [option.because])
              );
            });
            return btn;
          })(),
        ])
      )
    );
    fill(host, el('p', { class: 'check-q' }, [question.prompt]), options, answer);
  }
}
