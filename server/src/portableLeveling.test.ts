import { describe, expect, it } from 'vitest';
import { mergePortableLeveling, portableLeveling } from '../../shared/portableLeveling.js';
import type { CharacterLeveling, LevelUpRecord } from '../../shared/levelingTypes.js';

const completed: LevelUpRecord = { id: 'applied-level-4', fromLevel: 3, toLevel: 4, hpGain: 12,
  at: 100, choices: { hpMethod: 'roll', asi: { CON: 2 }, featureSelections: { expertise: ['Arcana'] } } };
const current: CharacterLeveling = { rules: '2024', history: [completed], pending: {
  id: 'pending-level-5', fromLevel: 4, toLevel: 5, approvedAt: 200, baseFingerprint: 'sheet', hpRoll: 7,
} };

describe('portable character advancement', () => {
  it('copies completed choices without transferring a grant or its HP roll', () => {
    const copy = portableLeveling(current)!;
    expect(copy).toEqual({ rules: '2024', history: [completed] });
    copy.history[0].choices.asi!.CON = 1;
    expect(current.history[0].choices.asi?.CON).toBe(2);
    expect(current.pending?.hpRoll).toBe(7);
  });
  it('does not let imported history finish a pending grant or rewrite a server receipt', () => {
    const impostor = { ...completed, id: current.pending!.id, fromLevel: 4, toLevel: 5 };
    const oldNotes = { ...completed, id: 'earlier-campaign', fromLevel: 2, toLevel: 3 };
    const merged = mergePortableLeveling(current, { rules: '2024', history: [
      { ...completed, hpGain: 900 }, impostor, oldNotes,
    ], pending: { id: 'foreign-grant' } })!;
    expect(merged.pending).toEqual(current.pending);
    expect(merged.history).toEqual([completed, oldNotes]);
    expect(merged.history.some(record => record.id === current.pending?.id)).toBe(false);
  });
  it('keeps ordinary old sheets unversioned and ignores malformed receipts', () => {
    expect(portableLeveling(undefined)).toBeUndefined();
    expect(portableLeveling({ rules: '2014', history: [] })).toBeUndefined();
    expect(portableLeveling({ rules: '2024', history: [
      { ...completed, toLevel: 20 }, { ...completed, at: Infinity }, { ...completed, choices: null }, completed, completed,
    ] })).toEqual({ rules: '2024', history: [completed] });
  });
  it('copies a valid multiclass roster and chosen advancement class without its rolled grant', () => {
    const copy=portableLeveling({ ...current,classes:[{className:'fighter',level:3},{className:'wizard',level:1}],
      history:[{...completed,choices:{hpMethod:'fixed',className:'wizard'}}] });
    expect(copy?.classes).toEqual([{className:'fighter',level:3},{className:'wizard',level:1}]);
    expect(copy?.history[0].choices.className).toBe('wizard');
    expect(copy?.pending).toBeUndefined();
    expect(portableLeveling({...current,classes:[{className:'fighter',level:3},{className:'fighter',level:1}]})).toBeUndefined();
  });
  it('cannot change a pending grant\'s class roster through a portable import', () => {
    const existing={...current,classes:[{className:'fighter' as const,level:4}]};
    expect(mergePortableLeveling(existing,{rules:'2024',history:[],classes:[{className:'wizard',level:4}]})?.classes).toEqual(existing.classes);
  });
});
