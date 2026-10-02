import type { SheetAbility } from './types.js';
import { abilityKey, hitFeature, markSpell } from './hitFeatures.js';
import { effectiveSheetAbility, isCanonicalHasteProfile } from './spellExecution.js';
import { matchesRevisedSpell2024, spellRevision2024For } from './spellRevisions.js';

export type SpellCombatSupport = {
  status: 'ready' | 'partial' | 'manual';
  label: string;
  automated: string[];
  manual: string[];
  /** Record a cast, but never run an incomplete catalogue damage/heal roll. */
  manualCastOnly: boolean;
};
type SpellInput = Pick<SheetAbility, 'name' | 'type'> & Partial<SheetAbility>;

/** This is a runtime capability audit, not a claim that every printed rule is
 * enforced. No saved sheet is migrated. A custom/authored roll keeps its own
 * behavior and is labelled unreviewed. Review against the 2024 Free Rules:
 * https://www.dndbeyond.com/sources/dnd/br-2024/spell-descriptions */
const MANUAL_ROLLS: Record<string, string> = {
  'false life': 'Temporary HP are not healing; set temporary HP manually using the spell rules.',
  aid: 'Increase maximum and current HP for up to three targets manually; this is not ordinary healing.',
  'armor of agathys': 'Set temporary HP and resolve the conditional retaliation manually.',
  'true strike': 'Resolve the weapon attack with the casting ability and its additional damage manually.',
  'poison spray': 'The saved catalogue uses a save; the 2024 spell requires a ranged spell attack.',
  'inflict wounds': 'The saved catalogue uses a spell attack; the 2024 spell requires a Constitution save and different damage.',
  'sorcerous burst': 'Choose a permitted damage type and resolve bonus dice on maximum faces manually; the catalogue roll is incomplete.',
  'witch bolt': 'Resolve the 2024 initial damage and repeat-use damage manually; the catalogue uses an older formula.',
  'ray of enfeeblement': 'Resolve the 2024 saving throw and weakening effect manually; the catalogue uses an older attack.',
  contagion: 'Resolve the 2024 saving throws and disease effects manually; the catalogue uses an older attack.',
  'ice knife': 'Resolve the attack and the separate nearby-creature explosion save/damage manually.',
  'ice storm': 'The corrected description lists both damage pools; roll and apply Bludgeoning and Cold separately with their own resistances.',
  'flame strike': 'The corrected description lists both damage pools; roll and apply Fire and Radiant separately with their own resistances.',
  'meteor swarm': 'Roll and apply Fire and Bludgeoning separately and avoid counting overlapping areas twice.',
  'prismatic spray': 'Resolve the randomly selected ray and its individual effect manually.',
  'prismatic wall': 'Resolve each layer and its distinct damage, save, or condition manually.',
  'storm of vengeance': 'Resolve the round-specific damage types and effects manually.',
  'mass cure wounds': 'Resolve the 2024 healing pool and all chosen targets manually; the catalogue formula is older.',
  'mass heal': 'Allocate the fixed healing pool among targets manually; this is not a single-target heal with a casting bonus.',
  'prayer of healing': 'Resolve the Short Rest and healing for all chosen targets manually; a single-target healing roll does not complete this spell.',
  'conjure animals': 'The summon button represents older rules; resolve the 2024 spirit-area effect manually.',
  'conjure woodland beings': 'The summon button represents older rules; resolve the 2024 spirit-area effect manually.',
  'elemental weapon': 'Apply the weapon attack bonus and extra damage to its attacks manually, rather than casting a damage roll.',
  'bestow curse': 'Choose the curse, resolve its save, and apply its ongoing effect manually, rather than casting its optional damage rider.',
  'branding smite': 'This older smite entry has no supported post-hit workflow; resolve its attack rider manually.',
  'fire shield': 'Apply its resistance and conditional retaliation manually, rather than casting a damage roll.',
  geas: 'Apply the control effect and conditional damage manually, rather than dealing damage when cast.',
  'circle of death': 'Resolve the 2024 damage dice and scaling manually; the catalogue uses older d6s instead of d8s.',
  weird: 'Resolve the 2024 initial damage, fear, and recurring damage manually; the catalogue uses an older formula.',
  'wind wall': 'Resolve the 2024 initial damage and wall effects manually; the catalogue damage is incomplete.',
  'blade barrier': 'Resolve Force damage and repeated area entry/exposure manually; the catalogue uses the older damage type.',
  dream: 'Resolve the dream interaction and conditional nightmare damage manually; damage is not dealt immediately on casting.',
  earthquake: 'Resolve the terrain, fissures, and conditional falling-structure damage manually; damage is not dealt to every target on casting.',
  'mordenkainen\'s sword': 'Resolve the 2024 attack damage with its casting modifier and repeat-use actions manually; the catalogue uses an older formula.',
  'flame blade': 'Resolve the weapon-like attack, casting-modifier damage, and upcast scaling manually; the catalogue roll is incomplete.',
  'spiritual weapon': 'Resolve the floating weapon, casting-modifier damage, upcast scaling, concentration, and repeat attacks manually; the catalogue placeholder/roll is incomplete.',
  'glyph of warding': 'Place the glyph and choose its trigger and effect manually; its damage is not dealt immediately when the glyph is created.',
  feeblemind: 'This older spell entry combines immediate damage and the mental-effect save incorrectly; resolve the chosen rules version manually.',
  'hunger of hadar': 'Resolve the automatic Cold damage and conditional Acid damage separately on their turn triggers; the catalogue omits Cold and incorrectly defaults to half Acid damage on a successful save.',
};

