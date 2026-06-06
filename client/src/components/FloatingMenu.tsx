import { useEffect } from 'react';
import type { StateSnapshot, Token, Weapon } from '../../../shared/types';
import { resolveToken } from '../lib/entities';
import { useStore } from '../state/socket';
import { DamageHealControls } from './DamageHealControls';
import { WeaponButtons } from './WeaponButtons';
import { TokenAdminButtons } from './TokenAdminButtons';

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
  const consumeAdvantage = useStore((s) => s.consumeAdvantage);
  const mySocketId = useStore((s) => s.socket?.id);
  const isDm = snapshot.role === 'dm';
  const d = resolveToken(snapshot, token);
  const canSeeHp = d.curHp !== undefined && d.maxHp !== undefined;

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

      {/* Quick damage/heal — kept open so several can be applied in a row. */}
      {canSeeHp && (
        <DamageHealControls
          compact
          onApply={(delta) => applyDamage(token.kind, token.refId, delta)}
        />
      )}

      {canAttackAsSelected && (
        <div className="fm-attacks">
          <div className="fm-attacker">
            <span className="fm-attacker-icon">⚔️</span>
            Attacking as <strong>{resolveToken(snapshot, attacker!).name}</strong>
            <span className="fm-attacker-target"> → {d.name}</span>
          </div>
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
        </div>
      )}

      {isDm ? (
        <TokenAdminButtons token={token} variant="menu" onAfter={onClose} />
      ) : (
        !canSeeHp &&
        !canAttackAsSelected && (
          <div className="floating-menu-note muted">No actions available</div>
        )
      )}
    </div>
  );
}
