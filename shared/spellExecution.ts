import { markSpell, hitFeature } from './hitFeatures.js';
import type { AbilityRoll, SheetAbility } from './types.js';
import { cantripExtraSteps } from './spellMath.js';
import { isDamageType } from './damage.js';
import { revisedSpellAbility2024 } from './spellRevisions.js';
import { linkedSpellProfile, linkedSpellRoll } from './linkedSpells.js';

/** Small, reviewed execution profiles, not a replacement spell catalogue.
 * Source: 2024 Basic Rules spell descriptions, checked 2026-09-16:
 * https://www.dndbeyond.com/sources/dnd/br-2024/spell-descriptions
 * These fill missing workflow metadata at runtime. Saved sheets are never
 * rewritten; authored roll fields win and explicitly custom entries opt out.
 * Haste and Hold Person have dedicated timed effects; other effects and
 * repeated-condition mechanics are automated only where explicitly supported. */
type Profile = {
  level: number;
  save: string;
  saveDamage: 'none' | 'half';
  targetMode: 'single' | 'multiple';
  /** Only these reviewed, damage-free spells may gain a missing save roll. */
  addSave?: boolean;
  extraTargetsOnUpcast?: boolean;
};

const PROFILES: Record<string, Profile> = {
  'hold person': { level: 2, save: 'WIS', saveDamage: 'none', targetMode: 'single', addSave: true, extraTargetsOnUpcast: true },
  'hypnotic pattern': { level: 3, save: 'WIS', saveDamage: 'none', targetMode: 'multiple', addSave: true },
  command: { level: 1, save: 'WIS', saveDamage: 'none', targetMode: 'single', addSave: true, extraTargetsOnUpcast: true },
  'acid splash': { level: 0, save: 'DEX', saveDamage: 'none', targetMode: 'multiple' },
  'sacred flame': { level: 0, save: 'DEX', saveDamage: 'none', targetMode: 'single' },
  'vicious mockery': { level: 0, save: 'WIS', saveDamage: 'none', targetMode: 'single' },
  disintegrate: { level: 6, save: 'DEX', saveDamage: 'none', targetMode: 'single' },
  'burning hands': { level: 1, save: 'DEX', saveDamage: 'half', targetMode: 'multiple' },
  'dissonant whispers': { level: 1, save: 'WIS', saveDamage: 'half', targetMode: 'single' },
  'hail of thorns': { level: 1, save: 'DEX', saveDamage: 'half', targetMode: 'multiple' },
  'hellish rebuke': { level: 1, save: 'DEX', saveDamage: 'half', targetMode: 'single' },
  thunderwave: { level: 1, save: 'CON', saveDamage: 'half', targetMode: 'multiple' },
  shatter: { level: 2, save: 'CON', saveDamage: 'half', targetMode: 'multiple' },
  fireball: { level: 3, save: 'DEX', saveDamage: 'half', targetMode: 'multiple' },
  'lightning bolt': { level: 3, save: 'DEX', saveDamage: 'half', targetMode: 'multiple' },
};