// Recognize the shipped incomplete formula, not every homebrew spell with the
// same name. Saved edits to these roll fields retain their authored behavior.
// Tuple: level, kind, dice, scaleDice, damageType, save.
const UNSAFE_SHAPES: Record<string, [number, string, string, string?, string?, string?]> = {
  'poison spray': [0, 'save', '1d12', '1d12', 'poison', 'CON'],
  'sorcerous burst': [0, 'attack', '1d8', '1d8', 'force'],
  'true strike': [0, 'attack', '1d6', '1d6', 'radiant'],
  'armor of agathys': [1, 'damage', '5', '5', 'cold'],
  'false life': [1, 'heal', '1d4+4', '', 'healing'],
  'ice knife': [1, 'attack', '1d10', '', 'piercing'],
  'inflict wounds': [1, 'attack', '3d10', '1d10', 'necrotic'],
  'witch bolt': [1, 'attack', '1d12', '1d12', 'lightning'],
  aid: [2, 'heal', '5', '5', 'healing'],
  'branding smite': [2, 'damage', '2d6', '1d6', 'radiant'],
  'prayer of healing': [2, 'heal', '2d8', '1d8', 'healing'],
  'ray of enfeeblement': [2, 'attack', '0', '', 'necrotic'],
  'bestow curse': [3, 'damage', '1d8', '', 'necrotic'],
  'elemental weapon': [3, 'damage', '1d4'],
  'fire shield': [4, 'damage', '2d8', '', 'fire'],
  'ice storm': [4, 'save', '2d8', '1d8', 'bludgeoning', 'DEX'],
  contagion: [5, 'attack', '0', '', 'poison'],
  'flame strike': [5, 'save', '4d6', '1d6', 'fire', 'DEX'],
  geas: [5, 'damage', '5d10', '', 'psychic'],
  'mass cure wounds': [5, 'heal', '3d8', '1d8', 'healing'],
  'prismatic spray': [7, 'save', '10d6', '', '', 'DEX'],
  'mass heal': [9, 'heal', '700', '', 'healing'],
  'meteor swarm': [9, 'save', '40d6', '', 'fire', 'DEX'],
  'prismatic wall': [9, 'save', '10d6', '', '', 'DEX'],
  'storm of vengeance': [9, 'save', '2d6', '', 'thunder', 'CON'],
  'circle of death': [6, 'save', '8d6', '2d6', 'necrotic', 'CON'],
  weird: [9, 'save', '4d10', '', 'psychic', 'WIS'],
  'wind wall': [3, 'save', '3d8', '', 'bludgeoning', 'STR'],
  'blade barrier': [6, 'save', '6d10', '', 'slashing', 'DEX'],
  dream: [5, 'save', '3d6', '', 'psychic', 'WIS'],
  earthquake: [8, 'save', '5d6', '', 'bludgeoning', 'DEX'],
  'mordenkainen\'s sword': [7, 'attack', '3d10', '', 'force'],
  'flame blade': [2, 'attack', '3d6', '', 'fire'],
  'spiritual weapon': [2, 'attack', '1d8', '', 'force'],
  'glyph of warding': [3, 'save', '5d8', '1d8', '', 'DEX'],
  feeblemind: [8, 'save', '4d6', '', 'psychic', 'INT'],
  'hunger of hadar': [3, 'save', '2d6', '', 'acid', 'DEX'],
};

