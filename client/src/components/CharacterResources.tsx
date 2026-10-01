import { useState, type ReactNode } from 'react';
import type { Character } from '../../../shared/types';
import { useStore } from '../state/socket';
import { hitDieFor, hitDiceLeft, isClassCounter, shortRestRecovery } from '../../../shared/rests';

type Counter = { max: number; used: number; recharge?: 'short' | 'long' };

/** Hit Dice: what's left (level − spent) and Spend buttons. The server rolls them
 *  on the physical dice and heals roll + CON per die (minimum 1). */
function HitDice({ character, editable }: { character: Character; editable: boolean }) {
  const spend = useStore((s) => s.spendHitDice);
  const [count, setCount] = useState(1);
  const die = hitDieFor(character.className);
  const total = Math.max(1, character.level);
  const left = hitDiceLeft(character);
  const full = character.curHp >= character.maxHp;
  const n = Math.min(count, Math.max(1, left));
  return (
    <div className="res-row hit-dice-row">
      <span className="res-name" title={`Hit Point Dice: one d${die} per level. Spend them to heal (roll + CON each); a Long Rest restores them all.`}>
        Hit Dice <span className="muted">d{die}</span>
      </span>
      <span className="res-count">{left}/{total}</span>
      {editable && (
        <span className="hit-dice-spend">
          {left > 1 && (
            <select aria-label="Hit Dice to spend" value={n} onChange={(e) => setCount(Number(e.target.value))}>
              {Array.from({ length: left }, (_, i) => i + 1).map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          )}
          <button
            type="button"
            className="btn tiny"
            disabled={left <= 0 || full}
            title={left <= 0 ? 'No Hit Dice left — a Long Rest restores them' : full ? 'Already at full HP' : `Roll ${n}d${die} + CON and heal`}
            onClick={() => spend(character.id, n)}
          >
            🎲 Spend {n}
          </button>
        </span>
      )}
    </div>
  );
}

/** The player HUD's compact Hit Dice control (beside conditions / lantern):
 *  "Hit Dice 3/5" opens a small spender with the same server roll. */
export function HitDiceHudControl({ character }: { character: Character }) {
  const spend = useStore((s) => s.spendHitDice);
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(1);
  const die = hitDieFor(character.className);
  const left = hitDiceLeft(character);
  const full = character.curHp >= character.maxHp;
  const n = Math.min(count, Math.max(1, left));
  return (
    <span className="hit-dice-hud">
      <button type="button" className="btn tiny" aria-expanded={open} aria-label={`Hit Dice: ${left} of ${Math.max(1, character.level)} d${die} left`}
        title="Spend Hit Dice to heal (roll + CON each); a Long Rest restores them" onClick={() => setOpen((o) => !o)}>
        Hit Dice {left}/{Math.max(1, character.level)}
      </button>
      {open && (
        <span className="hit-dice-hud-pop fantasy-window" role="group" aria-label="Spend Hit Dice">
          {left > 1 && (
            <select aria-label="Hit Dice to spend" value={n} onChange={(e) => setCount(Number(e.target.value))}>
              {Array.from({ length: left }, (_, i) => i + 1).map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          )}
          <button type="button" className="btn tiny" disabled={left <= 0 || full}
            title={left <= 0 ? 'No Hit Dice left — a Long Rest restores them' : full ? 'Already at full HP' : `Roll ${n}d${die} + CON and heal`}
            onClick={() => { spend(character.id, n); setOpen(false); }}>
            🎲 Spend {n}d{die}
          </button>
        </span>
      )}
    </span>
  );
}

/** Which rest refills a counter, as a chip. A custom (non-class) counter's chip
 *  toggles Short ↔ Long; class features follow their own 2024 rule. */
function RestChip({ name, counter, character, editable, onSet }: {
  name: string; counter: Counter; character: Character; editable: boolean; onSet: (r: 'short' | 'long') => void;
}) {
  const rule = shortRestRecovery(name, counter, character.className, character.level);
  const text = rule === 'all' ? 'short rest' : rule === 'one' ? '+1 short rest' : 'long rest';
  const custom = editable && !isClassCounter(name);
  return (
    <button
      type="button"
      className={`rest-chip rest-${rule}`}
      disabled={!custom}
      title={custom ? `Refills on a ${rule === 'all' ? 'Short' : 'Long'} Rest — click to change` : `Refills ${rule === 'all' ? 'fully on a Short Rest' : rule === 'one' ? 'one use per Short Rest, all on a Long Rest' : 'on a Long Rest'}`}
      onClick={() => onSet(rule === 'all' ? 'long' : 'short')}
    >
      {text}
    </button>
  );
}

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
 *  clickable pips and custom counters. Editable for the owner/DM. `compact`
 *  (the Combat section) keeps the pips spendable but hides the add/remove
 *  management, which stays on the character sheet. */
export function CharacterResources({
  character,
  editable,
  compact,
  managementControl,
  displayControl,
}: {
  character: Character;
  editable: boolean;
  compact?: boolean;
  /** Optional player-sheet presentation; the default owner/DM controls remain unchanged. */
  managementControl?: ReactNode;
  /** Optional browser-local player presentation settings; never shown for DM. */
  displayControl?: (resourceName: string) => ReactNode;
}) {
  const setResource = useStore((s) => s.setResource);
  const isDm = useStore((s) => s.snapshot?.role === 'dm');
  const restOne = useStore((s) => s.restCharacter);
  const [restConfirm, setRestConfirm] = useState<'short' | 'long' | null>(null);
  const [name, setName] = useState('');
  const [max, setMax] = useState(1);
  const [adding, setAdding] = useState(false);

  const slots = Object.entries(character.spellSlots).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  const resources = Object.entries(character.resources);

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
    setAdding(false);
  };

  return (
    <div className="resources">
      <div className="res-header">
        <h4>Resources</h4>
        {isDm && !compact && (restConfirm ? (
          <span className="res-rest">
            <button className="btn tiny primary" onClick={() => { restOne(character.id, restConfirm); setRestConfirm(null); }}>
              Confirm {restConfirm === 'short' ? 'Short' : 'Long'} Rest
            </button>
            <button className="btn tiny" onClick={() => setRestConfirm(null)}>Cancel</button>
          </span>
        ) : (
          <span className="res-rest">
            <button className="btn tiny" title={`${character.name} takes a Short Rest`} onClick={() => setRestConfirm('short')}>☕ Short</button>
            <button className="btn tiny" title={`${character.name} takes a Long Rest`} onClick={() => setRestConfirm('long')}>🏕 Long</button>
          </span>
        ))}
        {editable && !compact && (managementControl ?? (
          <button
            className="btn tiny"
            onClick={() => setAdding((p) => !p)}
            title="Add a custom counter (e.g. Rage uses, Ki points)"
          >
            {adding ? 'Close' : '+ Add'}
          </button>
        ))}
      </div>
      {editable && !compact && displayControl && <p className="resource-display-help">
        Show by orb: selected custom trackers fill free positions after spell slots and class resources, up to ten.
        Unchecked trackers stay in Additional resources. Saved per resource for this character in this browser.
      </p>}
      {editable && !compact && adding && (
        <div className="res-add">
          <input
            autoFocus
            placeholder="Counter name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addCustom()}
          />
          <input
            type="number"
            value={max}
            min={1}
            onChange={(e) => setMax(Math.max(1, Number(e.target.value)))}
          />
          <button className="btn tiny" onClick={addCustom} disabled={!name.trim()}>
            Add
          </button>
        </div>
      )}
      <div className="res-group">
        <HitDice character={character} editable={editable} />
      </div>
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

      {resources.length > 0 && (
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
              {!compact && (
                <RestChip name={key} counter={c} character={character} editable={editable}
                  onSet={(recharge) => setResource({ characterId: character.id, group: 'resources', key, recharge })} />
              )}
              {editable && !compact && displayControl?.(key)}
              {editable && !compact && (
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
        </div>
      )}
    </div>
  );
}
