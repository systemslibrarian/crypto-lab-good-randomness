/*
 * Panel 1 — dice, then a computer.
 *
 * WHAT THIS PANEL HAS TO DO. Establish, before any definition and before any hex,
 * that a computer is not a dice cup. The lab's whole argument rests on one sentence
 * a beginner will accept on sight — a program given the same input takes the same
 * steps — and the fastest way to make somebody accept it is to let them watch it
 * happen twice.
 *
 * THE DICE ARE NOT PLASTIC, AND THE PAGE SAYS SO. Rolling dice on a screen and
 * claiming the physics is unguessable would be a lie: these come from
 * `crypto.getRandomValues`. The honest version is better teaching anyway, and it is
 * what the panel prints — the browser rolls them, and the reason they are still
 * unguessable goes back to physical events the operating system measured. That
 * sentence is the one the rest of the lab hangs on.
 *
 * WHY THE RECIPE BOX TAKES A WORD AND NOT A NUMBER. "Seed" is the jargon this lab
 * is building up to, so the control is called a recipe and takes anything. A reader
 * who types their own name and gets the same five dice twice has met determinism
 * without meeting the word.
 */
import { rollDice, supplyFrom } from '../crypto/dice';
import { realBytes } from '../crypto/real';
import { seededBytes } from '../crypto/seeded';
import { toGroupedHex } from '../crypto/bytes';
import { DICE_PER_ROLL, basis, state } from './state';
import { byId, disclosure, el, fill, longValue } from './dom';
import { render, slot } from './verdict';
import { settled } from './settle';

/**
 * How many bytes to draw for five dice.
 *
 * Five dice need five usable bytes and rejection sampling has no fixed budget, so
 * this is a generous buffer rather than a calculation: the chance of 64 bytes
 * failing to yield five faces is (4/256)^60 or so, which is not a number anybody
 * needs to think about. `supplyFrom` throws rather than wrapping if it ever happens,
 * so the failure would be loud instead of a quietly repeating roll.
 */
const BYTE_BUDGET = 64;

/** The dice, as pips a reader can count, with the number beside them. */
function diceRow(faces: readonly number[], label: string): HTMLElement {
  return el('div', { class: 'dice-row' }, [
    el('span', { class: 'dice-row-label' }, [label]),
    el(
      'ul',
      { class: 'dice', role: 'list', 'aria-label': `${label}: ${faces.join(', ')}` },
      faces.map((f) =>
        el('li', { class: 'die', role: 'listitem', 'data-face': f }, [
          // The number is the accessible content; the pips are decoration over it.
          el('span', { class: 'die-number' }, [String(f)]),
          el('span', { class: 'die-pips', 'aria-hidden': 'true' }, [
            ...Array.from({ length: f }, () => el('span', { class: 'pip' })),
          ]),
        ])
      )
    ),
  ]);
}

