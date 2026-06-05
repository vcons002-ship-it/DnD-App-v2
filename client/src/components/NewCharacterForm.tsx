import { useState } from 'react';
import { useStore } from '../state/socket';

const ABILITIES = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'];

/** Collapsible "new character" form, used by both the DM and player panels. */
export function NewCharacterForm() {
  const createCharacter = useStore((s) => s.createCharacter);
  const aiCreateCharacter = useStore((s) => s.aiCreateCharacter);
  const aiBusy = useStore((s) => s.aiBusy);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [race, setRace] = useState('');
  const [className, setClassName] = useState('');
  const [level, setLevel] = useState(1);
  const [maxHp, setMaxHp] = useState(10);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [desc, setDesc] = useState('');

  const reset = () => {
    setName('');
    setRace('');
    setClassName('');
    setLevel(1);
    setMaxHp(10);
    setStats({});
    setDesc('');
    setOpen(false);
  };

  const generate = () => {
    if (!desc.trim()) return;
    aiCreateCharacter(desc.trim());
    reset();
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
    createCharacter({ name, race, className, level, maxHp, stats });
    reset();
  };

  return (
    <div className="new-char-form">
      <label className="ai-gen-label">Describe a character / NPC for the AI</label>
      <textarea
        className="ai-desc"
        placeholder="e.g. grizzled dwarf cleric, level 5 — or — elf rogue archer with a shortbow"
        value={desc}
        onChange={(e) => setDesc(e.target.value)}
      />
      <button
        className="btn tiny ai-fill"
        disabled={!desc.trim() || aiBusy}
        onClick={generate}
      >
        {aiBusy ? '✨ …' : '✨ Generate with AI'}
      </button>
      <div className="entry-divider">— or enter manually —</div>
      <input
        placeholder="Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
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
          Lvl
          <input
            type="number"
            value={level}
            onChange={(e) => setLevel(Number(e.target.value))}
          />
        </label>
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
