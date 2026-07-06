// Builders for the client-side roll-reveal animation payloads. Kept framework-free
// (imported by the server) and unit-tested. Attacks/spell-damage build their own
// reveals inline in combat math; these cover EVERY OTHER roll — d20 checks/saves
// and arbitrary dice expressions — so a skill check or a `/roll 2d6+3` gets the
// same tumbling-dice animation combat does, not just attacks.
import type { RollReveal, RevealStep } from './types.js';
import type { DiceResult } from './dice.js';

/**
 * A single-d20 CHECK reveal: the natural die, its modifier chips (ability,
 * proficiency, item bonuses …), and the total the count-up lands on. `outcome`
 * is 'pass'/'fail' when rolled against a DC, or 'none' for a bare check with no
 * target number (the overlay then shows just the total, no stamp).
 */
export function checkReveal(opts: {
  who: string;
  title: string;
  face: number;
  total: number;
  steps: RevealStep[];
  outcome?: RollReveal['outcome'];
  target?: string;
}): RollReveal {
  return {
    kind: 'check',
    attacker: opts.who,
    title: opts.title,
    d20: opts.face,
    // Drop zero-value chips so the count-up shows only meaningful modifiers.
    toHit: opts.steps.filter((s) => s.value !== 0),
    attackTotal: opts.total,
    outcome: opts.outcome ?? 'none',
    ...(opts.target ? { target: opts.target } : {}),
  };
}

const TERM = /([+-]?)(\d*)d(\d+)|([+-]?)(\d+)/gi;

/**
 * Split a rolled expression into its per-term reveal steps: one `damageDice` step
 * per dice term (carrying that term's individual faces so the overlay can draw the
 * right polygons and tumble each die), and one `damageMods` step per flat term.
 * `rolls` is the chosen roll's flat face list (already advantage-resolved), which
 * lines up with the dice terms in order. A NEGATIVE dice term (rare, e.g. `-1d4`)
 * is folded into a single mod step by its signed value — the overlay sums faces
 * positively, so representing it as dice would make the count-up overshoot.
 */
function splitDiceFaces(expr: string, rolls: number[]): {
  dice: RevealStep[];
  mods: RevealStep[];
} {
  const dice: RevealStep[] = [];
  const mods: RevealStep[] = [];
  const cleaned = expr.replace(/\s+/g, '');
  TERM.lastIndex = 0;
  let idx = 0;
  let m: RegExpExecArray | null;
  while ((m = TERM.exec(cleaned))) {
    if (m[3] !== undefined) {
      const sign = m[1] === '-' ? -1 : 1;
      const count = m[2] === '' ? 1 : parseInt(m[2], 10);
      const sides = parseInt(m[3], 10);
      const faces = rolls.slice(idx, idx + count);
      idx += count;
      const sum = faces.reduce((s, f) => s + f, 0);
      if (sign < 0) mods.push({ label: `${count}d${sides}`, value: -sum });
      else dice.push({ label: `${count}d${sides}`, value: sum, faces });
    } else {
      const sign = m[4] === '-' ? -1 : 1;
      mods.push({ label: 'flat', value: sign * parseInt(m[5], 10) });
    }
  }
  return { dice, mods };
}

/**
 * A DICE reveal for an arbitrary rolled expression (`/roll`, the dice-panel
 * buttons): the dice tumble and land one by one and the total counts up. `title`
 * defaults to the expression; pass a label (e.g. "Initiative") to headline it.
 */
export function diceReveal(who: string, result: DiceResult, title?: string): RollReveal {
  const { dice, mods } = splitDiceFaces(result.expr, result.rolls);
  return {
    kind: 'dice',
    attacker: who,
    title: title?.trim() || result.expr,
    outcome: 'none',
    ...(dice.length ? { damageDice: dice } : {}),
    ...(mods.length ? { damageMods: mods } : {}),
    damage: result.total,
  };
}
