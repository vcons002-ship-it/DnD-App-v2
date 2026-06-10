import { useEffect } from 'react';
import type {
  CreatureAbility,
  SheetAbility,
  StateSnapshot,
  Token,
  Weapon,
} from '../../../shared/types';
import { resolveToken } from '../lib/entities';
import { useStore } from '../state/socket';
import { DamageHealControls } from './DamageHealControls';
import { ObjectControls } from './ObjectControls';
import { WeaponButtons } from './WeaponButtons';
import { TokenAdminButtons } from './TokenAdminButtons';

/** Icon per rollable kind, so the menu reads attack vs save vs damage vs heal. */
const ROLL_ICON: Record<string, string> = {
  attack: '✨',
  save: '🎯',
  damage: '💥',
  heal: '✚',
};

type Props = {
  snapshot: StateSnapshot;
  token: Token;
  /** The currently-selected token — used as the attacker when attacking `token`. */
  attacker: Token | null;
  /** Screen position (clientX/clientY) where the menu was summoned. */
  x: number;
  y: number;
  onClose: () => void;
};

/**
 * Right-click / long-press action menu anchored at a token. Quick combat actions
 * (damage/heal where HP is visible) for everyone; DM gets the editing actions.
 */
export function FloatingMenu({ snapshot, token, attacker, x, y, onClose }: Props) {
  const applyDamage = useStore((s) => s.applyDamage);
  const combatAttack = useStore((s) => s.combatAttack);
  const rollAbility = useStore((s) => s.rollAbility);
  const rollMonsterAction = useStore((s) => s.rollMonsterAction);
  const consumeAdvantage = useStore((s) => s.consumeAdvantage);
  const mySocketId = useStore((s) => s.socket?.id);
  const isDm = snapshot.role === 'dm';
  const d = resolveToken(snapshot, token);
  const canSeeHp = d.curHp !== undefined && d.maxHp !== undefined;
  // If the right-clicked token is a non-combat object, offer its interact controls.
  const targetObjectKind =
    token.kind === 'monster'
      ? snapshot.monsters.find((m) => m.id === token.refId)?.objectKind
      : undefined;

  // Attack flow: the SELECTED token is the attacker, the right-clicked `token`
  // is the target. (Select a token, then right-click another to attack it.)
  const aChar =
    attacker?.kind === 'pc'
      ? snapshot.characters.find((c) => c.id === attacker.refId)
      : undefined;
  const aMon =
    attacker?.kind === 'monster'
      ? snapshot.monsters.find((m) => m.id === attacker.refId)
      : undefined;
  const aWeapons: Weapon[] =
    (aMon as { weapons?: Weapon[] } | undefined)?.weapons ?? aChar?.weapons ?? [];
  // Mirror the server's combat:attack gate: the DM, the owner of the attacking
  // PC, or a player using a friendly creature (companion/summon).
  const friendlyAttacker =
    attacker?.kind === 'monster' &&
    (aMon as { disposition?: string } | undefined)?.disposition === 'friendly';
  const canAttackAsSelected =
    !!attacker &&
    attacker.id !== token.id &&
    aWeapons.length > 0 &&
    (isDm ||
      (attacker.kind === 'pc' && aChar?.claimedBy === mySocketId) ||
      friendlyAttacker);

  // Every rollable spell/ability/action the attacker can fire (attack/save/damage/
  // heal). Attack rolls resolve to-hit vs the right-clicked target's AC; save/damage/
  // heal just roll into the log (the "Apply damage" click-to-target flow targets them).
  const targetingSelf = !!attacker && attacker.id === token.id;
  const pcAbilities: SheetAbility[] =
    aChar && !targetingSelf && (isDm || aChar.claimedBy === mySocketId)
      ? aChar.sheetAbilities.filter((a) => !!a.roll)
      : [];
  // Monster actions are DM-only (monster:action gate); full `actions` only on the DM snapshot.
  const monActions: { a: CreatureAbility; i: number }[] =
    isDm && aMon && !targetingSelf
      ? ((aMon as { actions?: CreatureAbility[] }).actions ?? [])
          .map((a, i) => ({ a, i }))
          .filter((x) => !!x.a.roll)
      : [];
  const canCastAsSelected = pcAbilities.length > 0 || monActions.length > 0;

  // Dismiss on outside click, scroll, or Escape.
  useEffect(() => {
    const close = () => onClose();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('pointerdown', close);
    window.addEventListener('wheel', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('wheel', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const run = (fn: () => void) => () => {
    fn();
    onClose();
  };

  return (
    <div
      className="floating-menu"
      style={{ left: x, top: y }}
      // Stop the menu's own pointerdown from triggering the outside-click close.
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="floating-menu-title">
        {d.name}
        {canSeeHp && (
          <span className="fm-hp">
            {d.curHp}/{d.maxHp}
          </span>
        )}
      </div>

      {/* Non-combat object: interact (toggle state, reveal/hide). */}
      {targetObjectKind && (
        <ObjectControls snapshot={snapshot} token={token} editable={isDm} />
      )}

      {/* Quick damage/heal — kept open so several can be applied in a row. */}
      {canSeeHp && (
        <DamageHealControls
          compact
          onApply={(delta) => applyDamage(token.kind, token.refId, delta)}
        />
      )}

      {(canAttackAsSelected || canCastAsSelected) && (
        <div className="fm-attacks">
          <div className="fm-attacker">
            <span className="fm-attacker-icon">⚔️</span>
            Attacking as <strong>{resolveToken(snapshot, attacker!).name}</strong>
            <span className="fm-attacker-target"> → {d.name}</span>
          </div>
          {canAttackAsSelected && (
            <WeaponButtons
              weapons={aWeapons}
              variant="menu"
              onAttack={(i) =>
                run(() =>
                  combatAttack({
                    attackerTokenId: attacker!.id,
                    targetTokenId: token.id,
                    weaponIndex: i,
                    advantage: consumeAdvantage(attacker!.refId),
                  }),
                )()
              }
            />
          )}
          {pcAbilities.map((a) => (
            <button
              key={a.id}
              className="btn tiny fm-spell-attack"
              title={a.description || 'Ability'}
              onClick={run(() =>
                rollAbility({
                  kind: 'pc',
                  refId: aChar!.id,
                  abilityId: a.id,
                  castLevel: a.roll?.baseLevel,
                  advantage: consumeAdvantage(attacker!.refId),
                  // Target the right-clicked token: attack rolls resolve to-hit vs
                  // its AC; save/damage rolls make IT roll the save and take the
                  // damage right away (no separate Apply-damage step). Heal ignores it.
                  targetTokenId: token.id,
                }),
              )}
            >
              {ROLL_ICON[a.roll!.kind] ?? '🎲'} {a.name}
            </button>
          ))}
          {monActions.map(({ a, i }) => (
            <button
              key={i}
              className="btn tiny fm-spell-attack"
              title={a.description || 'Action'}
              onClick={run(() =>
                rollMonsterAction(
                  aMon!.id,
                  i,
                  consumeAdvantage(attacker!.refId),
                  token.id, // attack → vs AC; save/damage → target rolls + takes it now
                ),
              )}
            >
              {ROLL_ICON[a.roll!.kind] ?? '🎲'} {a.name}
            </button>
          ))}
        </div>
      )}

      {isDm ? (
        <TokenAdminButtons token={token} variant="menu" onAfter={onClose} />
      ) : (
        !canSeeHp &&
        !canAttackAsSelected &&
        !canCastAsSelected && (
          <div className="floating-menu-note muted">No actions available</div>
        )
      )}
    </div>
  );
}
