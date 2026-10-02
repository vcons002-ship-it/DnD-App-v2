import {linkedSpellProfile,spellKey} from '../../../shared/linkedSpells';
import {spellAreaFor} from '../../../shared/spellAreas';
import { hitFeature, markSpell, abilityKey } from '../../../shared/hitFeatures';
import { useState } from 'react';
import type {
  Character,
  Monster,
  SheetAbility,
  TokenKind,
} from '../../../shared/types';
import {
  ROLL_ICON,
  confirmConcentration,
  spellBaseLevel,
  upcastable,
} from '../lib/spellcasting';
import { useStore } from '../state/socket';
import { effectiveRecharge } from '../../../shared/monsterAttacks';
import { RechargeChip } from './RechargeChip';
import { isCanonicalHasteProfile, effectiveSheetAbility, isMultiTargetSpell, spellDamageTypeChoices } from '../../../shared/spellExecution';
import { spellSlotOptions, selectSpellSlot, type SpellSlotPool } from '../../../shared/spellSlotPools';
import { spellCombatSupport } from '../../../shared/spellSupport';
import { SpellCombatSupportBadge } from './SpellCombatSupport';
import { spellActionBlock } from '../../../shared/spellBuffs';

const manualRiderNote = (ability: SheetAbility): string | undefined => {
  const name = ability.name.replace(/[\u2018\u2019]/g, "'").trim().toLowerCase();
  return !markSpell(ability) && ability.type === 'spell' && ability.roll?.kind === 'damage' && (name === 'ensnaring strike' || name === "hunter's mark")
    ? 'Legacy damage-only action: this button casts and spends a spell slot, but does not implement the spell’s on-hit/ongoing effects. Resolve follow-up damage manually without recasting.'
    : undefined;
};

/**
 * Shared list of rollable-ability buttons (attack/save/damage/heal) fired at a
 * chosen target. Used by the right panel's Combat section (`variant="inline"`,
 * with an upcast level select) and the right-click floating menu
 * (`variant="menu"`) so the two surfaces can't drift — the WeaponButtons
 * pattern. The caller filters the list (permissions + `roll` presence); attack
 * rolls resolve to-hit vs the target's AC. Single-target saves use the selected
 * token; area spells and separate rays use the shared targeting dock. Heals
 * restore the selected ally (or explicitly self-targeted feature) on cast.
 */
