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

/**
 * Shared list of rollable-ability buttons (attack/save/damage/heal) fired at a
 * chosen target. Used by the right panel's Combat section (`variant="inline"`,
 * with an upcast level select) and the right-click floating menu
 * (`variant="menu"`) so the two surfaces can't drift — the WeaponButtons
 * pattern. The caller filters the list (permissions + `roll` presence); attack
 * rolls resolve to-hit vs the target's AC, save/damage rolls make the target
 * roll and take it immediately, heals restore the heal target on cast.
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
  const menu = variant === 'menu';

  const cast = (a: SheetAbility) => {
    if (!confirmConcentration(caster, a)) return;
    rollAbility({
      kind,
      refId: caster.id,
      abilityId: a.id,
      castLevel: upcastable(a) ? castLevel[a.id] ?? spellBaseLevel(a) : undefined,
      // Advantage only affects the d20 of an attack roll; it comes from the
      // caster's shared toggle and is consumed when the attack fires.
      advantage: a.roll?.kind === 'attack' ? consumeAdvantage(caster.id) : undefined,
      targetTokenId: a.roll?.kind === 'heal' ? healTargetId : targetTokenId,
    });
    onAfter?.();
  };

  return (
    <>
      {abilities.map((a) => {
        const btn = (
          <button
            key={menu ? a.id : 'btn'}
            className={menu ? 'btn tiny fm-spell-attack' : 'btn tiny attack-row'}
            title={a.description || 'Ability'}
            disabled={!menu && a.roll?.kind !== 'heal' && !targetTokenId}
            onClick={() => cast(a)}
          >
            {ROLL_ICON[a.roll!.kind] ?? '🎲'} {a.name}
          </button>
        );
        if (menu) return btn;
        return (
          <div key={a.id} className="combat-ability-row">
            {btn}
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