export function effectiveSheetAbility(ability: SheetAbility, castLevel?: number): SheetAbility {
  if (ability.source === 'custom' || ability.executionProfile === 'manual') return ability;
  ability = revisedSpellAbility2024(ability);
  const linked = linkedSpellProfile(ability);
  if (linked) {
    const roll=linkedSpellRoll(ability);
    return {...ability, ...(ability.name.toLowerCase()==='spiritual weapon'?{summon:undefined}:{}),
      roll:roll&&{...roll,...(ability.name.toLowerCase()==='hold monster'&&(castLevel??5)>5?{targetMode:'multiple' as const}:{})},
      tags:[...(ability.tags??[]).filter(t=>t!=='concentration'),...(linked.concentration?['concentration']:[])]};
  }
  if (hitFeature(ability)) return {...ability,roll:undefined,stance:undefined};
  if (markSpell(ability)) return {...ability,type:'spell',level:1,roll:{kind:'damage',dice:'0',baseLevel:1,targetMode:'single'}};
  const name = ability.name.trim().toLowerCase();
  if (isHasteSpell(ability) && isCanonicalHasteProfile(ability)) return {...ability, level:3, tags:[...(ability.tags??[]),'concentration'], roll:{kind:'damage',dice:'0',baseLevel:3,targetMode:'single',...(ability.roll?.castingAbility?{castingAbility:ability.roll.castingAbility}:{})}};
  if (ability.type==='spell' && name==='mage hand' && !ability.summon) return {...ability,level:0,summon:{name:'Mage Hand',icon:'\u270b'}};
  const savedRoll = ability.roll;
  if (ability.type === 'ability' && name === 'second wind' && savedRoll?.kind === 'heal' &&
      savedRoll.dice?.replace(/\s/g, '').toLowerCase() === '1d10') {
    return { ...ability, roll: { healingBonus: 'fighterLevel', healTarget: 'self', ...savedRoll } };
  }
  if (ability.type !== 'spell') return ability;
  if (savedRoll?.kind === 'attack' && !savedRoll.damageType && (
    (name === 'chromatic orb' && ability.level === 1) ||
    (name === 'sorcerous burst' && ability.level === 0)
  )) {
    const choices = name === 'chromatic orb'
      ? ['acid', 'cold', 'fire', 'lightning', 'poison', 'thunder']
      : ['acid', 'cold', 'fire', 'lightning', 'poison', 'psychic', 'thunder'];
    return { ...ability, roll: { damageTypeChoices: choices, ...savedRoll } };
  }
  // Only the unchanged catalogue shapes receive count corrections. An authored
  // alternative formula stays authored; explicit counts/bonuses win below.
  if (savedRoll?.kind === 'attack' && name === 'scorching ray' && ability.level === 2 &&
      savedRoll.dice?.replace(/\s/g, '').toLowerCase() === '2d6' && !savedRoll.scaleDice) {
    return { ...ability, roll: { instances: 3, scaleInstances: 1, ...savedRoll } };
  }
  if (savedRoll?.kind === 'attack' && name === 'eldritch blast' && ability.level === 0 &&
      savedRoll.dice?.replace(/\s/g, '').toLowerCase() === '1d10' &&
      (!savedRoll.scaleDice || savedRoll.scaleDice.replace(/\s/g, '').toLowerCase() === '1d10')) {
    const { scaleDice: _legacyPerBeamScaling, ...perBeam } = savedRoll;
    return { ...ability, roll: { instances: 1, scaleInstances: 1, instanceScaling: 'cantrip', ...perBeam } };
  }
  const fixedHealing: Record<string, { level: number; dice: string }> = {
    heal: { level: 6, dice: '70' }, regenerate: { level: 7, dice: '4d8+15' },
    'prayer of healing': { level: 2, dice: '2d8' },
  };
  const heal = fixedHealing[name];
  if (heal && ability.level === heal.level && savedRoll?.kind === 'heal' &&
      savedRoll.dice?.replace(/\s/g, '').toLowerCase() === heal.dice) {
    return { ...ability, roll: { healingBonus: 'none', ...savedRoll } };
  }
  const profile = PROFILES[name];
  if (!profile || (ability.level ?? ability.roll?.baseLevel) !== profile.level) return ability;
  const roll = ability.roll;
  // A changed roll kind/save is an authored variant, not the canonical spell.
  if (roll && (roll.kind !== 'save' || (roll.save && roll.save.toUpperCase() !== profile.save))) return ability;
  if (!roll && !profile.addSave) return ability;
  const targetMode = profile.extraTargetsOnUpcast && (castLevel ?? profile.level) > profile.level
    ? 'multiple' : profile.targetMode;
  return {
    ...ability,
    roll: {
      kind: 'save', save: profile.save, baseLevel: profile.level,
      saveDamage: profile.saveDamage, targetMode,
      ...roll,
    },
  };
}

