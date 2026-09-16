import { useEffect, useId, useRef, useState } from 'react';
import type { Character } from '../../../shared/types';
import { useStore } from '../state/socket';
import './orb-resource-dock.css';

/** The player's existing manual row-creation controls, hosted by their sheet. */
export function PlayerResourceRowEditor({ character }: { character: Character }) {
  const setResource = useStore((s) => s.setResource);
  const [adding, setAdding] = useState(false);
  const [group, setGroup] = useState<'resources' | 'spellSlots'>('resources');
  const [name, setName] = useState('');
  const [maximum, setMaximum] = useState('1');
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const element = dialog.current;
    if (adding) element?.showModal();
    return () => element?.close();
  }, [adding]);
  const newKey = group === 'spellSlots' ? name || 'L1' : name.trim();
  const exists = Object.hasOwn(character[group], newKey);
  return <>
    <button type="button" className="btn tiny" onClick={() => setAdding(true)} title="Add a custom resource or spell-slot row">+ Row</button>
    {adding && <dialog
      ref={dialog}
      className="player-resource-row-dialog fantasy-window"
      aria-labelledby={titleId}
      onCancel={(event) => { event.preventDefault(); event.stopPropagation(); setAdding(false); }}
      onClick={(event) => { if (event.target === dialog.current) setAdding(false); }}
    >
      <form
        className="player-resource-row-editor"
        aria-label="Add resource row"
        onSubmit={(event) => {
          event.preventDefault();
          const max = Number(maximum);
          if (!newKey || exists || !maximum.trim() || !Number.isSafeInteger(max) || max < 0) return;
          setResource({ characterId: character.id, group, key: newKey, max, used: 0, preserveMax: true });
          setAdding(false);
          setName('');
        }}
      >
        <div className="hud-heading">
          <strong id={titleId}>Add a resource row</strong>
          <button className="btn tiny" type="button" onClick={() => setAdding(false)}>Cancel</button>
        </div>
        <label>Kind<select value={group} onChange={(event) => { setGroup(event.target.value as typeof group); setName(''); }}>
          <option value="resources">Custom resource</option>
          <option value="spellSlots">Spell slots</option>
        </select></label>
        {group === 'resources'
          ? <label>Name<input autoFocus required value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Rune charges" /></label>
          : <label>Spell level<select value={name || 'L1'} onChange={(event) => setName(event.target.value)}>
            {Array.from({ length: 9 }, (_, index) => <option key={index} value={`L${index + 1}`}>Level {index + 1}</option>)}
          </select></label>}
        <label>Maximum<input required type="number" min="0" step="1" value={maximum} onChange={(event) => setMaximum(event.target.value)} /></label>
        {exists && <p role="status">This row already exists. Use its label to edit it.</p>}
        <button className="btn" disabled={exists || !newKey}>Add row</button>
        <p className="muted">No fixed row limit. Custom rows remain available from the orb's resource icon. Adding a row does not add new automation.</p>
      </form>
    </dialog>}
  </>;
}