function isEditedUnsafeRoll(ability: SheetAbility, key: string): boolean {
  const shape = UNSAFE_SHAPES[key];
  const roll = ability.roll;
  if (!shape || !roll) return false;
  return ability.level !== shape[0] || roll.kind !== shape[1] || formula(roll.dice) !== shape[2] ||
    formula(roll.scaleDice) !== (shape[3] ?? '') || (roll.damageType ?? '').trim().toLowerCase() !== (shape[4] ?? '') ||
    (roll.save ?? '').trim().toUpperCase() !== (shape[5] ?? '');
}

const DETAILS: Record<string, string[]> = {
  'hypnotic pattern': ['Apply Charmed/Incapacitated and remove them when the spell ends or its wake-up conditions occur.'],
  command: ['Choose a command and resolve its behavior on the next turn after a failed save.'],
  'chill touch': ['Prevent healing for the stated duration; the app does not enforce that rider or its range.'],
  'ray of frost': ['Apply and expire the speed reduction.'],
  'shocking grasp': ['Apply the reaction restriction until the next turn.'],
  'guiding bolt': ['Apply and consume advantage on the next attack against the target.'],
  'ray of sickness': ['Apply and expire the poison effect using the chosen rules version.'],
  'vicious mockery': ['Apply and consume the next-attack disadvantage.'],
  'thunderwave': ['Move failed-save targets away and resolve loose objects.'],
  'dissonant whispers': ['Resolve the target reaction and movement.'],
  'disintegrate': ['Resolve the destruction effect if the damage reduces the target to 0 HP.'],
  'finger of death': ['Resolve any undead-creation effect after a kill.'],
  'mass healing word': ['Choose eligible creatures within range; the app enforces six distinct recipients, not range or line of sight.'],
  'mass cure wounds': ['Choose up to six eligible creatures inside the spell area; area placement and range remain DM adjudication.'],
  'witch bolt': ['Resolve later Bonus Action damage, the link, range, and Total Cover manually; Cast starts a new spell and may spend another slot.'],
  'sorcerous burst': ['Resolve extra dice from maximum faces manually, including the casting-modifier bonus-die limit.'],
  'wind wall': ['Place the wall and adjudicate gases, flying creatures, and projectile blocking manually.'],
  weird: ['Apply Frightened and resolve later saves, recurring damage, and effect cleanup manually.'],
  'ray of enfeeblement': ['Apply the success/failure weakening effects and their repeat saves manually.'],
  contagion: ['Apply Poisoned, the chosen save disadvantage, repeat saves, and the lasting disease effect manually.'],
  'spiritual weapon': ['Place and move the weapon, and resolve later Bonus Action attacks without recasting or spending another slot.'],
  blight: ['Resolve automatic save failure for plant creatures and the noncreature-plant effect manually.'],
  harm: ['On a failed save, reduce maximum HP by the damage taken, to a minimum maximum of 1; the app only applies ordinary damage.'],
  'vampiric touch': ['Heal the caster for half the Necrotic damage actually taken by the target.'],
  'phantasmal killer': ['Apply ability-check and attack disadvantage, repeat end-of-turn saves/damage, and end the spell on a successful save.'],
  'melf\'s acid arrow': ['Apply half initial damage on a miss and the later Acid damage; the app handles only ordinary hit damage.'],
  'spirit guardians': ['Choose the eligible damage type, halve affected creature speeds, and handle area/turn triggers and once-per-turn eligibility.'],
  sunbeam: ['Apply and expire blindness and resolve later beams without casting the spell again.'],
  sunburst: ['Apply blindness and resolve its later saves/duration.'],
  regenerate: ['Track recurring healing, duration, and regrowth after the initial heal.'],
  heal: ['Remove the conditions the spell cures after applying healing.'],
  'hunter\'s mark': ['Track the non-damage benefits and eligible target/range rules.'],
  hex: ['Choose the affected ability when marking the target and check eligibility/duration with the DM.'],
};
const REPEATED = new Set(['flaming sphere', 'moonbeam', 'call lightning', 'spirit guardians', 'cloudkill',
  'wall of fire', 'insect plague', 'blade barrier', 'sunbeam', 'wall of ice', 'wall of thorns',
  'incendiary cloud', 'cloud of daggers', 'heat metal', 'spike growth', 'flame blade',
  'vampiric touch', 'mordenkainen\'s sword', 'hunger of hadar', 'guardian of faith']);
