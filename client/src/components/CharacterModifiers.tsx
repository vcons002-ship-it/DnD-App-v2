import { useState } from 'react';
import type { Character, SheetModifier } from '../../../shared/types';
import { useStore } from '../state/socket';
import { ModifierEditor } from './ModifierEditor';
import { featUsage } from '../../../shared/feats';
import { targetLabel } from '../../../shared/modifiers';
import { searchFeats, type FeatDef } from '../../../shared/featLibrary';

const newId = () => crypto.randomUUID?.() ?? String(Date.now() + Math.random());

/** "+2 STR", "+1 STR · +1 DEX", "=19 STR", "+1 all saves" … */
const effectLabel = (m: SheetModifier) =>
  `${m.set ? `=${m.value}` : m.value >= 0 ? `+${m.value}` : m.value} ${targetLabel(m.target)}`;

/** A draft feat/ASI being added or edited (committed only on Save). */
type Draft = {
  /** The source name being EDITED (null when adding fresh) — used to replace it. */
  editing: string | null;
  name: string;
  mods: SheetModifier[];
};

/**
 * Feats & ASIs: a character's permanent build choices (ASI, Resilient, racial
 * bonuses). Compact list by default; "+ Add feat / ASI" opens a picker that
 * searches a feat library and AUTOFILLS the effect, which you can tweak and then
 * Save. Every entry counts as one feat/ASI use (grouped by source), HARD-capped
 * by the level-based slot count. Lives inside the sheet's Traits & Feats box.
 */
export function CharacterModifiers({
  character,
  editable,
}: {
  character: Character;
  editable: boolean;
}) {
  const updateCharacter = useStore((s) => s.updateCharacter);
  const mods = character.modifiers ?? [];
  const [draft, setDraft] = useState<Draft | null>(null);
  const [query, setQuery] = useState('');

  if (mods.length === 0 && !editable) return null;
  const u = featUsage(character);
  const atCap = u.used >= u.cap;

  // Group the flat modifier list into entries by source (one feat/ASI = one
  // source, however many effects it bundles).
  const order: string[] = [];
  const bySource = new Map<string, SheetModifier[]>();
  for (const m of mods) {
    if (!bySource.has(m.source)) {
      bySource.set(m.source, []);
      order.push(m.source);
    }
    bySource.get(m.source)!.push(m);
  }

  const startAdd = () =>
    setDraft({ editing: null, name: '', mods: [] });
  const startEdit = (source: string) =>
    setDraft({
      editing: source,
      name: source,
      mods: (bySource.get(source) ?? []).map((m) => ({ ...m })),
    });

  // Seed the draft from a library feat (overwrites the current draft effects).
  const pickFeat = (f: FeatDef) =>
    setDraft((d) =>
      d
        ? {
            ...d,
            name: f.name,
            mods: f.effects.map((e) => ({
              id: newId(),
              source: f.name,
              target: e.target,
              value: e.value,
              ...(e.set ? { set: true } : {}),
              slot: true,
            })),
          }
        : d,
    );

  const remove = (source: string) =>
    updateCharacter({
      characterId: character.id,
      modifiers: mods.filter((m) => m.source !== source),
    });

  const save = () => {
    if (!draft) return;
    const name = draft.name.trim() || 'Feat';
    // Every entry here is a feat/ASI slot.
    const entry = draft.mods.map((m) => ({ ...m, source: name, slot: true as const }));
    if (entry.length === 0) return;
    // Drop the old version of this entry (by its original source) AND any clash
    // with the new name, then append.
    const others = mods.filter(
      (m) => m.source !== draft.editing && m.source !== name,
    );
    updateCharacter({ characterId: character.id, modifiers: [...others, ...entry] });
    setDraft(null);
    setQuery('');
  };

  const results = searchFeats(query);

  return (
    <div className="char-modifiers">
      <div className="feat-head">
        <h4>Feats &amp; ASIs</h4>
        <span className={`feat-cap${u.used > u.cap ? ' over' : ''}`}>
          {u.used}/{u.cap}
          <span className="muted"> · L{character.level || 1}</span>
        </span>
      </div>

      {/* Compact list of entries (grouped by source). */}
      {order.length === 0 && !draft && (
        <p className="muted">No feats or ASIs.</p>
      )}
      <ul className="feat-list">
        {order.map((source) => (
          <li key={source} className="feat-entry">
            <span className="feat-name">{source}</span>
            <span className="feat-fx muted">
              {(bySource.get(source) ?? []).map(effectLabel).join(' · ')}
            </span>
            {editable && (
              <span className="feat-row-actions">
                <button className="btn tiny" title="Edit" onClick={() => startEdit(source)}>
                  ✎
                </button>
                <button className="res-x" title="Remove" onClick={() => remove(source)}>
                  ✕
                </button>
              </span>
            )}
          </li>
        ))}
      </ul>

      {editable && !draft && (
        <button
          className="btn tiny"
          disabled={atCap}
          title={atCap ? 'Feat/ASI cap reached for this level' : 'Add a feat or ASI'}
          onClick={startAdd}
        >
          + Add feat / ASI
        </button>
      )}

      {/* Add/Edit draft: pick a feat (autofills), tweak, Save. */}
      {editable && draft && (
        <div className="feat-draft">
          <input
            className="feat-name-input"
            placeholder="Feat / ASI name"
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            autoFocus
          />
          {/* Library picker (search → autofill). */}
          <input
            className="feat-search"
            placeholder="🔍 Search feats & ASIs to autofill…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="feat-picker">
            {results.length === 0 && <p className="muted">No matches.</p>}
            {results.map((f) => (
              <button
                key={f.name}
                type="button"
                className="feat-pick-row"
                title={f.description}
                onClick={() => pickFeat(f)}
              >
                <span className={`feat-pick-tag ${f.group === 'ASI' ? 'asi' : ''}`}>{f.group}</span>
                <span className="feat-pick-name">{f.name}</span>
                <span className="feat-pick-fx muted">
                  {f.effects.map((e) => effectLabel(e as SheetModifier)).join(' · ')}
                </span>
              </button>
            ))}
          </div>

          <p className="hint">Effects (edit as needed):</p>
          <ModifierEditor
            modifiers={draft.mods}
            onChange={(m) => setDraft({ ...draft, mods: m })}
            editable
            defaultSource={draft.name}
          />

          <div className="feat-draft-actions">
            <button
              className="btn tiny green"
              disabled={draft.mods.length === 0 || !draft.name.trim()}
              onClick={save}
            >
              Save
            </button>
            <button className="btn tiny" onClick={() => { setDraft(null); setQuery(''); }}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