export function spellDamageTypeChoices(ability: SheetAbility, castLevel?: number): string[] {
  const roll = effectiveSheetAbility(ability, castLevel).roll;
  if (roll?.damageType?.trim()) return [];
  return (roll?.damageTypeChoices ?? []).filter((type) => typeof type === 'string' && isDamageType(type))
    .map((type) => type.trim().toLowerCase());
}

/** Unknown/legacy save and damage rolls retain the existing roll-then-apply
 * workflow. A reviewed or explicitly authored single-target save may cast at
 * the selected target. This classification does not impose target count caps. */
export function isMultiTargetSpell(ability: SheetAbility, castLevel?: number): boolean {
  const roll = effectiveSheetAbility(ability, castLevel).roll;
  if (roll?.kind === 'attack' && roll.instances) return true;
  if (roll?.kind === 'heal') return roll.targetMode === 'multiple';
  if (!roll || (roll.kind !== 'save' && roll.kind !== 'damage')) return false;
  if (ability.type !== 'spell') return !!roll.instances || roll.targetMode === 'multiple';
  return !!roll.instances || roll.targetMode !== 'single';
}

/** Number of separate darts/rays. Counts are server-owned after casting. */
export function spellInstanceCount(roll: AbilityRoll, castLevel?: number, casterLevel = 1): number {
  if (!Number.isFinite(roll.instances) || !roll.instances || roll.instances < 1) return 0;
  const steps = roll.instanceScaling === 'cantrip' ? cantripExtraSteps(casterLevel)
    : Math.max(0, (castLevel ?? roll.baseLevel ?? 1) - (roll.baseLevel ?? 1));
  return Math.min(100, Math.max(1, Math.floor(roll.instances + (roll.scaleInstances ?? 0) * steps)));
}

export function spellcastingKeyFor(
  caster: { className?: string; subclass?: string },
  ability: SheetAbility,
): AbilityRoll['castingAbility'] {
  if (['INT', 'WIS', 'CHA'].includes(ability.roll?.castingAbility ?? '')) return ability.roll!.castingAbility;
  const className = (ability.sourceClass ?? caster.className ?? '').trim().toLowerCase();
  const singleClass: Record<string, NonNullable<AbilityRoll['castingAbility']>> = {
    wizard: 'INT', artificer: 'INT', cleric: 'WIS', druid: 'WIS', ranger: 'WIS',
    bard: 'CHA', sorcerer: 'CHA', warlock: 'CHA', paladin: 'CHA',
  };
  if (singleClass[className]) return singleClass[className];
  if ((className === 'fighter' || className === 'rogue') && (ability.sourceClass ||
      /^(eldritch knight|arcane trickster)$/i.test((caster.subclass ?? '').trim()))) return 'INT';
  // Unknown/multiclass entries retain the legacy best-stat fallback. The roll
  // editor can explicitly choose the ability without changing the character.
  return undefined;
}

/** Critical hits double dice, never a spell's flat bonus. */
export function criticalDiceExpression(expression: string): string {
  return (expression.replace(/\s+/g, '').match(/[+-]?(?:\d*)d\d+/gi) ?? []).join('');
}

/** Recognize existing saved Haste entries without rewriting campaign sheets. */
export const isHasteSpell = (a: SheetAbility): boolean => a.type === 'spell' && a.name.trim().toLowerCase() === 'haste';

/** Only fill the unchanged no-damage buff profile; edited Haste mechanics win. */
export function isCanonicalHasteProfile(a: SheetAbility): boolean {
  if (!isHasteSpell(a) || a.source === 'custom' || a.executionProfile === 'manual' || a.level !== 3) return false;
  const roll = a.roll;
  if (!roll) return true;
  if (roll.kind !== 'damage' || roll.dice?.replace(/\s/g, '') !== '0' ||
      (roll.baseLevel !== undefined && roll.baseLevel !== 3) ||
      (roll.targetMode !== undefined && roll.targetMode !== 'single')) return false;
  return Object.keys(roll).every(key => roll[key as keyof AbilityRoll] === undefined ||
    ['kind', 'dice', 'baseLevel', 'targetMode', 'castingAbility'].includes(key));
}
