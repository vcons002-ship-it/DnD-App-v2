import { describe, it, expect } from 'vitest';
import { aiFillCreature } from './creatures/fill.js';
import {
  createSession,
  createMonsterTemplate,
  instantiateMonster,
  getMonster,
} from './sessions.js';

describe('aiFillCreature', () => {
  it('fails safe without an AI key and never mutates the creature', async () => {
    const s = createSession('Fill');
    const tmpl = createMonsterTemplate(s.id, { name: 'Goblin', maxHp: 7 });
    const g = instantiateMonster(tmpl.id)!;

    const res = await aiFillCreature(g.id);
    // The test env has no valid AI key, so it must fail safe (no-key when none
    // is configured, lookup-failed when the configured key is rejected) — never
    // throw and never mutate.
    expect(res.ok).toBe(false);
    if (!res.ok) expect(['no-key', 'lookup-failed']).toContain(res.reason);

    // Creature is untouched.
    const after = getMonster(g.id)!;
    expect(after.actions).toHaveLength(0);
    expect(after.weapons).toHaveLength(0);
  });

  it('reports not-found for an unknown id', async () => {
    const res = await aiFillCreature('nope');
    expect(res).toEqual({ ok: false, reason: 'not-found' });
  });
});