// These names have reviewed core combat paths. Situational adjudication remains
// the DM's job; unknown/custom rolls never earn this label by having dice alone.
const READY: Record<string, { level: number; kind: string; dice: string; scale?: string }> = {
  'eldritch blast': { level: 0, kind: 'attack', dice: '1d10' },
  'chromatic orb': { level: 1, kind: 'attack', dice: '3d8', scale: '1d8' },
  'magic missile': { level: 1, kind: 'damage', dice: '1d4+1' },
  'scorching ray': { level: 2, kind: 'attack', dice: '2d6' },
  'cure wounds': { level: 1, kind: 'heal', dice: '2d8', scale: '2d8' },
  'healing word': { level: 1, kind: 'heal', dice: '2d4', scale: '2d4' },
  'sacred flame': { level: 0, kind: 'save', dice: '1d8', scale: '1d8' },
  'poison spray': { level: 0, kind: 'attack', dice: '1d12', scale: '1d12' },
  'inflict wounds': { level: 1, kind: 'save', dice: '2d10', scale: '1d10' },
  'false life': { level: 1, kind: 'heal', dice: '2d4+4', scale: '5' },
};
const formula = (value: string | undefined) => (value ?? '').replace(/\s/g, '').toLowerCase();
function reviewedExtras(key: string, a: SheetAbility): boolean {
  const r = a.roll!;
  if (r.baseLevel !== a.level) return false;
  switch (key) {
    case 'eldritch blast': return r.damageType === 'force' && r.instances === 1 && r.scaleInstances === 1 && r.instanceScaling === 'cantrip';
    case 'chromatic orb': return !r.damageType && [...(r.damageTypeChoices ?? [])].sort().join(',') === 'acid,cold,fire,lightning,poison,thunder';
    case 'magic missile': return r.damageType === 'force' && r.instances === 3 && r.scaleInstances === 1 && !r.instanceScaling;
    case 'scorching ray': return r.damageType === 'fire' && r.instances === 3 && r.scaleInstances === 1 && !r.instanceScaling;
    case 'cure wounds': case 'healing word': return r.damageType === 'healing' && (!r.healingBonus || r.healingBonus === 'spellcasting') && (!r.healTarget || r.healTarget === 'selected');
    case 'sacred flame': return r.damageType === 'radiant' && r.save === 'DEX' && r.saveDamage === 'none' && r.targetMode === 'single';
    case 'poison spray': case 'inflict wounds': case 'false life': return matchesRevisedSpell2024(a);
    default: return false;
  }
}

