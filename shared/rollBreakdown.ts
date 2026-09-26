import type { RevealStep, RollEntry } from './types.js';

function modifierLabel(label: string): string {
  switch (label) {
    case '': return 'Modifier';
    case 'flat': return 'Flat';
    case 'bonus': return 'Bonus / adjustment';
    case 'resisted': return 'Resistance';
    case 'vuln': return 'Vulnerability';
    default: return label;
  }
}

/** Group normal and critical dice by their original source, retaining all faces. */
function diceTerms(steps: RevealStep[]): string[] {
  const groups: {source:string;sides:number;faces:number[];value:number;plain?:RevealStep}[]=[];
  const first=steps[0];
  for(const step of steps) {
    const label=(step.label==='CRIT'?first?.label??'Dice':step.label).replace(/\bCRIT\b/gi,'').replace(/\s+\)/g,')').trim();
    const expr=step.diceExpression ?? (step.label==='CRIT'?first?.diceExpression:undefined);
    const term=expr ? /^(\d*)d(\d+)$/.exec(expr) : /^(\d*)d(\d+)(?=\s|$)/.exec(label);
    if(!term||!step.faces?.length||step.faces.reduce((n,v)=>n+v,0)!==step.value) {
      groups.push({source:label,sides:0,faces:[],value:step.value,plain:step}); continue;
    }
    const source=label.replace(/^\d*d\d+\s*/, '').trim();
    const sides=Number(term[2]);
    const group=groups.find(g=>!g.plain&&g.source===source&&g.sides===sides);
    if(group) {group.faces.push(...step.faces);group.value+=step.value;}
    else groups.push({source,sides,faces:[...step.faces],value:step.value});
  }
  return groups.map(g=>g.plain
    ? `${g.value} (${g.source}${g.plain.faces?.length?`; rolls ${g.plain.faces.join(', ')}`:''})`
    : `${g.faces.length}d${g.sides}${g.source?` ${g.source}`:''} [${g.faces.join(' + ')}]`);
}

/** A visible, read-only account of damage already resolved by the server.
 * Pass the role-shaped entry, never a private/unfiltered server record. */
export function damageRollBreakdown(entry: RollEntry): string | null {
  const reveal = entry.reveal;
  // Pending hits carry precomputed private dice. Do not read or disclose them.
  // Plain /roll and heal/check reveals reuse damage fields but aren't damage.
  if ((entry.pending && !entry.pending.done) || !reveal ||
      (reveal.kind && reveal.kind !== 'attack' && reveal.kind !== 'damage') ||
      typeof reveal.damage !== 'number' || !Number.isFinite(reveal.damage)) return null;
  const dice = reveal.damageBreakdown?.dice ?? reveal.damageDice ?? [];
  const mods = reveal.damageBreakdown?.mods ?? reveal.damageMods ?? [];
  if (!dice.length && !mods.length) return null;
  const parts = diceTerms(dice);
  for (const step of mods) {
    const term=`${Math.abs(step.value)} ${modifierLabel(step.label)}${step.faces?.length?` [${step.faces.join(' + ')}]`:''}`;
    parts.push(`${step.value<0?'− ':parts.length?'+ ':''}${term}`);
  }
  const itemized = [...dice, ...mods].reduce((total, step) => total + step.value, 0);
  // Preserve the final recorded damage even if a legacy record omitted a
  // clamp/adjustment. No invented die faces or guessed resistance/bonus label.
  if (itemized !== reveal.damage) parts.push(`${reveal.damage-itemized<0?'−':'+'} ${Math.abs(reveal.damage-itemized)} Unitemized`);
  const type = !reveal.damageBreakdown?.mixedTypes && reveal.damageType ? ` ${reveal.damageType}` : '';
  return `Damage: ${parts.map((part,i)=>i>0&&!/^[+−]/.test(part)?`+ ${part}`:part).join(' ')} = ${reveal.damage}${type}`;
}