export function mountPanel1(): void {
  const realOut = byId('p1-real-out');
  const recipeOut = byId('p1-recipe-out');
  const againOut = byId('p1-again-out');
  const recipeBox = byId<HTMLTextAreaElement>('recipe');

  slot('dice-real', realOut, basis.diceReal, 'Roll the dice again.');
  slot('dice-recipe', recipeOut, basis.diceRecipe, 'Roll again with the recipe now in the box.');
  slot(
    'same-again',
    againOut,
    basis.sameAgain,
    'The recipe changed, so this comparison was about a different one. Roll twice with the recipe now in the box.'
  );

  recipeBox.value = state.recipe;
  recipeBox.addEventListener('input', () => {
    state.recipe = recipeBox.value;
    settled();
  });

  byId('roll-real').addEventListener('click', () => {
    const roll = rollDice(DICE_PER_ROLL, supplyFrom(realBytes(BYTE_BUDGET)));
    state.realRolls.push(roll);
    const rolls = state.realRolls;

    // The comparison across rolls is COMPUTED and the honest case is covered: two
    // real rolls can match, and a page that treated a match as a fault would be
    // teaching that randomness means never repeating.
    const detail = [
      'These five came from the browser’s own random source. You cannot work out the ' +
        'next five from them, and neither can anybody else — the bits underneath go back ' +
        'to physical events your machine measured, which is the one place in the whole ' +
        'stack where anything unguessable enters.',
    ];
    if (rolls.length > 1) {
      const first = rolls[0]!.faces.join('');
      const latest = roll.faces.join('');
      detail.push(
        latest === first
          ? `You have rolled ${rolls.length} times. This roll happens to match the first one — ` +
              'which can happen, and is exactly why one comparison is not a test of anything.'
          : `You have rolled ${rolls.length} times and this roll differs from the first. Press it ` +
              'as often as you like; nothing you see will tell you what comes next.'
      );
    }

    render('dice-real', {
      marker: 'dice-real',
      tone: 'pass',
      glyph: 'die',
      headline: `${DICE_PER_ROLL} DICE, UNGUESSABLE`,
      detail,
    }, [
      diceRow(roll.faces, `Roll ${rolls.length}`),
      el('p', { class: 'aside-note' }, [
        `${roll.bytesUsed} bytes were drawn to make these ${DICE_PER_ROLL} dice, and ` +
          `${roll.discarded} of them ${roll.discarded === 1 ? 'was' : 'were'} thrown away. ` +
          'A byte holds 256 values and 256 does not divide by six, so the leftovers are ' +
          'discarded rather than folded in — folding them in would make low faces very ' +
          'slightly more likely, which nobody would notice and which would still be a ' +
          'loaded die.',
      ]),
    ]);
    settled();
  });

  byId('roll-recipe').addEventListener('click', () => {
    void rollWithRecipe();
  });

  async function rollWithRecipe(): Promise<void> {
    const recipe = state.recipe;

    // A real error in what the reader supplied, which is the one thing on this page
    // that earns the `fail` tone.
    if (recipe.trim() === '') {
      render('dice-recipe', {
        marker: 'dice-recipe',
        tone: 'fail',
        glyph: 'cross',
        headline: 'NOTHING TO START FROM',
        detail: [
          'The box is empty. A generator that follows a recipe needs something to start ' +
            'from, and there is nothing here to be deterministic about. Type anything at ' +
            'all — a word, a date, your name — and press the button again.',
        ],
      });
      settled();
      return;
    }

    const bytes = await seededBytes(recipe, BYTE_BUDGET);
    const roll = rollDice(DICE_PER_ROLL, supplyFrom(bytes));
    state.recipeRolls.push({ recipe, roll });

    render(
      'dice-recipe',
      {
        marker: 'dice-recipe',
        tone: 'pass',
        glyph: 'die',
        headline: `${DICE_PER_ROLL} DICE FROM A RECIPE`,
        detail: [
          `The same five dice, worked out from the word “${recipe}” by a real stream ` +
            'cipher — the one TLS and WireGuard use. Nothing is pretending here: this is ' +
            'respectable machinery, running correctly, and the dice it produced are as ' +
            'even as the ones above.',
          'Press the button again without changing the box.',
        ],
      },
      [
        diceRow(roll.faces, `Recipe “${recipe}”`),
        disclosure('Show the bytes the recipe produced', [
          longValue(toGroupedHex(bytes.subarray(0, 32)), 'The first 32 bytes'),
          el('p', { class: 'bytes-lede' }, [
            'This is the whole of what a generator produces: a stream of bytes. The dice ' +
              'above are the first few of these, turned into faces.',
          ]),
        ]),
      ]
    );

    renderSameAgain();
    settled();
  }

  /**
   * The determinism verdict, which only exists once there are two rolls to compare.
   *
   * COMPUTED, in both directions. Identical rolls are what a correct build does, and
   * a build whose seeded generator had been quietly swapped for the real source would
   * paint `alarm` here with a headline saying so. That is not defensive decoration:
   * it is the mutation the build brief names, and this is the verdict that catches it.
   */
  function renderSameAgain(): void {
    const mine = state.recipeRolls.filter((r) => r.recipe === state.recipe);
    if (mine.length < 2) {
      fill(againOut);
      return;
    }
    const first = mine[0]!.roll.faces;
    const latest = mine[mine.length - 1]!.roll.faces;
    const identical = first.join(',') === latest.join(',');

    render(
      'same-again',
      identical
        ? {
            marker: 'same-again',
            tone: 'pass',
            glyph: 'tick',
            headline: `THE SAME ${DICE_PER_ROLL} DICE, AGAIN`,
            detail: [
              `Rolled ${mine.length} times with the same recipe, and every roll was ` +
                'identical. It will be identical tomorrow, on another machine, for anybody ' +
                'who types the same word.',
              'That is the whole difference, and it is not a flaw in the cipher. A program ' +
                'given the same input takes the same steps. The dice above were never ' +
                'random; they were worked out.',
              'Repeating is not the fault, though, and this is the easiest thing to get ' +
                'wrong here. The random source behind the first roll is a program too, and it ' +
                'would repeat as well if you could put it back in the same state. What ' +
                'separates them is whether anybody else can find the starting point \u2014 ' +
                'and a word you typed is a much shorter list than the one a computer keeps.',
            ],
          }
        : {
            marker: 'same-again',
            tone: 'alarm',
            glyph: 'warn',
            headline: 'THE DICE CHANGED',
            detail: [
              'Two rolls from the same recipe came out differently, which should be ' +
                'impossible: this generator is a function of its recipe and nothing else. ' +
                'Something in this build is not reading the recipe. Do not trust the rest ' +
                'of this page until that is explained.',
            ],
          },
      [
        el('div', { class: 'compare' }, [
          el('div', { class: 'compare-col' }, [diceRow(first, 'First roll')]),
          el('div', { class: 'compare-col' }, [
            diceRow(latest, `Roll ${mine.length}`),
          ]),
        ]),
        el('p', { class: 'claim-note' }, [
          identical
            ? `Compared face by face: ${first.join(' ')} against ${latest.join(' ')}. ` +
                'The page did that comparison for you rather than asking you to do it from ' +
                'memory.'
            : `Compared face by face: ${first.join(' ')} against ${latest.join(' ')}.`,
        ]),
      ]
    );
  }
}
