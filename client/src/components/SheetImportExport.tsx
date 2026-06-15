import { useState } from 'react';
import type { Character } from '../../../shared/types';
import {
  exportSheetJSON,
  parseSheet,
  type SheetPatch,
} from '../../../shared/sheetIO';
import { useStore } from '../state/socket';

/**
 * Import a character sheet from pasted plain text (any sheet — D&D Beyond,
 * Roll20, etc.) or our own JSON export, and export this character's full sheet
 * as JSON for clean round-tripping.
 *
 * Import OVERWRITES the fields you choose. The preview lists every recognized
 * section as a checkbox so you can apply only some (e.g. skip stats/skills, or
 * skip spells) — and "Only empty fields" leaves anything already filled alone.
 */

/** Friendly section labels for the recognized patch keys. */
const FIELD_LABELS: Record<string, string> = {
  name: 'Name',
  race: 'Race',
  className: 'Class',
  subclass: 'Subclass',
  level: 'Level',
  maxHp: 'Max HP',
  curHp: 'Current HP',
  armorClass: 'Armor Class',
  speed: 'Speed',
  stats: 'Ability scores',
  resistances: 'Resistances',
  weaknesses: 'Weaknesses',
  proficientSkills: 'Skill proficiencies',
  saveProficiencies: 'Saving throws',
  spellSlots: 'Spell slots',
  abilities: 'Features & traits',
  sheetAbilities: 'Spells & abilities',
  weapons: 'Weapons',
  items: 'Inventory',
  gold: 'Gold',
  modifiers: 'Feat / ASI bonuses',
  resources: 'Resources',
};

/** A short readable preview of a parsed value. */
function summarize(key: string, v: unknown): string {
  if (Array.isArray(v)) {
    const names = v.map((x) => (x as { name?: string })?.name).filter(Boolean) as string[];
    if (names.length) return `${v.length}: ${names.slice(0, 4).join(', ')}${names.length > 4 ? '…' : ''}`;
    const flat = v.map(String);
    return flat.slice(0, 6).join(', ') + (flat.length > 6 ? `, +${flat.length - 6}` : '');
  }
  if (v && typeof v === 'object') {
    if (key === 'stats') return Object.entries(v).map(([k, val]) => `${k} ${val}`).join('  ');
    return `${Object.keys(v).length} entr${Object.keys(v).length === 1 ? 'y' : 'ies'}`;
  }
  return String(v);
}

/** Does the character already have a non-empty value for this field? */
function isFilled(c: Character, key: string): boolean {
  const v = (c as unknown as Record<string, unknown>)[key];
  if (v == null) return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'object') return Object.keys(v).length > 0;
  if (typeof v === 'string') return v.trim().length > 0;
  if (typeof v === 'number') return v > 0;
  return !!v;
}

export function SheetImportExport({ character }: { character: Character }) {
  const updateCharacter = useStore((s) => s.updateCharacter);
  const [text, setText] = useState('');
  const [pending, setPending] = useState<SheetPatch | null>(null);
  const [included, setIncluded] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState('');

  const preview = () => {
    setMsg('');
    const patch = parseSheet(text);
    const keys = Object.keys(patch);
    if (keys.length === 0) {
      setPending(null);
      setMsg('Nothing recognized in that text.');
      return;
    }
    setPending(patch);
    setIncluded(new Set(keys)); // everything on by default
  };

  const toggle = (key: string) =>
    setIncluded((s) => {
      const next = new Set(s);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  const apply = () => {
    if (!pending || included.size === 0) return;
    const patch: SheetPatch = {};
    for (const k of Object.keys(pending)) {
      if (included.has(k)) (patch as Record<string, unknown>)[k] = (pending as Record<string, unknown>)[k];
    }
    updateCharacter({ characterId: character.id, ...patch });
    setMsg(`Imported ${included.size} section(s).`);
    setPending(null);
    setText('');
  };

  const doExport = async () => {
    const json = exportSheetJSON(character);
    try {
      await navigator.clipboard.writeText(json);
      setMsg('Copied JSON to clipboard.');
    } catch {
      setText(json);
      setMsg('Clipboard blocked — JSON placed in the box to copy.');
    }
  };

  const keys = pending ? Object.keys(pending) : [];

  return (
    <details className="sheet-io">
      <summary>Import / export sheet</summary>
      <textarea
        className="ai-desc"
        placeholder="Paste plain text (e.g. 'HP 25/30, AC 16, Wizard 5, STR 14…', skills, saves, feats, spells) or our JSON export"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setPending(null);
        }}
      />
      <div className="dice-quick">
        <button className="btn tiny" disabled={!text.trim()} onClick={preview}>
          Preview import
        </button>
        <button className="btn tiny" onClick={doExport}>
          Export JSON
        </button>
      </div>

      {pending && (
        <div className="import-confirm">
          <p className="hint">
            Pick the sections to import — checked sections <strong>overwrite</strong> the
            current value; unchecked ones are left as-is.
          </p>
          <div className="import-quick">
            <button className="btn tiny" onClick={() => setIncluded(new Set(keys))}>
              All
            </button>
            <button
              className="btn tiny"
              title="Only import sections the character doesn't already have"
              onClick={() => setIncluded(new Set(keys.filter((k) => !isFilled(character, k))))}
            >
              Only empty fields
            </button>
            <button className="btn tiny" onClick={() => setIncluded(new Set())}>
              None
            </button>
          </div>
          <ul className="import-fields">
            {keys.map((k) => (
              <li key={k}>
                <label className={isFilled(character, k) ? 'will-overwrite' : ''}>
                  <input
                    type="checkbox"
                    checked={included.has(k)}
                    onChange={() => toggle(k)}
                  />
                  <span className="import-field-label">{FIELD_LABELS[k] ?? k}</span>
                  <span className="muted import-field-val">
                    {summarize(k, (pending as Record<string, unknown>)[k])}
                    {isFilled(character, k) && <em title="The character already has a value here"> · replaces current</em>}
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <div className="dice-quick">
            <button className="btn tiny red" disabled={included.size === 0} onClick={apply}>
              Import {included.size} section(s)
            </button>
            <button className="btn tiny" onClick={() => setPending(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {msg && <p className="hint">{msg}</p>}
    </details>
  );
}
