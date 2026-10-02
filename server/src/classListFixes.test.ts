import { afterEach, describe, expect, it, vi } from 'vitest';

// The AI gateway is mocked for the AI-fill case (no network).
const gateway = vi.hoisted(() => ({ reply: '' }));
vi.mock('./ai/gateway.js', async (orig) => ({
  ...(await orig<typeof import('./ai/gateway.js')>()),
  aiAvailable: () => true,
  generateJson: async () => gateway.reply,
}));

import {
  createCharacter, createMap, createSession, getCharacter, importMaps, listCharacters, listTokens,
  setActiveMap, setResource, setSheetAbility, createToken,
} from './sessions.js';
import {
  applyLevelUp, cancelLevelUp, configureLevelUpClasses, grantLevelUp,
} from './leveling.js';
import { registerSocketHandlers } from './socketHandlers.js';
import { dropConn, setConn, type IOServer } from './connections.js';
import { aiFillCharacter } from './creatures/fill.js';
import {
  CLASS_OPTIONS, canonicalClassName, classLevelFor, isListedClassName, legacySingleClass,
} from '../../shared/multiclass.js';
import { freeSmiteAvailable, smiteChoiceDescription } from '../../shared/smite.js';
import { isClassCounter, shortRestRecoveryForCharacter } from '../../shared/rests.js';
import type { LevelUpResult } from '../../shared/levelingTypes.js';

/** Follow-ups to the 2024 leveling + multiclass PR: classes come from a fixed
 *  list, legacy free-text sheets keep working, and the review's defects. */

const stats = { STR: 16, DEX: 14, CON: 14, INT: 16, WIS: 14, CHA: 14 };
function value<T>(r: LevelUpResult<T>): T { if (!r.ok) throw Error(r.error); return r.value; }

const connected: string[] = [];
afterEach(() => { for (const id of connected.splice(0)) dropConn(id); });
function harness(sessionId: string, mapId: string, role: 'player' | 'dm') {
  let connect!: (socket: unknown) => void;
  const io = { on: (_: string, cb: typeof connect) => { connect = cb; }, to: () => ({ emit: () => {} }) };
  registerSocketHandlers(io as unknown as IOServer, { livePhysics: false });
  const handlers = new Map<string, (...args: unknown[]) => void>();
  const id = `class-list-${connected.length}-${Math.random()}`;
  connected.push(id);
  const notices: string[] = [];
  connect({ id, on: (e: string, h: (...a: unknown[]) => void) => handlers.set(e, h),
    emit: (e: string, p: { message?: string }) => { if (e === 'notice') notices.push(p.message ?? ''); } });
  setConn(id, { sessionId, role, viewMapId: mapId, playerId: null });
  return { id, notices, send: (e: string, p: unknown) => handlers.get(e)!(p) };
}
const table = () => {
  const s = createSession('Class list');
  const map = createMap(s.id, { name: 'Camp' });
  setActiveMap(s.id, map.id);
  return { s, map };
};

