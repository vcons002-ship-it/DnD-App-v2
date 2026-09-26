import type { Weapon } from '../../../shared/types';

/**
 * Shared list of weapon-attack buttons (icon + name + damage). The parent wires
 * how each weapon is rolled via `onAttack(index)` so the same rendering serves
 * the quick right-click menu (`variant="menu"`) and the Combat section's
 * roller (`variant="inline"`). Both surfaces pass the attacker's shared
 * `twoHanded` choice so their labels match the intent sent to the server.
 */
export function WeaponButtons({
  weapons,
  onAttack,
  variant = 'inline',
  twoHanded,
  disabled,
}: {
  weapons: Weapon[];
  onAttack: (index: number) => void;
  variant?: 'menu' | 'inline';
  twoHanded?: boolean;
  disabled?: boolean;
}) {
  const menu = variant === 'menu';
  return (
    <>
      {weapons.map((w, i) => {
        const dmg = twoHanded && w.versatileDamage?.trim() ? w.versatileDamage : w.damage;
        return (
          <button
            key={i}
            className={menu ? 'floating-menu-item' : 'btn tiny attack-row'}
            disabled={disabled}
            onClick={() => onAttack(i)}
          >
            {w.kind === 'ranged' ? '🏹' : '⚔️'} {w.name}
            {menu && w.range && <span className="muted"> ({w.range})</span>}
            {dmg ? menu ? ` (${dmg})` : <span className="muted"> {dmg}</span> : null}
          </button>
        );
      })}
    </>
  );
}
