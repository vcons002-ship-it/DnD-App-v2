import type { Weapon } from '../../../shared/types';

/**
 * Shared list of weapon-attack buttons (icon + name + damage). The parent wires
 * how each weapon is rolled via `onAttack(index)` so the same rendering serves
 * the quick right-click menu (`variant="menu"`) and the full AttackControls
 * roller (`variant="inline"`, which also passes `twoHanded` to show 2H damage).
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
            {dmg ? menu ? ` (${dmg})` : <span className="muted"> {dmg}</span> : null}
          </button>
        );
      })}
    </>
  );
}