describe('classes come from a fixed list', () => {
  it('canonicalises names; keeps an unchanged legacy value; refuses off-list ones', () => {
    expect(CLASS_OPTIONS).toEqual(['Barbarian', 'Bard', 'Cleric', 'Druid', 'Fighter', 'Monk', 'Paladin', 'Ranger', 'Rogue', 'Sorcerer', 'Warlock', 'Wizard']);
    expect(canonicalClassName('rogue')).toBe('Rogue');
    expect(canonicalClassName('  WIZARD ')).toBe('Wizard');
    expect(canonicalClassName('Rogue (Thief)')).toBe('Rogue');
    expect(canonicalClassName('')).toBe('');
    expect(canonicalClassName('Gunslinger')).toBeNull();
    expect(canonicalClassName('Fighter 5 / Wizard 3')).toBeNull(); // a split is set in Edit class levels
    expect(canonicalClassName('Artificer (Homebrew)', 'Artificer (Homebrew)')).toBe('Artificer (Homebrew)'); // unchanged legacy
    expect(isListedClassName('Rogue')).toBe(true);
    expect(isListedClassName('Rogue (Thief)')).toBe(false);
  });

  it('the sheet editor stores the canonical class, and refuses an off-list one without losing the rest of the edit', () => {
    const { s, map } = table();
    const c = createCharacter(s.id, { name: 'Edit me', className: 'Fighter', level: 3, stats });
    const dm = harness(s.id, map.id, 'dm');
    dm.send('character:update', { characterId: c.id, className: 'rogue' });
    expect(getCharacter(c.id)!.className).toBe('Rogue');
    dm.send('character:update', { characterId: c.id, className: 'Gunslinger', armorClass: 15 });
    expect(getCharacter(c.id)).toMatchObject({ className: 'Rogue', armorClass: 15 });
    expect(dm.notices.at(-1)).toMatch(/isn't one of the 12 classes/);
  });

  it('an old free-text sheet is never rewritten: editing other fields keeps its class as-is', () => {
    const { s, map } = table();
    const c = createCharacter(s.id, { name: 'Legacy', className: 'Rogue (Thief)', level: 5, stats });
    const dm = harness(s.id, map.id, 'dm');
    dm.send('character:update', { characterId: c.id, className: 'Rogue (Thief)', speed: '35 ft.' });
    expect(getCharacter(c.id)).toMatchObject({ className: 'Rogue (Thief)', speed: '35 ft.' });
    expect(dm.notices).toEqual([]);
  });

  it('a new character from the form gets a canonical class', () => {
    const { s, map } = table();
    const dm = harness(s.id, map.id, 'dm');
    dm.send('character:create', { name: 'Fresh', race: 'Elf', className: 'wizard', maxHp: 8 });
    expect(listCharacters(s.id).find((c) => c.name === 'Fresh')!.className).toBe('Wizard');
  });
});

describe('legacy free-text class names keep their features scaling', () => {
  it('reads one named class at the total level; never a multiclass, never an explicit roster', () => {
    expect(legacySingleClass('Rogue (Thief)')).toBe('rogue');
    expect(legacySingleClass('Arcane Trickster Rogue 5')).toBe('rogue');
    expect(legacySingleClass('Fighter / Wizard')).toBeNull();
    expect(classLevelFor({ className: 'Rogue (Thief)', level: 5 }, 'rogue')).toBe(5);
    expect(classLevelFor({ className: 'Barbarian (Berserker)', level: 9 }, 'barbarian')).toBe(9);
    expect(classLevelFor({ className: 'Fighter / Wizard', level: 7 }, 'fighter')).toBe(0);
    // An explicit (even invalid) roster is never second-guessed by the name.
    expect(classLevelFor({ className: 'Rogue', level: 5, leveling: { classes: [] } }, 'rogue')).toBe(0);
  });

  it('free Divine Smite and Bardic Inspiration come back for those sheets', () => {
    const spec = { dice: '2d8', scaleDice: '1d8', damageType: 'radiant', freeUse: { counter: 'Divine Smite (free)', className: 'paladin', minLevel: 2 } };
    expect(freeSmiteAvailable({ className: 'Paladin (Devotion)', level: 5, spellSlots: {}, resources: {} }, spec as never)).toBe(true);
    expect(shortRestRecoveryForCharacter('Bardic Inspiration', { max: 3, used: 3 }, { className: 'Bard (College of Lore)', level: 6 })).toBe('all');
  });
});

describe('review defects', () => {
  it('summoning only refuses a sheet that HAS slots at that level and is out of them', () => {
    const { s, map } = table();
    const dm = harness(s.id, map.id, 'dm');
    const summon = { id: 'fam', name: 'Spirit Guide', type: 'spell' as const, level: 2, description: '', summon: { name: 'Spirit' } };
    const homebrew = createCharacter(s.id, { name: 'No table', className: '', level: 5, stats });
    setSheetAbility('pc', homebrew.id, summon);
    dm.send('summon:cast', { kind: 'pc', refId: homebrew.id, abilityId: 'fam', mapId: map.id, x: 100, y: 100 });
    expect(listTokens(map.id).length).toBe(1);
    const wizard = createCharacter(s.id, { name: 'Tapped out', className: 'Wizard', level: 3, stats });
    setResource(wizard.id, 'spellSlots', 'L2', { used: getCharacter(wizard.id)!.spellSlots.L2.max });
    setSheetAbility('pc', wizard.id, summon);
    dm.send('summon:cast', { kind: 'pc', refId: wizard.id, abilityId: 'fam', mapId: map.id, x: 200, y: 100 });
    expect(listTokens(map.id).length).toBe(1);
    expect(dm.notices.at(-1)).toMatch(/No level 2 spell slots left/);
  });

  it('the DM corrects a multiclass total level through Edit class levels', () => {
    const s = createSession('Correction');
    const c = createCharacter(s.id, { name: 'Oops', className: 'Fighter', level: 5, stats, maxHp: 40 });
    value(configureLevelUpClasses(s.id, c.id, [{ className: 'fighter', level: 3 }, { className: 'wizard', level: 2 }]));
    const fixed = value(configureLevelUpClasses(s.id, c.id, [{ className: 'fighter', level: 3 }, { className: 'wizard', level: 1 }]));
    expect(fixed.level).toBe(4);
    expect(fixed.leveling!.classes).toEqual([{ className: 'fighter', level: 3 }, { className: 'wizard', level: 1 }]);
    expect(fixed.maxHp).toBe(40); // HP is the DM's call
    expect(configureLevelUpClasses(s.id, c.id, [{ className: 'fighter', level: 15 }, { className: 'wizard', level: 6 }]).ok).toBe(false);
  });

  it('a grant that inferred the class split is undone completely by cancel', () => {
    const s = createSession('Cancel');
    const c = createCharacter(s.id, { name: 'Cancelled', className: 'Fighter', level: 3, stats, subclass: 'Champion' });
    expect(getCharacter(c.id)!.leveling?.classes).toBeUndefined();
    const granted = value(grantLevelUp(s.id, c.id));
    expect(granted.leveling!.classes).toHaveLength(1);
    value(cancelLevelUp(s.id, c.id, granted.leveling!.pending!.id));
    expect(getCharacter(c.id)!.leveling?.classes).toBeUndefined();
    // An explicit split survives a grant + cancel.
    value(configureLevelUpClasses(s.id, c.id, [{ className: 'fighter', level: 3, subclass: 'Champion' }]));
    const again = value(grantLevelUp(s.id, c.id));
    value(cancelLevelUp(s.id, c.id, again.leveling!.pending!.id));
    expect(getCharacter(c.id)!.leveling!.classes).toEqual([{ className: 'fighter', level: 3, subclass: 'Champion' }]);
  });

  it('level-up history stores only known choice fields', () => {
    const s = createSession('History');
    const c = createCharacter(s.id, { name: 'Clean', className: 'Fighter', level: 1, stats, maxHp: 12 });
    const pending = value(grantLevelUp(s.id, c.id)).leveling!.pending!;
    const after = value(applyLevelUp(s.id, { characterId: c.id, expectedLevel: 1, grantId: pending.id,
      choices: { hpMethod: 'fixed', junk: { huge: 'x'.repeat(50) } } as never }));
    const choices = after.leveling!.history.at(-1)!.choices as Record<string, unknown>;
    expect(choices).not.toHaveProperty('junk');
    expect(choices).toMatchObject({ hpMethod: 'fixed', className: 'fighter' });
  });

  it('a map import never carries a pending level-up grant into the new campaign', () => {
    const src = table();
    const c = createCharacter(src.s.id, { name: 'Traveller', className: 'Fighter', level: 3, stats });
    createToken({ mapId: src.map.id, kind: 'pc', refId: c.id, x: 50, y: 50 });
    value(grantLevelUp(src.s.id, c.id));
    const dst = createSession('Next campaign');
    expect(importMaps(dst.id, src.s.code, [src.map.id])).toBe(1);
    const copy = listCharacters(dst.id).find((x) => x.name === 'Traveller')!;
    expect(copy.leveling?.pending).toBeUndefined();
    expect(copy.leveling?.classes).toBeUndefined(); // the grant had inferred it
    expect(getCharacter(c.id)!.leveling!.pending).toBeDefined(); // the original keeps its grant
  });

  it('a Cleric/Paladin\'s two Channel Divinity pools are class counters (no custom rest chip)', () => {
    expect(isClassCounter('Cleric Channel Divinity')).toBe(true);
    expect(isClassCounter('Paladin Channel Divinity')).toBe(true);
  });

  it('AI fill picks a listed class, and never sets a subclass on a multiclass sheet', async () => {
    const s = createSession('AI');
    const mc = createCharacter(s.id, { name: 'Split', className: 'Fighter', level: 4, stats, maxHp: 30 });
    value(configureLevelUpClasses(s.id, mc.id, [{ className: 'fighter', level: 2 }, { className: 'wizard', level: 2 }]));
    gateway.reply = JSON.stringify({ name: 'Split', race: 'Human', className: 'Fighter', subclass: 'Champion', level: 4, maxHp: 30, stats });
    await aiFillCharacter(mc.id);
    expect(getCharacter(mc.id)!.subclass).toBe('');
    const blank = createCharacter(s.id, { name: 'Blank', level: 1, stats });
    gateway.reply = JSON.stringify({ name: 'Blank', race: 'Elf', className: 'Gunslinger', level: 1, maxHp: 8, stats });
    await aiFillCharacter(blank.id);
    expect(getCharacter(blank.id)!.className).toBe('');
    gateway.reply = JSON.stringify({ name: 'Blank', race: 'Elf', className: 'ranger', level: 1, maxHp: 8, stats });
    await aiFillCharacter(blank.id);
    expect(getCharacter(blank.id)!.className).toBe('Ranger');
  });

  it('a Pact Magic smite reads properly in the log tooltip', () => {
    expect(smiteChoiceDescription('pact:3' as never)).toBe('level-3 Pact Magic slot');
    expect(smiteChoiceDescription(2 as never)).toBe('level-2 slot');
  });
});
