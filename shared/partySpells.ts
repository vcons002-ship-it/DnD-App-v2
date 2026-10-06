import type { SheetAbility } from './types.js';

/** Runtime upgrades for unchanged catalogue/saved entries; homebrew opts out. */
export function partySpell(a: SheetAbility): 'shield' | 'misty step' | 'hypnotic pattern' | 'pass without trace' | undefined {
  if (a.type !== 'spell' || a.source === 'custom' || a.executionProfile === 'manual') return;
  const name=a.name.trim().toLowerCase();
  const levels:Record<string,number>={'shield':1,'misty step':2,'hypnotic pattern':3,'pass without trace':2};
  if (a.level !== levels[name]) return;
  const r=a.roll;
  if (r) {
    if (name==='hypnotic pattern') {
      if (r.kind!=='save' || r.save && r.save!=='WIS' || r.dice && r.dice!=='0' || r.damageType || r.scaleDice) return;
    } else if (r.kind!=='damage' || r.dice!=='0') return;
    if(r.baseLevel!==undefined&&r.baseLevel!==a.level)return;
    if(name==='hypnotic pattern'&&(r.saveDamage!==undefined&&r.saveDamage!=='none'||r.targetMode!==undefined&&r.targetMode!=='multiple'))return;
    if(name!=='hypnotic pattern'&&(r.save||r.dc||r.saveDamage))return;
    const allowed=['kind','dice','save','baseLevel','targetMode','saveDamage','castingAbility','dc'];
    if(Object.keys(r).some(k=>r[k as keyof typeof r]!==undefined&&!allowed.includes(k)))return;
  }
  return name as ReturnType<typeof partySpell>;
}
