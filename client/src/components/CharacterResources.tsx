import { useState } from 'react';
import type { Character } from '../../../shared/types';
import { useStore } from '../state/socket';

type Counter = { max: number; used: number };

function Pips({
  counter,
  editable,
  onChange,
}: {
  counter: Counter;
  editable: boolean;
  onChange: (used: number) => void;
}) {
  const remaining = counter.max - counter.used;
  return (
    <span className="pips">
      {Array.from({ length: counter.max }).map((_, i) => {
        const idx = i + 1; // 1-based
        const filled = idx <= remaining;
        return (
          <button
            key={idx}
            type="button"
            className={`pip ${filled ? 'on' : ''}`}
            disabled={!editable}
            onClick={() => {
              // Click a pip to spend down to it; click the boundary to free one.
              const next = idx === remaining ? idx - 1 : idx;
              onChange(counter.max - next);
            }}
          />
        );
      })}
    </span>
  );
}

/** Spell-slot + class-resource trackers (auto-filled from class/level) with
 *  clickable pips and custom counters. Editable for the owner/DM. */
export function CharacterResources({
  character,
  editable,
}: {
  character: Character;
  editable: boolean;
}) {
  const setResource = useStore((s) => s.setResource);
  const [name, setName] = useState('');
  const [max, setMax] = useState(1);

  const slots = Object.entries(character.spellSlots).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  const resources = Object.entries(character.resources);
  if (slots.length === 0 && resources.length === 0 && !editable) return null;

  const addCustom = () => {
    if (!name.trim()) return;
    setResource({
      characterId: character.id,
      group: 'resources',
      key: name.trim(),
      max,
      used: 0,
    });
    setName('');
    setMax(1);
  };

  return (
    <div className="resources">
      <h4>Resources</h4>
      {slots.length > 0 && (
        <div className="res-group">
          <div className="muted res-sub">Spell slots</div>
          {slots.map(([key, c]) => (
            <div key={key} className="res-row">
              <span className="res-name">{key.replace(/^L/, 'Lvl ')}</span>
              <Pips
                counter={c}
                editable={editable}
                onChange={(used) =>
                  setResource({ characterId: character.id, group: 'spellSlots', key, used })
                }
              />
              <span className="res-count muted">
                {c.max - c.used}/{c.max}
              </span>
            </div>
          ))}
        </div>
      )}

      {(resources.length > 0 || editable) && (
        <div className="res-group">
          {resources.map(([key, c]) => (
            <div key={key} className="res-row">
              <span className="res-name">{key}</span>
              <Pips
                counter={c}
                editable={editable}
                onChange={(used) =>
                  setResource({ characterId: character.id, group: 'resources', key, used })
                }
              />
              <span className="res-count muted">
                {c.max - c.used}/{c.max}
              </span>
              {editable && (
                <button
                  className="res-x"
                  title="Remove counter"
                  onClick={() =>
                    setResource({
                      characterId: character.id,
                      group: 'resources',
                      key,
                      remove: true,
                    })
                  }
                >
                  ✕
                </button>
              )}
            </div>
          ))}
          {editable && (
            <div className="res-add">
              <input
                placeholder="Counter name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <input
                type="number"
                value={max}
                min={1}
                onChange={(e) => setMax(Math.max(1, Number(e.target.value)))}
              />
              <button className="btn tiny" onClick={addCustom} disabled={!name.trim()}>
                + Add
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
