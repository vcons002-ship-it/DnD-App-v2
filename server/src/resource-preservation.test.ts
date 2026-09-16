import { describe, expect, it } from 'vitest';
import {
  createCharacter,
  createSession,
  getCharacter,
  setResource,
  spendSpellSlot,
  spendResourceForAbility,
  updateCharacter,
} from './sessions.js';
import {
  remainingAfterMax,
  remainingAfterPip,
  slotReference2024,
} from '../../shared/resourceDisplay.js';

const caster = () =>
  createCharacter(createSession('Isolated HUD regression').id, {
    name: 'Test caster',
    race: 'Tiefling',
    className: 'Sorcerer',
    level: 6,
  });

describe('resource corrections survive normal play without conversions', () => {
  it('retains spent uses when increasing and clamps only on a smaller maximum', () => {
    const c = caster();
    setResource(c.id, 'spellSlots', 'L1', { used: 2 });
    expect(
      setResource(c.id, 'spellSlots', 'L1', { max: 6 })?.spellSlots.L1,
    ).toMatchObject({ max: 6, used: 2 });
    expect(
      setResource(c.id, 'spellSlots', 'L1', { max: 1 })?.spellSlots.L1,
    ).toMatchObject({ max: 1, used: 1 });
  });
  it('preserves custom maximum on an ordinary sheet save, cast and level change', () => {
    const c = caster();
    setResource(c.id, 'spellSlots', 'L1', { max: 6, used: 2 });
    updateCharacter(c.id, {
      level: c.level,
      className: c.className,
      subclass: c.subclass,
      name: 'Edited name',
    });
    expect(spendSpellSlot(c.id, 1)).toEqual({ hasSlot: true, spent: true });
    updateCharacter(c.id, { level: 7 });
    expect(getCharacter(c.id)?.spellSlots.L1).toEqual({
      max: 6,
      used: 3,
      maxOverride: true,
    });
    expect(getCharacter(c.id)?.spellSlots.L4).toEqual({ max: 1, used: 0 });
  });
  it('retains an explicitly configured total even when equal to the old standard', () => {
    const c = caster();
    setResource(c.id, 'spellSlots', 'L4', { max: 1, preserveMax: true });
    updateCharacter(c.id, { level: 8 });
    expect(getCharacter(c.id)?.spellSlots.L4.max).toBe(1);
  });
  it('preserves legacy custom counters without requiring a migration', () => {
    const c = caster();
    updateCharacter(c.id, { spellSlots: { L1: { max: 7, used: 3 } } });
    updateCharacter(c.id, { level: 9 });
    expect(getCharacter(c.id)?.spellSlots.L1).toEqual({ max: 7, used: 3 });
  });
  it('keeps named ability spending once, empty warnings and unknown counters unchanged', () => {
    const c = caster();
    setResource(c.id, 'resources', 'Custom Power', {
      max: 1,
      used: 0,
      preserveMax: true,
    });
    expect(spendResourceForAbility(c.id, ' custom power ')).toEqual({
      matched: true,
      spent: true,
    });
    expect(spendResourceForAbility(c.id, 'Custom Power')).toEqual({
      matched: true,
      spent: false,
    });
    expect(getCharacter(c.id)?.resources['Custom Power']).toEqual({
      max: 1,
      used: 1,
      maxOverride: true,
    });
    expect(spendSpellSlot(c.id, 9)).toEqual({ hasSlot: false, spent: false });
  });
  it('rejects malformed numeric corrections without destroying saved values', () => {
    const c = caster();
    const before = getCharacter(c.id)?.spellSlots;
    for (const max of [-1, NaN, Infinity, 1.5])
      setResource(c.id, 'spellSlots', 'L1', { max });
    expect(getCharacter(c.id)?.spellSlots).toEqual(before);
  });
});

describe('advisory 2024 presentation', () => {
  it('uses 2024 slots for new half-casters without replacing supplied save values', () => {
    const session = createSession('New defaults only');
    for (const className of ['Ranger', 'Paladin']) {
      const fresh = createCharacter(session.id, {
        name: 'New',
        className,
        level: 1,
      });
      expect(fresh.spellSlots.L1).toMatchObject({ max: 2, used: 0 });
      updateCharacter(fresh.id, { level: 3 });
      expect(getCharacter(fresh.id)?.spellSlots.L1).toMatchObject({
        max: 3,
        used: 0,
      });
      expect(
        createCharacter(session.id, {
          name: 'Saved',
          className,
          level: 1,
          spellSlots: {},
        }).spellSlots,
      ).toEqual({});
      expect(
        createCharacter(session.id, {
          name: 'Custom',
          className,
          level: 1,
          spellSlots: { L1: { max: 7, used: 2 } },
        }).spellSlots.L1,
      ).toEqual({ max: 7, used: 2 });
    }
  });
  it('matches the party and 2024 half-caster level-one reference', () => {
    expect(slotReference2024('Sorcerer', 6)).toEqual({ L1: 4, L2: 3, L3: 3 });
    expect(slotReference2024('Ranger', 6)).toEqual({ L1: 4, L2: 2 });
    expect(slotReference2024('Ranger', 1)).toEqual({ L1: 2 });
    expect(slotReference2024('Fighter', 6, 'Battle Master')).toEqual({});
    expect(slotReference2024('Wizard 3 / Fighter 2', 5)).toBeNull();
    expect(slotReference2024('Warlock', 6)).toBeNull();
    expect(slotReference2024('Custom class', 6)).toBeNull();
  });
  it('preserves existing boundary-pip semantics', () => {
    expect([1, 2, 3, 4].map((i) => remainingAfterPip(4, 1, i))).toEqual([
      1, 2, 2, 4,
    ]);
    expect(remainingAfterMax(6, 2)).toBe(4);
    expect(remainingAfterMax(1, 2)).toBe(0);
  });
});
