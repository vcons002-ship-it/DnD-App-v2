import { describe, it, expect } from 'vitest';
import { resolveAbilityRoll, resolveForcedSave } from './combat.js';
import {
  createSession,
  createMap,
  setActiveMap,
  createToken,
  createCharacter,
  createMonsterTemplate,
  instantiateMonster,
  claimCharacter,
  getCharacter,
  getMonster,
  listRollLog,
} from './sessions.js';
import { buildSnapshot } from './visibility.js';
import type { SheetAbility } from '../../shared/types.js';

function arena() {
  const s = createSession('P1');
  const map = createMap(s.id, { name: 'Pit' });
  setActiveMap(s.id, map.id);
  return { s, map };
}

const ability = (a: Pick<SheetAbility, 'name' | 'type' | 'roll'>): SheetAbility => ({
  id: 'ab1',
  description: '',
  ...a,
});

describe('#6 save-for-half damage', () => {
  it('a save spell deals HALF (not zero) of the rolled damage on a successful save', () => {
    const { s, map } = arena();
    // A caster whose save DC is low, vs a target that always makes the save.
    const caster = createCharacter(s.id, {
      name: 'Druid',
      className: 'Druid',
      level: 1,
      stats: { WIS: 10, INT: 10, CHA: 10 },
    });
    const tmpl = createMonsterTemplate(s.id, {
      name: 'Nimble',
      maxHp: 50,
      stats: { DEX: 30 }, // +10 → beats the DC on any d20
    });
    const target = instantiateMonster(tmpl.id)!;
    const tok = createToken({ mapId: map.id, kind: 'monster', refId: target.id, x: 1, y: 1 });

    // Hail of Thorns-style: a DEX save spell for half on a success.
    resolveAbilityRoll(
      s.id,
      'Druid',
      getCharacter(caster.id)!,
      ability({ name: 'Hail of Thorns', type: 'spell', roll: { kind: 'save', dice: '1d10', save: 'DEX', baseLevel: 1 } }),
    );
    const entry = listRollLog(s.id).at(-1)!;
    const amount = entry.apply!.amount;
    expect(amount).toBeGreaterThan(0); // the damage was rolled and stored

    resolveForcedSave(s.id, entry.id, tok.id, undefined);
    const saveLog = listRollLog(s.id).at(-1)!;
    expect(saveLog.detail).toContain('PASS');
    // HALF the rolled amount (rounded down) — the bug was 0 on a save.
    expect(getMonster(target.id)!.curHp).toBe(50 - Math.floor(amount / 2));
  });
});

describe('#12 Magic Missile per-dart click application', () => {
  it('logs a darts payload (roll-on-click, owned by the caster) and rolls each dart on resolve', () => {
    const { s, map } = arena();
    const caster = createCharacter(s.id, { name: 'Evoker', className: 'Wizard', level: 1 });
    const tmpl = createMonsterTemplate(s.id, { name: 'Dummy', maxHp: 40 });
    const target = instantiateMonster(tmpl.id)!;
    const tok = createToken({ mapId: map.id, kind: 'monster', refId: target.id, x: 1, y: 1 });

    resolveAbilityRoll(
      s.id,
      'Evoker',
      getCharacter(caster.id)!,
      ability({
        name: 'Magic Missile',
        type: 'spell',
        roll: { kind: 'damage', dice: '1d4+1', instances: 3, scaleInstances: 1, baseLevel: 1 },
      }),
    );
    const entry = listRollLog(s.id).at(-1)!;
    // No pre-rolled split; the apply carries darts + dice + the caster owner.
    expect(entry.apply!.darts).toBe(3);
    expect(entry.apply!.dice).toBe('1d4+1');
    expect(entry.apply!.split).toBeUndefined();
    expect(entry.apply!.owner).toBe(caster.id);

    // Each click rolls one dart (2..5) and applies it; three darts land here.
    const before = getMonster(target.id)!.curHp;
    resolveForcedSave(s.id, entry.id, tok.id, undefined, 0);
    resolveForcedSave(s.id, entry.id, tok.id, undefined, 1);
    resolveForcedSave(s.id, entry.id, tok.id, undefined, 2);
    const afterThree = getMonster(target.id)!.curHp;
    const dealt = before - afterThree;
    expect(dealt).toBeGreaterThanOrEqual(6); // 3 × (1d4+1 ≥ 2)
    expect(dealt).toBeLessThanOrEqual(15); // 3 × (1d4+1 ≤ 5)

    // A fourth click (index ≥ dart count) is a no-op — capped at the dart count.
    resolveForcedSave(s.id, entry.id, tok.id, undefined, 3);
    expect(getMonster(target.id)!.curHp).toBe(afterThree);
  });

  it("keeps the apply payload for the caster's own snapshot but strips it for other players", () => {
    const { s, map } = arena();
    const mine = createCharacter(s.id, { name: 'Mine', className: 'Wizard', level: 1 });
    // Claim the caster for socket 'sockA'.
    getCharacter(mine.id); // ensure it exists
    const tmpl = createMonsterTemplate(s.id, { name: 'Dummy', maxHp: 40 });
    const target = instantiateMonster(tmpl.id)!;
    createToken({ mapId: map.id, kind: 'pc', refId: mine.id, x: 0, y: 0 });
    createToken({ mapId: map.id, kind: 'monster', refId: target.id, x: 1, y: 1 });

    resolveAbilityRoll(
      s.id,
      'Mine',
      getCharacter(mine.id)!,
      ability({
        name: 'Magic Missile',
        type: 'spell',
        roll: { kind: 'damage', dice: '1d4+1', instances: 3, baseLevel: 1 },
      }),
    );
    // The caster is claimed by socket 'sockA'; another player is 'sockB'.
    claimCharacter(mine.id, 'sockA');

    const mineSnap = buildSnapshot(s.id, 'player', null, 'sockA')!;
    const otherSnap = buildSnapshot(s.id, 'player', null, 'sockB')!;
    const mineEntry = mineSnap.rollLog.find((e) => e.expr?.includes('Magic Missile'));
    const otherEntry = otherSnap.rollLog.find((e) => e.expr?.includes('Magic Missile'));
    expect(mineEntry?.apply?.darts).toBe(3); // caster keeps the assign-darts payload
    expect(otherEntry?.apply).toBeUndefined(); // other players never get it
  });
});
