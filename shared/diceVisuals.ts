import type { RevealStep } from './types.js';

/** Die types come from the recorded expression, never the rolled face value.
 * The label fallback supports historical saves before expressions were stored. */
function sizes(expression: string): number[] {
  const result: number[] = [];
  for (const match of expression.matchAll(/(\d*)d(\d+)/gi)) {
    const count = Math.min(1000, Number(match[1] || 1));
    const sides = Number(match[2]);
    for (let i=0; i<count; i++) result.push(sides);
  }
  return result;
}
export function flattenDamageDice(steps: RevealStep[] | undefined): {value:number;sides:number;crit:boolean}[] {
  if (!steps) return [];
  const base = sizes(steps[0]?.diceExpression ?? steps[0]?.label ?? '');
  return steps.flatMap(step => {
    const explicit = sizes(step.diceExpression ?? step.label);
    const dice = explicit.length ? explicit : step.label === 'CRIT' ? base : [];
    const crit = step.critical ?? /\bCRIT\b/i.test(step.label);
    return (step.faces ?? [step.value]).map((value,i) => ({
      value, sides: dice[i] ?? dice[0] ?? 6, crit,
    }));
  });
}
