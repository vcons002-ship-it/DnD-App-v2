import type { SheetAbility } from './types.js';
export const abilityKey = (a: Pick<SheetAbility,'name'>) => a.name.replace(/[’‘]/g,"'").trim().toLowerCase();
export function markSpell(a: SheetAbility): 'force' | 'necrotic' | undefined {
  if (a.source === 'custom' || a.executionProfile === 'manual') return;
  return abilityKey(a) === "hunter's mark" ? 'force' : abilityKey(a) === 'hex' ? 'necrotic' : undefined;
}
export function hitFeature(a: SheetAbility): string | undefined {
  if (a.source === 'custom' || a.executionProfile === 'manual') return;
  const key = abilityKey(a);
  return ['sneak attack','stunning strike','colossus slayer','divine strike','searing smite','thunderous smite','wrathful smite','ensnaring strike'].includes(key) ? key : undefined;
}
export const hitSpell = (key: string) => ['searing smite','thunderous smite','wrathful smite','ensnaring strike'].includes(key);
