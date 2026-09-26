import { it, expect } from 'vitest';
import { createSession, createCharacter, setResource, updateCharacter, getCharacter } from './sessions.js';

for (const used of [0, 1, 2]) {
  it(`transfers ${used} spent Pact Magic uses when the slot level increases`, () => {
    const session = createSession('Pact slots');
    const pc = createCharacter(session.id, { name: 'Warlock', className: 'Warlock', level: 4 });
    setResource(pc.id, 'spellSlots', 'L2', { used });
    updateCharacter(pc.id, { level: 5 });
    expect(getCharacter(pc.id)!.spellSlots).toEqual({ L3: { max: 2, used } });
    updateCharacter(pc.id, { level: 5 });
    expect(getCharacter(pc.id)!.spellSlots.L3.used).toBe(used);
  });
}

it('preserves a custom destination pool rather than overwriting its usage', () => {
  const session = createSession('Custom pact');
  const pc = createCharacter(session.id, { name: 'Warlock', className: 'Warlock', level: 4 });
  setResource(pc.id, 'spellSlots', 'L2', { used: 2 });
  setResource(pc.id, 'spellSlots', 'L3', { max: 4, used: 1, preserveMax: true });
  updateCharacter(pc.id, { level: 5 });
  expect(getCharacter(pc.id)!.spellSlots.L3).toMatchObject({ max: 4, used: 1, maxOverride: true });
});

it('keeps explicitly fixed source counters and transfers normal usage on level-down', () => {
  const session = createSession('Pact corrections');
  const pc = createCharacter(session.id, { name: 'Warlock', className: 'Warlock', level: 5 });
  setResource(pc.id, 'spellSlots', 'L3', { used: 2 });
  updateCharacter(pc.id, { level: 4 });
  expect(getCharacter(pc.id)!.spellSlots.L2.used).toBe(2);
  setResource(pc.id, 'spellSlots', 'L2', { max: 2, preserveMax: true });
  updateCharacter(pc.id, { level: 5 });
  expect(getCharacter(pc.id)!.spellSlots.L2).toMatchObject({ used: 2, maxOverride: true });
});