export function spellCombatSupport(input: SpellInput): SpellCombatSupport | null {
  if (input.type !== 'spell') return null;
  const ability: SheetAbility = { id: 'support-audit', description: '', ...input };
  const key = abilityKey(ability);
  const effective = effectiveSheetAbility(ability);
  const revised = matchesRevisedSpell2024(effective);
  const authored = ability.source === 'custom' || ability.executionProfile === 'manual' ||
    (!revised && (isEditedUnsafeRoll(ability, key) || !!(ability.roll && spellRevision2024For(ability))));
  const automated = ['Cast record and spell-slot bookkeeping.'];
  const manual: string[] = [];
  if (effective.tags?.some(tag => tag.toLowerCase() === 'concentration')) automated.push('Concentration tracking.');
  const result = (status: SpellCombatSupport['status'], manualCastOnly = false): SpellCombatSupport => ({
    status, label: status === 'ready' ? 'Combat ready' : status === 'partial' ? 'Partial' : 'Manual',
    automated, manual, manualCastOnly,
  });
  if (!authored && MANUAL_ROLLS[key] && !(revised && effective.roll)) {
    manual.push(MANUAL_ROLLS[key], 'Automatic effect rolls are disabled for this entry; record the cast and resolve its effect with the DM.');
    return result('manual', true);
  }
  if (authored) {
    if (effective.roll) automated.push('The saved custom roll and its configured target/damage behavior.');
    if (effective.summon) automated.push('Place the configured friendly summon placeholder; stat blocks, duration, and commands remain manual.');
    manual.push('Custom or explicitly authored mechanics have not been verified against the spell rules. Review effects, targets, and duration with the DM.');
    return result(effective.roll || effective.summon ? 'partial' : 'manual', !effective.roll && !effective.summon);
  }
  if (effective.smite) {
    automated.push('Post-hit option, slot spending, typed damage, critical dice, and damage reveal.');
    if (key === 'divine smite' && ability.level === 1 && formula(effective.smite.dice) === '2d8' &&
        formula(effective.smite.scaleDice) === '1d8' && effective.smite.damageType === 'radiant' &&
        formula(effective.smite.bonusVs?.dice) === '1d8' &&
        [...(effective.smite.bonusVs?.creatureTypes ?? [])].sort().join(',') === 'fiend,undead') return result('ready');
    manual.push('Review the configured smite damage and eligibility with the DM; this is not the reviewed Divine Smite profile.');
    return result('partial');
  }
  if (hitFeature(ability)) {
    automated.push('Post-hit spell choice, damage/save flow, and supported linked conditions.');
    manual.push('Check eligibility, duration, and later-turn effects with the DM; not every ongoing rule is automated.');
    return result('partial');
  }
  if (markSpell(ability)) {
    automated.push('Target mark, concentration, attack damage rider including critical dice, and move-mark offer after a kill.');
    if (key === 'hex') automated.push('Ability-check disadvantage for the selected Hex ability.');
    manual.push(...DETAILS[key]);
    return result('partial');
  }
  if (key === 'haste') {
    if (isCanonicalHasteProfile(ability)) {
      automated.push('Linked target buff: +2 AC, doubled speed, Dexterity-save advantage, one limited extra action per turn, and ending lethargy through the target’s next turn.');
      return result('ready');
    }
    manual.push('This edited Haste entry uses its configured roll; automatic Haste benefits require the reviewed buff profile.');
    return result('partial');
  }
  if (key === 'hold person' && ability.level === 2 && effective.roll?.kind === 'save' &&
      effective.roll.save === 'WIS' && (!effective.roll.dice || formula(effective.roll.dice) === '0')) {
    automated.push('Humanoid eligibility, upcast target limit, paralysis with action/movement restrictions on a failed save, end-of-turn repeat saves, and concentration-linked cleanup.');
    return result('ready');
  }
  if (effective.summon) {
    automated.push('Place a friendly summon token on the map.');
    manual.push('Summoned stat blocks, commands, duration, and removal are manual; the placed token is a placeholder, not a complete summoned creature.');
    if (effective.roll) manual.push('Use the spell\'s configured attack separately; confirm its damage bonus and upcast rules.');
    return result('partial');
  }
  if (!effective.roll) {
    manual.push('Resolve the described effect, choices, duration, and any checks with the DM. The app records the cast but does not automate this effect.');
    return result('manual', true);
  }
  const roll = effective.roll;
  if (roll.kind === 'attack') automated.push('Spell attack, hit/critical result, and subsequent damage roll.');
  else if (roll.kind === 'heal') automated.push(roll.healingMode === 'temporary'
    ? 'Temporary-HP roll, upcast scaling, and larger-pool replacement without healing.'
    : roll.targetMode === 'multiple' ? 'One healing roll plus casting modifier, applied once to each chosen creature up to the target limit.'
      : 'Initial healing roll and selected-target HP application.');
  else if (roll.kind === 'save') automated.push('Initial saving throw, labelled result, and configured save damage.');
  else automated.push('Configured damage roll and target application.');
  if (roll.scaleDice || roll.scaleInstances) automated.push('Configured level/upcast scaling.');
  manual.push(...(DETAILS[key] ?? []));
  if (REPEATED.has(key)) manual.push('Recurring damage and repeat-use actions are manual. The Cast action is a fresh casting and may spend another slot.');
  const reviewed = READY[key];
  const matchesReviewed = reviewed && ability.level === reviewed.level && roll.kind === reviewed.kind &&
    formula(roll.dice) === reviewed.dice && formula(roll.scaleDice) === (reviewed.scale ?? '') && reviewedExtras(key, effective);
  if (!matchesReviewed && !manual.length) manual.push('Area/target eligibility, additional effects, and duration need DM adjudication; only the configured roll is automated.');
  return result(matchesReviewed && !manual.length ? 'ready' : 'partial');
}
