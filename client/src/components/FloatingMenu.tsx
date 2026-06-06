import { useEffect, useState } from 'react';
import type { StateSnapshot, Token, Weapon } from '../../../shared/types';
import { resolveToken } from '../lib/entities';
import { useStore } from '../state/socket';

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
  const duplicateToken = useStore((s) => s.duplicateToken);
  const setTokenHidden = useStore((s) => s.setTokenHidden);
  const setTokensHideCombatRole = useStore((s) => s.setTokensHideCombatRole);
  const deleteToken = useStore((s) => s.deleteToken);
  const combatAttack = useStore((s) => s.combatAttack);
  const mySocketId = useStore((s) => s.socket?.id);
  const isDm = snapshot.role === 'dm';
  const d = resolveToken(snapshot, token);
  const canSeeHp = d.curHp !== undefined && d.maxHp !== undefined;
  const [amount, setAmount] = useState(1);

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
  // Mirror the server's combat:attack gate: DM, or the owner of the attacking PC.
  const canAttackAsSelected =
    !!attacker &&
    attacker.id !== token.id &&
    aWeapons.length > 0 &&
    (isDm || (attacker.kind === 'pc' && aChar?.claimedBy === mySocketId));

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
        <div className="fm-dmg" onPointerDown={(e) => e.stopPropagation()}>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value))}
          />
          <button
            className="btn tiny red"
            onClick={() => applyDamage(token.kind, token.refId, amount)}
          >
            −HP
          </button>
          <button
            className="btn tiny green"
            onClick={() => applyDamage(token.kind, token.refId, -amount)}
          >
            +HP
          </button>
        </div>
      )}

      {canAttackAsSelected && (
        <div className="fm-attacks" onPointerDown={(e) => e.stopPropagation()}>
          <div className="floating-menu-note">
            {resolveToken(snapshot, attacker!).name} attacks {d.name}:
          </div>
          {aWeapons.map((w, i) => (
            <button
              key={i}
              className="floating-menu-item"
              onClick={run(() =>
                combatAttack({
                  attackerTokenId: attacker!.id,
                  targetTokenId: token.id,
                  weaponIndex: i,
                }),
              )}
            >
              {w.kind === 'ranged' ? '🏹' : '⚔️'} {w.name}
              {w.damage ? ` (${w.damage})` : ''}
            </button>
          ))}
        </div>
      )}

      {isDm ? (
        <>
          <button
            className="floating-menu-item"
            onClick={run(() => duplicateToken(token.id))}
          >
            ⧉ Duplicate
          </button>
          <button
            className="floating-menu-item"
            onClick={run(() => setTokenHidden(token.id, !token.isHidden))}
          >
            {token.isHidden ? '🙈 Show to players' : 'Hide from players'}
          </button>
          <button
            className="floating-menu-item"
            onClick={run(() =>
              setTokensHideCombatRole([token.id], !token.hideCombatRole),
            )}
          >
            {token.hideCombatRole ? '◎ Show role badge' : '◎ Hide role badge'}
          </button>
          <button
            className="floating-menu-item danger"
            onClick={run(() => deleteToken(token.id))}
          >
            ✕ Delete
          </button>
        </>
      ) : (
        !canSeeHp &&
        !canAttackAsSelected && (
          <div className="floating-menu-note muted">No actions available</div>
        )
      )}
    </div>
  );
}
