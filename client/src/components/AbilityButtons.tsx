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
import { effectiveSheetAbility, isMultiTargetSpell, spellDamageTypeChoices } from '../../../shared/spellExecution';

const manualRiderNote = (ability: SheetAbility): string | undefined => {
  const name = ability.name.replace(/[\u2018\u2019]/g, "'").trim().toLowerCase();
  return ability.type === 'spell' && ability.roll?.kind === 'damage' && (name === 'ensnaring strike' || name === "hunter's mark")
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
  variant = 'inline',
  onAfter,
}: {
  abilities: SheetAbility[];
  kind: TokenKind;
  caster: Character | Monster;
  targetTokenId?: string;
  healTargetId?: string;
  variant?: 'menu' | 'inline';
  onAfter?: () => void;
}) {
  const rollAbility = useStore((s) => s.rollAbility);
  const consumeAdvantage = useStore((s) => s.consumeAdvantage);
  const [castLevel, setCastLevel] = useState<Record<string, number>>({});
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
    rollAbility({
      kind,
      refId: caster.id,
      abilityId: a.id,
      castLevel: level,
      damageType: damageChoice(a.id, spellDamageTypeChoices(a, level)),
      // Advantage only affects the d20 of an attack roll; it comes from the
      // caster's shared toggle and is consumed when the attack fires.
      advantage: execution.roll?.kind === 'attack' ? consumeAdvantage(caster.id) : undefined,
      targetTokenId: execution.roll?.kind === 'heal' ? healTargetId
        : isMultiTargetSpell(a, level) ? undefined : targetTokenId,
    });
    onAfter?.();
  };

  return (
    <>
      {abilities.map((a) => {
        const level = upcastable(a) ? castLevel[a.id] ?? spellBaseLevel(a) : undefined;
        const execution = effectiveSheetAbility(a, level);
        const damageTypes = spellDamageTypeChoices(a, level);
        const multiple = isMultiTargetSpell(a, level);
        const saveOnly = execution.roll?.kind === 'save' && !execution.roll.dice?.trim();
        const workflow = multiple
          ? execution.roll?.kind === 'attack' ? 'Cast once, then choose a target for each separate spell attack.' : saveOnly ? 'Cast, then choose targets to roll saving throws.' : 'Roll once, then apply to targets on the map.'
          : execution.roll?.healTarget === 'self' ? 'Restore your own health.'
            : saveOnly ? 'Cast and force the selected target to roll its saving throw.' : 'Cast at the selected target.';
        const btn = (
          <button
            key={menu ? a.id : 'btn'}
            className={menu ? 'btn tiny fm-spell-attack' : 'btn tiny attack-row'}
            title={[a.description || 'Ability', workflow, manualRiderNote(a)].filter(Boolean).join('\n')}
            disabled={!menu && execution.roll?.kind !== 'heal' && !multiple && !targetTokenId}
            onClick={() => cast(a)}
          >
            {ROLL_ICON[execution.roll!.kind] ?? '🎲'} {a.name}
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
        if (menu) return damageTypes.length ? (
          <div key={a.id} className="combat-ability-row" style={{ flexWrap: 'wrap' }}>
            {btn}
            {damageTypeSelect}
          </div>
        ) : btn;
        return (
          <div key={a.id} className="combat-ability-row" style={damageTypes.length ? { flexWrap: 'wrap' } : undefined}>
            {btn}
            {damageTypeSelect}
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
          </div>
        );
      })}
    </>
  );
}
