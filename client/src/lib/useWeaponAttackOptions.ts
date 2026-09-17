import type { Token } from '../../../shared/types';
import { useStore, type WeaponAttackOptions } from '../state/socket';

const DEFAULT_OPTIONS: WeaponAttackOptions = { offhand: false, twoHanded: false };

/** Shared local intent only: the server still validates and computes damage.
 *  Multiple tokens for the same entity share its choices, different attackers
 *  do not. These options reset on leaving/joining, not on opening a menu. */
export function useWeaponAttackOptions(attacker: Token | null) {
  const key = attacker ? `${attacker.kind}:${attacker.refId}` : '';
  const options = useStore((s) => s.weaponAttackOptions[key] ?? DEFAULT_OPTIONS);
  const toggle = useStore((s) => s.toggleWeaponAttackOption);
  return {
    ...options,
    toggleOption: (option: keyof WeaponAttackOptions) => {
      if (key) toggle(key, option);
    },
  };
}
