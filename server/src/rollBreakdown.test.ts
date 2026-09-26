import { describe, expect, it } from 'vitest';
import type { RollEntry, RollReveal } from '../../shared/types.js';
import { damageRollBreakdown } from '../../shared/rollBreakdown.js';

const entry = (reveal?: Partial<RollReveal>): RollEntry => ({
  id: 'display-only', roller: 'Fighter', label: 'Damage', expr: 'Greatsword',
  total: 999, detail: 'Existing detail remains unchanged', createdAt: 1,
  ...(reveal ? { reveal: { kind: 'damage', attacker: 'Fighter', outcome: 'hit', ...reveal } } : {}),
});

describe('recorded damage breakdown formatting', () => {
  it('shows each die and named flat modifier without using the attack total', () => {
    expect(damageRollBreakdown(entry({ kind: 'attack', damage: 13, damageType: 'slashing',
      damageDice: [{ label: '2d6', value: 8, faces: [3, 5] }],
      damageMods: [{ label: 'STR', value: 4 }, { label: 'MAGIC', value: 1 }],
    }))).toBe('Damage: 2d6 [3 + 5] + 4 STR + 1 MAGIC = 13 slashing');
  });
  it('includes critical dice and signed resistance/negative modifiers', () => {
    expect(damageRollBreakdown(entry({ outcome: 'crit', damage: 5,
      damageDice: [{ label: '1d8', value: 6, faces: [6] }, { label: 'CRIT', value: 5, faces: [5] }],
      damageMods: [{ label: 'STR', value: -1 }, { label: 'resisted', value: -5 }],
    }))).toBe('Damage: 2d8 [6 + 5] − 1 STR − 5 Resistance = 5');
  });
  it('preserves baked spell flats without adding them twice', () => {
    expect(damageRollBreakdown(entry({ damage: 4, damageType: 'force',
      damageDice: [{ label: '1d4+1', value: 4, faces: [3] }],
    }))).toBe('Damage: 4 (1d4+1; rolls 3) = 4 force');
  });
  it('preserves mixed and negative dice expressions as originally recorded', () => {
    expect(damageRollBreakdown(entry({ damage: 9,
      damageDice: [{ label: '1d8+1d4-1d2+2', value: 9, faces: [6, 3, 2] }],
    }))).toBe('Damage: 9 (1d8+1d4-1d2+2; rolls 6, 3, 2) = 9');
  });
  it('uses future log-only rider faces without double-counting animation adjustments', () => {
    expect(damageRollBreakdown(entry({ damage: 14,
      damageDice: [{ label: '1d8', value: 6, faces: [6] }],
      damageMods: [{ label: 'bonus', value: 8 }],
      damageBreakdown: { dice: [{ label: '1d8', value: 6, faces: [6] }, { label: "Hunter's Mark 1d6", value: 4, faces: [4] }],
        mods: [{ label: 'DEX', value: 4 }] },
    }))).toBe("Damage: 1d8 [6] + 4 (Hunter's Mark 1d6; rolls 4) + 4 DEX = 14");
  });
  it('leaves anonymous creature modifiers anonymous', () => {
    expect(damageRollBreakdown(entry({ damage: 9, damageDice: [{ label: '1d8', value: 6, faces: [6] }],
      damageMods: [{ label: '', value: 3 }],
    }))).toBe('Damage: 1d8 [6] + 3 Modifier = 9');
  });
  it('preserves arbitrary custom feature names without object-prototype lookups', () => {
    expect(damageRollBreakdown(entry({ damage: 2, damageMods: [{ label: 'constructor', value: 2 }] })))
      .toBe('Damage: 2 constructor = 2');
  });
  it('keeps individually recorded negative rider dice visible as negative modifiers', () => {
    expect(damageRollBreakdown(entry({ damage: 3,
      damageDice: [{ label: '1d8', value: 6, faces: [6] }],
      damageMods: [{ label: '1d4 (custom penalty)', value: -3, faces: [3] }],
    }))).toBe('Damage: 1d8 [6] − 3 1d4 (custom penalty) [3] = 3');
  });
  it('does not label a mixed-type total as only the elemental animation type', () => {
    expect(damageRollBreakdown(entry({ damage: 9, damageType: 'fire',
      damageBreakdown: { mixedTypes: true,
        dice: [{ label: '1d8', value: 6, faces: [6] }, { label: '1d6 (fire rider)', value: 3, faces: [3] }], mods: [] },
    }))).toBe('Damage: 1d8 [6] + 1d6 (fire rider) [3] = 9');
  });
  it('does not disclose prereolled pending damage even if a malformed record has both fields', () => {
    const pending = entry({ damage: 12, damageDice: [{ label: '2d6', value: 12, faces: [6, 6] }] });
    pending.pending = { target: { kind: 'monster', refId: 'target', name: 'Target' },
      attacker: { kind: 'pc', refId: 'attacker' }, weapon: 'Sword', amount: 12, crit: false,
      dice: [{ label: '2d6', value: 12, faces: [6, 6] }], mods: [] };
    expect(damageRollBreakdown(pending)).toBeNull();
    pending.pending.done = true;
    expect(damageRollBreakdown(pending)).toContain('[6 + 6]');
  });
  it('adds no invented details to old records, misses, plain rolls or healing/checks', () => {
    expect(damageRollBreakdown(entry())).toBeNull();
    expect(damageRollBreakdown(entry({ kind: 'attack', outcome: 'miss' }))).toBeNull();
    for (const kind of ['dice', 'check'] as const) expect(damageRollBreakdown(entry({ kind, damage: 4,
      damageDice: [{ label: '1d4', value: 4, faces: [4] }] }))).toBeNull();
  });
  it('labels legacy unitemized adjustments honestly and does not invent missing faces', () => {
    expect(damageRollBreakdown(entry({ damage: 1,
      damageDice: [{ label: '1d4', value: 1 }], damageMods: [{ label: 'STR', value: -2 }],
    }))).toBe('Damage: 1 (1d4) − 2 STR + 2 Unitemized = 1');
  });
  it('formats persisted older reveals without mutating the entry', () => {
    const original = entry({ damage: 7, damageDice: [{ label: '2d6', value: 7, faces: [3, 4] }] });
    const restored = JSON.parse(JSON.stringify(original));
    expect(damageRollBreakdown(restored)).toBe('Damage: 2d6 [3 + 4] = 7');
    expect(restored).toEqual(original);
  });
});

it('combines normal and crit weapon/mark dice into one equation',()=>{
 const text=damageRollBreakdown(entry({damage:19,damageBreakdown:{mixedTypes:true,mods:[{label:'DEX',value:4}],dice:[
 {label:'1d8',value:5,faces:[5]}, {label:'CRIT',value:3,faces:[3],diceExpression:'1d8',critical:true},
 {label:"Hunter's Mark (force)",value:4,faces:[4],diceExpression:'1d6',critical:false},
 {label:"Hunter's Mark (force) CRIT",value:3,faces:[3],diceExpression:'1d6',critical:true}]}}));
 expect(text).toBe("Damage: 2d8 [5 + 3] + 2d6 Hunter's Mark (force) [4 + 3] + 4 DEX = 19");
});
