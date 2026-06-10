// Dice expression roller, framework-free so the server can roll authoritatively
// and the client can reuse the parser/types. Supports e.g. "2d6+3", "d20",
// "1d8+2d4+1", and d20 advantage/disadvantage.

export type Advantage = 'adv' | 'dis';

export type DiceResult = {
  expr: string;
  total: number;
  /** Every individual die face rolled (for display). */
  rolls: number[];
  /** Human-readable breakdown, e.g. "d20[15] +3 = 18". */
  detail: string;
};

const TERM = /([+-]?)(\d*)d(\d+)|([+-]?)(\d+)/gi;

// Per-term limits (count/sides) cap each term; these cap the whole expression so
// a pathological "1d6+1d6+…" can't burn CPU / flood the roll log.
const MAX_TERMS = 100;
const MAX_TOTAL_DICE = 1000;

const d = (sides: number) => 1 + Math.floor(Math.random() * sides);

type Once = { total: number; rolls: number[]; detail: string };

function rollOnce(expr: string): Once | null {
  const cleaned = expr.replace(/\s+/g, '');
  if (!cleaned) return null;
  TERM.lastIndex = 0;
  let total = 0;
  let consumed = 0;
  const rolls: number[] = [];
  const parts: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = TERM.exec(cleaned))) {
    if (m.index !== consumed) return null; // gap = invalid char
    consumed += m[0].length;
    if (parts.length >= MAX_TERMS) return null;
    if (m[3] !== undefined) {
      const sign = m[1] === '-' ? -1 : 1;
      const count = m[2] === '' ? 1 : parseInt(m[2], 10);
      const sides = parseInt(m[3], 10);
      if (count < 1 || count > 100 || sides < 1 || sides > 1000) return null;
      if (rolls.length + count > MAX_TOTAL_DICE) return null;
      const these: number[] = [];
      for (let i = 0; i < count; i++) {
        const r = d(sides);
        these.push(r);
        rolls.push(r);
        total += sign * r;
      }
      parts.push(`${sign < 0 ? '-' : parts.length ? '+' : ''}${count}d${sides}[${these.join(',')}]`);
    } else {
      const sign = m[4] === '-' ? -1 : 1;
      const v = parseInt(m[5], 10);
      total += sign * v;
      parts.push(`${sign < 0 ? '-' : parts.length ? '+' : ''}${v}`);
    }
  }
  if (consumed !== cleaned.length || parts.length === 0) return null;
  return { total, rolls, detail: parts.join(' ') };
}

/** Parse a chat "/roll 2d6+3 [adv|dis]" (or "/r …") command. Returns null when
 *  the text isn't a roll command at all; the expression itself may still fail
 *  `rollDice` validation (callers surface that as an invalid-dice notice). */
export function parseRollCommand(
  text: string,
): { expr: string; advantage?: Advantage } | null {
  const m = text.trim().match(/^\/r(?:oll)?\s+(.+)$/i);
  if (!m) return null;
  const parts = m[1].trim().match(/^(.*?)(?:\s+(adv|dis))?$/i)!;
  const advantage = parts[2]?.toLowerCase() as Advantage | undefined;
  return { expr: (parts[1] ?? '').trim(), advantage };
}

/** Roll a dice expression. With advantage/disadvantage the whole expression is
 *  rolled twice and the higher/lower total is kept. Returns null if invalid. */
export function rollDice(expr: string, advantage?: Advantage): DiceResult | null {
  const a = rollOnce(expr);
  if (!a) return null;
  if (advantage) {
    const b = rollOnce(expr)!;
    const pick =
      advantage === 'adv' ? (a.total >= b.total ? a : b) : (a.total <= b.total ? a : b);
    return {
      expr,
      total: pick.total,
      rolls: pick.rolls,
      detail: `${a.detail} (=${a.total}) / ${b.detail} (=${b.total}) → ${
        advantage === 'adv' ? 'adv' : 'dis'
      } ${pick.total}`,
    };
  }
  return { expr, total: a.total, rolls: a.rolls, detail: `${a.detail} = ${a.total}` };
}
