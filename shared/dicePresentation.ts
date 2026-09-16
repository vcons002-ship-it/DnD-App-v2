import type { RollComparison, RollReveal } from './types.js';

/** Read the server's existing roll-detail format without rolling any dice.
 * Unknown/malformed historical formats fall back to the original single result.
 * This keeps the visual upgrade compatible with existing servers and saves. */
export function withRollComparison(reveal: RollReveal, detail: string): RollReveal {
  if (reveal.kind === 'dice') {
    const match = /^(.+?) \(=(-?\d+)\) \/ (.+?) \(=(-?\d+)\) → (adv|dis) (-?\d+)$/.exec(detail.trim());
    if (!match) return reveal;
    const a = readRecordedSet(match[1]);
    const b = readRecordedSet(match[3]);
    if (!a || !b || a.signature !== b.signature || a.total !== Number(match[2]) || b.total !== Number(match[4])) return reveal;
    const mode = match[5] as 'adv' | 'dis';
    const kept = chosenSet(a.total, b.total, mode);
    const sets: RollComparison['sets'] = [{ total: a.total, dice: a.dice }, { total: b.total, dice: b.dice }];
    if (sets[kept].total !== Number(match[6]) || sets[kept].total !== reveal.damage) return reveal;
    // Ensure this detail belongs to the displayed reveal, not merely a matching total.
    const positiveFaces = sets[kept].dice.filter((d) => !d.negative).map((d) => d.value);
    const revealFaces = (reveal.damageDice ?? []).flatMap((step) => step.faces ?? [step.value]);
    if (JSON.stringify(positiveFaces) !== JSON.stringify(revealFaces)) return reveal;
    return { ...reveal, comparison: { mode, kind: 'dice', kept, sets } };
  }
  if (reveal.kind === 'damage' || reveal.d20 === undefined) return reveal;
  const match = /\bd20\[(\d+),(\d+)\]→(adv|dis) (\d+)(?=\s|$)/.exec(detail);
  if (!match) return reveal;
  const a = Number(match[1]), b = Number(match[2]);
  if (![a, b].every((n) => Number.isInteger(n) && n >= 1 && n <= 20)) return reveal;
  const mode = match[3] as 'adv' | 'dis';
  const kept = chosenSet(a, b, mode);
  if ([a, b][kept] !== Number(match[4]) || [a, b][kept] !== reveal.d20) return reveal;
  return {
    ...reveal,
    comparison: {
      kind: 'd20', mode, kept,
      sets: [{ total: a, dice: [{ sides: 20, value: a }] }, { total: b, dice: [{ sides: 20, value: b }] }],
    },
  };
}

/** Match the server's existing tie rule: first candidate wins. */
const chosenSet = (a: number, b: number, mode: 'adv' | 'dis'): 0 | 1 =>
  (mode === 'adv' ? a >= b : a <= b) ? 0 : 1;

function readRecordedSet(detail: string): {
  total: number;
  dice: RollComparison['sets'][0]['dice'];
  signature: string;
} | undefined {
  const text = detail.replace(/\s+/g, '');
  const term = /([+-]?)(\d+)d(\d+)\[([\d,]+)\]|([+-]?)(\d+)/g;
  const dice: RollComparison['sets'][0]['dice'] = [];
  const signature: string[] = [];
  let total = 0, consumed = 0, terms = 0;
  let match: RegExpExecArray | null;
  while ((match = term.exec(text))) {
    if (match.index !== consumed || ++terms > 100) return;
    consumed += match[0].length;
    if (match[3]) {
      const count = Number(match[2]), sides = Number(match[3]);
      const values = match[4].split(',').map(Number);
      if (count < 1 || count > 100 || sides < 1 || sides > 1000 || values.length !== count || dice.length + count > 1000 ||
        values.some((value) => !Number.isInteger(value) || value < 1 || value > sides)) return;
      const negative = match[1] === '-';
      dice.push(...values.map((value) => ({ sides, value, ...(negative ? { negative: true } : {}) })));
      total += values.reduce((sum, n) => sum + n, 0) * (negative ? -1 : 1);
      signature.push(`${negative ? '-' : '+'}${count}d${sides}`);
    } else {
      const value = Number(match[6]) * (match[5] === '-' ? -1 : 1);
      if (!Number.isSafeInteger(value)) return;
      total += value;
      signature.push(`${value < 0 ? '' : '+'}${value}`);
    }
  }
  if (consumed !== text.length || !terms || !Number.isSafeInteger(total)) return;
  return { total, dice, signature: signature.join('') };
}