export function AbilityButtons({
  abilities,
  kind,
  caster,
  targetTokenId,
  healTargetId,
  buffTargetId,
  variant = 'inline',
  onAfter,
}: {
  abilities: SheetAbility[];
  kind: TokenKind;
  caster: Character | Monster;
  targetTokenId?: string;
  healTargetId?: string;
  buffTargetId?: string;
  variant?: 'menu' | 'inline';
  onAfter?: () => void;
}) {
  const rollAbility = useStore((s) => s.rollAbility);
  const consumeAdvantage = useStore((s) => s.consumeAdvantage);
  const [hexAbility,setHexAbility] = useState('STR');
  const [castLevel, setCastLevel] = useState<Record<string, number>>({});
  const [slotPools,setSlotPools]=useState<Record<string,SpellSlotPool>>({});
  // Per-cast choice only: never persists a change to the authored spell.
  const [castDamageTypes, setCastDamageTypes] = useState<Record<string, string>>({});
  const damageChoice = (abilityId: string, choices: string[]) => {
    const chosen = castDamageTypes[`${caster.id}:${abilityId}`];
    return choices.includes(chosen) ? chosen : choices[0];
  };
  const menu = variant === 'menu';

  const cast = (a: SheetAbility) => {
    if (!confirmConcentration(caster, a)) return;
    const level = upcastable(a) ? castLevel[a.id] ?? spellBaseLevel(a) : undefined;
    const execution = effectiveSheetAbility(a, level);
    const manualCast = spellCombatSupport(a)?.manualCastOnly;
    rollAbility({
      kind,
      refId: caster.id,
      abilityId: a.id,
      castLevel: level,
      // A pool only when the player picked one, or for an upcastable spell at its
      // real cast level. Otherwise the server chooses — a level-0 lookup here
      // would always favour Pact Magic (e.g. legacy Divine Smite on a
      // Paladin/Warlock spending the pact slot while ordinary slots remain).
      slotPool: slotPools[a.id] ?? ('spellSlots' in caster && level !== undefined ? selectSpellSlot(caster, level)?.pool : undefined),
      damageType: markSpell(a)==='necrotic'?hexAbility:damageChoice(a.id, spellDamageTypeChoices(a, level)),
      // Advantage only affects the d20 of an attack roll; it comes from the
      // caster's shared toggle and is consumed when the attack fires.
      advantage: !manualCast && execution.roll?.kind === 'attack' && !(linkedSpellProfile(a)&&spellKey(a.name)==='flame blade') ? consumeAdvantage(caster.id) : undefined,
      targetTokenId: linkedSpellProfile(a)&&['mirror image','flame blade'].includes(spellKey(a.name)) ? undefined : isCanonicalHasteProfile(a) ? buffTargetId ?? targetTokenId : manualCast ? targetTokenId : execution.roll?.kind === 'heal' ? healTargetId
        : isMultiTargetSpell(a, level) ? undefined : targetTokenId,
    });
    onAfter?.();
  };

  return (
    <>
      {abilities.filter(a=>!hitFeature(a)).map((a) => {
        const level = upcastable(a) ? castLevel[a.id] ?? spellBaseLevel(a) : undefined;
        const execution = effectiveSheetAbility(a, level);
        const support = spellCombatSupport(a);
        const manualCast = !!support?.manualCastOnly;
        const damageTypes = manualCast ? [] : spellDamageTypeChoices(a, level);
        const multiple = isMultiTargetSpell(a, level);
        const saveOnly = execution.roll?.kind === 'save' && !execution.roll.dice?.trim();
        const selfSpell=linkedSpellProfile(a)&&['mirror image','flame blade'].includes(spellKey(a.name));
        const area=spellAreaFor(a,level);
          const workflow = area ? 'Place the measured spell area, review affected bases, then confirm. Saves roll together; damage applies automatically. Ongoing or manual effects stay with the DM.' : selfSpell ? spellKey(a.name)==='mirror image' ? 'Create three duplicates of yourself.' : 'Create the blade, then attack using its Active spell actions button.' : manualCast ? 'Record this casting and spend its spell slot; resolve its effects manually.' : multiple
          ? execution.roll?.kind === 'attack' ? 'Cast once, then choose a target for each separate spell attack.' : saveOnly ? 'Cast, then choose targets to roll saving throws.' : 'Roll once, then apply to targets on the map.'
          : execution.roll?.healTarget === 'self' ? 'Restore your own health.'
            : saveOnly ? 'Cast and force the selected target to roll its saving throw.' : 'Cast at the selected target.';
        // A spent limited-use action stays clickable (the DM decides), but reads as spent.
        const spent = !!effectiveRecharge(a)?.spent;
        const btn = (
          <button
            key={menu ? a.id : 'btn'}
            className={`${menu ? 'btn tiny fm-spell-attack' : 'btn tiny attack-row'}${spent ? ' recharge-spent' : ''}`}
            title={[a.description || 'Ability', workflow, support?.manual.length ? `You handle: ${support.manual.join('; ')}` : '', manualRiderNote(a), spent ? 'Spent — ready it from its ⟳ chip after a successful recharge roll.' : ''].filter(Boolean).join('\n')}
            disabled={!!spellActionBlock(caster) || (!area && !manualCast && !menu && !selfSpell && !multiple && (execution.roll?.kind === 'heal' ? execution.roll.healTarget !== 'self' && !healTargetId : !(isCanonicalHasteProfile(a) ? buffTargetId ?? targetTokenId : targetTokenId)))}
            onClick={() => cast(a)}
          >
            {manualCast ? 'Cast manually ·' : (isCanonicalHasteProfile(a) || markSpell(a) ? '\u2726' : execution.roll ? ROLL_ICON[execution.roll.kind] : undefined) ?? '🎲'} {a.name}{menu && spent ? ' (spent)' : ''}
          </button>
        );
        const damageTypeSelect = damageTypes.length > 0 && (
          <select
            className="spell-level spell-damage-type"
            aria-label={`${a.name} damage type`}
            title={`Damage type for ${a.name} — this cast only; the saved spell is unchanged`}
            value={damageChoice(a.id, damageTypes)}
            onChange={(e) => setCastDamageTypes((current) => ({
              ...current, [`${caster.id}:${a.id}`]: e.target.value,
            }))}
          >
            {damageTypes.map((damageType) => (
              <option key={damageType} value={damageType}>
                {damageType.charAt(0).toUpperCase() + damageType.slice(1)}
              </option>
            ))}
          </select>
        );
        return (
          <div key={a.id} className="combat-ability-row" style={damageTypes.length ? { flexWrap: 'wrap' } : undefined}>
            {btn}
            <SpellCombatSupportBadge ability={a} />
            <RechargeChip ability={a} kind={kind} refId={caster.id} />
            {damageTypeSelect}
            {abilityKey(a)==='hex'&&<select aria-label="Hex ability checks" value={hexAbility} onChange={e=>setHexAbility(e.target.value)}>{['STR','DEX','CON','INT','WIS','CHA'].map(k=><option key={k}>{k}</option>)}</select>}
            {upcastable(a) && (
              <select
                className="spell-level"
                value={castLevel[a.id] ?? spellBaseLevel(a)}
                title="Cast at level (upcast)"
                onChange={(e) =>
                  setCastLevel((c) => ({ ...c, [a.id]: Number(e.target.value) }))
                }
              >
                {Array.from({ length: 9 - spellBaseLevel(a) + 1 }).map((_, i) => {
                  const v = spellBaseLevel(a) + i;
                  return (
                    <option key={v} value={v}>
                      L{v}
                    </option>
                  );
                })}
              </select>
            )}
            {kind==='pc'&&'spellSlots' in caster&&Object.keys(caster.spellSlots).some(k=>/^P[1-5]$/.test(k))&&upcastable(a)&&
              <select aria-label={`${a.name} slot pool`} value={slotPools[a.id]??selectSpellSlot(caster,level??spellBaseLevel(a))?.pool??'spellcasting'}
                onChange={e=>{
                  const pool=e.target.value as SpellSlotPool;setSlotPools(p=>({...p,[a.id]:pool}));
                  const option=spellSlotOptions(caster,spellBaseLevel(a)).find(o=>o.pool===pool&&o.remaining>0);
                  if(option)setCastLevel(p=>({...p,[a.id]:option.level}));
                }}>
                <option value="spellcasting">Spellcasting</option><option value="pact">Pact Magic</option>
              </select>}
          </div>
        );
      })}
    </>
  );
}
