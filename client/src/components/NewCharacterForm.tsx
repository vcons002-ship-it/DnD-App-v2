import { useState } from 'react';
import { useStore } from '../state/socket';

const ABILITIES = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'];

/** Collapsible "new character" form, used by both the DM and player panels. */
export function NewCharacterForm() {
  const createCharacter = useStore((s) => s.createCharacter);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [race, setRace] = useState('');
  const [className, setClassName] = useState('');
  const [maxHp, setMaxHp] = useState(10);
  const [stats, setStats] = useState<Record<string, number>>({});

  const reset = () => {
    setName('');
    setRace('');
    setClassName('');
    setMaxHp(10);
    setStats({});
    setOpen(false);
  };

  if (!open) {
    return (
      <button className="btn tiny" onClick={() => setOpen(true)}>
        + New character
      </button>
    );
  }

  const submit = () => {
    if (!name.trim()) return;
    createCharacter({ name, race, className, maxHp, stats });
    reset();
  };

  return (
    <div className="new-char-form">
      <input
        placeholder="Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        autoFocus
      />
      <div className="new-char-row">
        <input
          placeholder="Race"
          value={race}
          onChange={(e) => setRace(e.target.value)}
        />
        <input
          placeholder="Class"
          value={className}
          onChange={(e) => setClassName(e.target.value)}
        />
        <label className="mini">
          HP
          <input
            type="number"
            value={maxHp}
            onChange={(e) => setMaxHp(Number(e.target.value))}
          />
        </label>
      </div>
      <div className="sb-abilities">
        {ABILITIES.map((a) => (
          <label key={a} className="sb-ability sb-ability-edit">
            <div className="sb-ab-name">{a}</div>
            <input
              type="number"
              value={stats[a] ?? ''}
              onChange={(e) =>
                setStats({ ...stats, [a]: Number(e.target.value) })
              }
            />
          </label>
        ))}
      </div>
      <div className="new-char-actions">
        <button
          className="btn tiny green"
          onClick={submit}
          disabled={!name.trim()}
        >
          Create
        </button>
        <button className="btn tiny" onClick={reset}>
          Cancel
        </button>
      </div>
    </div>
  );
}
