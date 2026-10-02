import { describe, expect, it } from 'vitest';
import type { Condition } from '../../shared/types.js';
import { activeHasteCondition, effectiveSpeed, hasteAcBonus, spellActionBlock, walkingSpeedFeet } from '../../shared/spellBuffs.js';
import { effectiveAc } from '../../shared/modifiers.js';
import { impliedConditions, saveAdvantage } from '../../shared/conditionEffects.js';

const condition = (label: string): Condition => ({ id: label, label, aura: 'green', isConcentration: false });
describe('Haste live benefits', () => {
  it('adds AC to live armor/item bonuses once, without changing saved values', () => {
    const source = { armorClass: 17, speed: '30 ft.', conditions: [condition('Haste'), condition('Haste')],
      modifiers: [{ id: 'cloak', source: 'Cloak', target: { kind: 'ac' as const }, value: 1 }] };
    expect(effectiveAc(source)).toBe(20);
    expect(source.armorClass).toBe(17);
    expect(effectiveAc({ ...source, conditions: [] })).toBe(18);
  });
  it('doubles every stated movement speed while preserving modes and notes', () => {
    const source = { speed: '30 ft., climb 20 ft., fly 60 ft. (hover)', conditions: [condition('Haste')] };
    expect(effectiveSpeed(source)).toBe('60 ft., climb 40 ft., fly 120 ft. (hover)');
    expect(walkingSpeedFeet(source)).toBe(60);
    expect(walkingSpeedFeet({ speed: 'fly 40 ft.', conditions: [] })).toBeUndefined();
    expect(source.speed).toBe('30 ft., climb 20 ft., fly 60 ft. (hover)');
  });
  it('cannot override a speed-zero condition, and lethargy removes all Haste benefits', () => {
    expect(effectiveSpeed({ speed: '30 ft.', conditions: [condition('Haste'), condition('Grappled')] })).toBe('0 ft.');
    const source = { speed: '30 ft.', conditions: [condition('Haste'), condition('Haste lethargy')] };
    expect(activeHasteCondition(source)).toBeUndefined();
    expect(hasteAcBonus(source)).toBe(0);
    expect(walkingSpeedFeet(source)).toBe(0);
    expect(impliedConditions('Haste lethargy')).toEqual(['Incapacitated']);
  });
  it('grants Dexterity-save advantage and combines every disadvantage normally', () => {
    expect(saveAdvantage(['Haste'], 'DEX')).toEqual({ state: 'adv', reasons: ['Haste (DEX)'] });
    expect(saveAdvantage(['Haste'], 'STR').state).toBeUndefined();
    expect(saveAdvantage(['Haste', 'Restrained'], 'DEX').reasons).toContain('cancel');
    expect(saveAdvantage(['Haste'], 'DEX', 'dis').state).toBeUndefined();
    expect(saveAdvantage(['Haste', 'Haste lethargy'], 'DEX').state).toBeUndefined();
  });
  it('blocks actions only for the automated spell effects, without changing legacy condition bookkeeping', () => {
    expect(spellActionBlock({ conditions: [condition('Paralyzed')] })).toBeUndefined();
    expect(spellActionBlock({ conditions: [condition('Haste lethargy')] })).toBe('Haste lethargy');
    const held = { ...condition('Paralyzed'), combatEffect: { casterKind: 'pc' as const, casterId: 'caster', spell: 'Hold Person', concentration: true, castId: 'cast' } };
    expect(spellActionBlock({ conditions: [held] })).toBe('Hold Person paralysis');
    expect(spellActionBlock({ conditions: [{ ...held, combatEffect: { ...held.combatEffect, spell: 'Different effect' } }] })).toBeUndefined();
  });
});
