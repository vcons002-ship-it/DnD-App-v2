import { useState } from 'react';
import type { ModTarget, SheetModifier } from '../../../shared/types';
import { SKILLS } from '../../../shared/skills';
import { targetLabel } from '../../../shared/modifiers';

const ABILITIES = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'] as const;
type AbilityKey = (typeof ABILITIES)[number];

// The target "kind" the user picks, plus how to build the structured ModTarget.
type Kind = 'ability' | 'save' | 'skill' | 'attack' | 'ac' | 'initiative';
const KINDS: { kind: Kind; label: string }[] = [
  { kind: 'ability', label: 'Ability score' },
  { kind: 'save', label: 'Saving throw' },
  { kind: 'skill', label: 'Skill check' },
  { kind: 'attack', label: 'Attack rolls' },
  { kind: 'ac', label: 'Armor Class' },
  { kind: 'initiative', label: 'Initiative' },
];

const newId = () => crypto.randomUUID?.() ?? String(Date.now() + Math.random());

/**
 * Edits a list of {@link SheetModifier}s (magic-item effects or a character's
 * feat/ASI adjustments). Pure controlled component — calls `onChange` with the
 * next array. `allowSlot` shows the "counts as a feat/ASI" checkbox (used for
 * character-level modifiers so they count against the feat cap).
 */
export function ModifierEditor({
  modifiers,
  onChange,
  editable,
  allowSlot = false,
  defaultSource = '',
  canAddSlot = true,
}: {
  modifiers: SheetModifier[];
  onChange: (next: SheetModifier[]) => void;
  editable: boolean;
  allowSlot?: boolean;
  defaultSource?: string;
  /** When false, a new slot-flagged modifier is blocked (feat cap reached). */
  canAddSlot?: boolean;
}) {
  const [kind, setKind] = useState<Kind>('ability');
  const [ability, setAbility] = useState<AbilityKey>('STR');
  const [skill, setSkill] = useState<string>('');
  const [value, setValue] = useState(1);
  const [source, setSource] = useState('');
  const [slot, setSlot] = useState(false);
  // Ability scores only: "= set to" floors the score at the value ("your
  // Strength is 19", Gauntlets-of-Ogre-Power style) instead of adding.
  const [setScore, setSetScore] = useState(false);

  const buildTarget = (): ModTarget => {
    switch (kind) {
      case 'ability':
        return { kind: 'ability', ability };
      case 'save':
        return ability === ('ALL' as AbilityKey) ? { kind: 'save' } : { kind: 'save', ability };
      case 'skill':
        return skill ? { kind: 'skill', skill } : { kind: 'skill' };
      case 'attack':
        return { kind: 'attack' };
      case 'ac':
        return { kind: 'ac' };
      case 'initiative':
        return { kind: 'initiative' };
    }
  };

  const add = () => {
    if (slot && !canAddSlot) return;
    const m: SheetModifier = {
      id: newId(),
      source: source.trim() || defaultSource || 'Modifier',
      target: buildTarget(),
      value,
      ...(allowSlot && slot ? { slot: true } : {}),
      ...(kind === 'ability' && setScore ? { set: true } : {}),
    };
    onChange([...modifiers, m]);
    setValue(1);
    setSource('');
    setSlot(false);
    setSetScore(false);
  };

  const remove = (id: string) => onChange(modifiers.filter((m) => m.id !== id));

  // "Ability score" and "Saving throw" need an ability picker; saves also allow All.
  const showAbility = kind === 'ability' || kind === 'save';
  const showSkill = kind === 'skill';

  return (
    <div className="mod-editor">
      {modifiers.length === 0 && <p className="muted">No effects.</p>}
      <ul className="mod-list">
        {modifiers.map((m) => (
          <li key={m.id} className="mod-row">
            <span
              className="mod-val"
              title={m.set ? 'Sets the score (a floor — inert if already higher)' : undefined}
            >
              {m.set ? `=${m.value}` : m.value >= 0 ? `+${m.value}` : m.value}
            </span>
            <span className="mod-target">{targetLabel(m.target)}</span>
            <span className="mod-source muted">{m.source}</span>
            {m.slot && <span className="mod-slot" title="Counts as a feat/ASI">⊛</span>}
            {editable && (
              <button className="res-x" title="Remove" onClick={() => remove(m.id)}>
                ✕
              </button>
            )}
          </li>
        ))}
      </ul>
      {editable && (
        <div className="mod-add">
          <select value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
            {KINDS.map((k) => (
              <option key={k.kind} value={k.kind}>
                {k.label}
              </option>
            ))}
          </select>
          {showAbility && (
            <select value={ability} onChange={(e) => setAbility(e.target.value as AbilityKey)}>
              {ABILITIES.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
              {kind === 'save' && <option value="ALL">All</option>}
            </select>
          )}
          {showSkill && (
            <select value={skill} onChange={(e) => setSkill(e.target.value)}>
              <option value="">All skills</option>
              {SKILLS.map((s) => (
                <option key={s.name} value={s.name}>
                  {s.name}
                </option>
              ))}
            </select>
          )}
          {kind === 'ability' && (
            <select
              value={setScore ? 'set' : 'bonus'}
              onChange={(e) => setSetScore(e.target.value === 'set')}
              title='"+ bonus" adds to the score; "= set to" floors it at the value (Gauntlets of Ogre Power)'
            >
              <option value="bonus">+ bonus</option>
              <option value="set">= set to</option>
            </select>
          )}
          <input
            type="number"
            className="mod-value"
            value={value}
            onChange={(e) => setValue(Number(e.target.value))}
            title={setScore && kind === 'ability' ? 'The score the ability becomes' : 'Bonus (can be negative)'}
          />
          <input
            className="mod-src-input"
            placeholder={defaultSource || 'Source'}
            value={source}
            onChange={(e) => setSource(e.target.value)}
          />
          {allowSlot && (
            <label className="mod-slot-check" title="Counts against the feat/ASI cap">
              <input
                type="checkbox"
                checked={slot}
                onChange={(e) => setSlot(e.target.checked)}
              />
              ASI/feat
            </label>
          )}
          <button
            className="btn tiny"
            disabled={slot && !canAddSlot}
            title={slot && !canAddSlot ? 'Feat/ASI cap reached' : 'Add effect'}
            onClick={add}
          >
            + Add
          </button>
        </div>
      )}
    </div>
  );
}
