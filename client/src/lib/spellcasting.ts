import { markSpell } from '../../../shared/hitFeatures';
import type { Character, Monster, Condition, SheetAbility } from '../../../shared/types';
import {selectSpellSlot,spellSlotOptions,type SpellSlotPool} from '../../../shared/spellSlotPools';
import {hitFeature} from '../../../shared/hitFeatures';
import {partySpell} from '../../../shared/partySpells';
import {advancedSpell} from '../../../shared/advancedSpells';
import {confirmAction} from './dialogs';

/** Icon per rollable kind, so a button reads attack vs save vs damage vs heal. */
export const ROLL_ICON: Record<string, string> = {
  attack: '✨',
  save: '🎯',
  damage: '💥',
  heal: '✚',
};

/** The base spell level (from the roll, else the entry's level). */
export const spellBaseLevel = (a: SheetAbility): number =>
  markSpell(a) ? 1 : a.roll?.baseLevel ?? a.level ?? 0;

/** Slot spending follows the entry's spell level, not damage-scaling metadata. */
export const spellSlotBaseLevel=(a:SheetAbility)=>markSpell(a)?1:a.type==='spell'||a.type==='stance'?a.level??0:a.roll?.baseLevel??0;

/** Any leveled spell can be cast with a higher slot — dice scale where the roll
 *  defines `scaleDice`; otherwise the higher-level effect is the `upcast` note. */
export const upcastable = (a: SheetAbility): boolean =>
  !!markSpell(a) || a.type === 'spell' && spellSlotBaseLevel(a) >= 1;

export const isCastSpell=(a:SheetAbility)=>a.type==='spell'||!!markSpell(a);
/** Use the same pool selection as the server, including higher Pact levels. */
export function spellCastCost(caster:Character|Monster,a:SheetAbility,requested?:number,pool?:SpellSlotPool){
 const base=spellSlotBaseLevel(a);
 const initial=base>0&&'spellSlots'in caster?spellSlotOptions(caster,base).find(o=>o.remaining>0&&(!pool||o.pool===pool))?.level:undefined;
 const level=base===0?0:Math.min(9,Math.max(base,requested??initial??base));
 const slot=base>0&&'spellSlots'in caster?selectSpellSlot(caster,level,pool):undefined;
 const actualLevel=slot?.level??level;
 const label=base===0?'Cantrip · no spell slot':!('spellSlots'in caster)?`Level ${actualLevel} · creature casting`:`${slot?.pool==='pact'?'Pact ':''}Level ${actualLevel} slot`;
 const unavailable=base>0&&'spellSlots'in caster&&(!slot||slot.remaining<=0);
 return {level:actualLevel,slot,label,unavailable,remaining:slot?`${slot.remaining} remaining`:undefined};
}
export function spellCastRestriction(a:SheetAbility){
 if(hitFeature(a)||a.smite)return 'Cast after a qualifying hit using the spell option beside Roll damage. No slot is spent before you choose it there.';
 if(partySpell(a)==='shield')return 'Cast from the Shield reaction prompt when an attack hits you or Magic Missile targets you.';
 if(advancedSpell(a)==='counterspell')return 'Cast from the Counterspell reaction prompt when a visible opponent starts casting within 60 ft.';
 if(a.prepared===false&&(a.level??0)>0)return 'Prepare this spell before casting it.';
 return undefined;
}

/** Does this entry have the concentration flag (tag or meta)? Spell OR stance. */
export const castsConcentration = (a: SheetAbility): boolean =>
  !!markSpell(a) || (a.tags ?? []).some((t) => t.trim().toLowerCase() === 'concentration') ||
  (a.meta ?? '').toLowerCase().includes('concentration');

/** A concentration SPELL (by tag or meta) — casting it starts concentration. */
export const isConcentration = (a: SheetAbility): boolean =>
  a.type === 'spell' && castsConcentration(a);

/** Warn before starting a NEW concentration while another is already running —
 *  5e lets you keep only one, so casting ends the old. Returns false to abort. */
export async function confirmConcentration(
  caster: { name: string; conditions: Condition[] },
  a: SheetAbility,
): Promise<boolean> {
  if (!castsConcentration(a)) return true;
  const existing = caster.conditions.find(
    (c) => c.isConcentration && c.label !== `Concentration: ${a.name}`,
  );
  if (!existing) return true;
  const prev =
    existing.label.replace(/^Concentration:\s*/i, '').trim() || 'another spell';
  return confirmAction({title:'Replace concentration?',acceptLabel:`Cast ${a.name}`,message:
    `${caster.name} is concentrating on ${prev}. Casting ${a.name} will end ${prev}. Cancel to keep the current spell.`});
}
