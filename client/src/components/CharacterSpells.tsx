import { useEffect, useState } from 'react';
import type { Character, SheetAbility } from '../../../shared/types';
import { useStore } from '../state/socket';

type SpellHit = Omit<SheetAbility, 'id'>;

/** Short tag line for an entry, e.g. "Cantrip · Evocation" or "Lvl 3 · Fire". */
function tagFor(a: SheetAbility): string {
  const bits: string[] = [];
  if (a.type === 'spell') {
    bits.push(a.level === 0 ? 'Cantrip' : `Lvl ${a.level ?? '?'}`);
  }
  if (a.school) bits.push(a.school);
  if (a.roll?.damageType) bits.push(a.roll.damageType);
  return bits.join(' · ');
}

/** Label for the roll button based on what the roll does. */
function rollLabel(roll: NonNullable<SheetAbility['roll']>): string {
  switch (roll.kind) {
    case 'attack':
      return '🎲 Attack';
    case 'heal':
      return '🎲 Heal';
    case 'save':
      return '🎲 Damage (save)';
    default:
      return '🎲 Damage';
  }
}

/** Does this entry support an upcast level selector (leveled, scaling roll)? */
const upcastable = (a: SheetAbility): boolean =>
  !!a.roll?.scaleDice && (a.roll.baseLevel ?? 0) >= 1;

/**
 * A character's spells & abilities: each is collapsible (name + tag + a roll
 * button that resolves server-side and lands in the shared roll log). Leveled
 * spells get an upcast selector. Owners/DM can add from the local rules database
 * (with an AI fallback) and remove entries.
 */
export function CharacterSpells({
  character,
  editable,
}: {
  character: Character;
  editable: boolean;
}) {
  const setSheetAbility = useStore((s) => s.setSheetAbility);
  const removeSheetAbility = useStore((s) => s.removeSheetAbility);
  const rollAbility = useStore((s) => s.rollAbility);

  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [castLevel, setCastLevel] = useState<Record<string, number>>({});
  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<SpellHit[]>([]);
  const [aiAvail, setAiAvail] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);

  useEffect(() => {
    if (!adding) return;
    let live = true;
    fetch(`/api/spells?q=${encodeURIComponent(q)}`)
      .then((r) => r.json())
      .then((d) => {
        if (!live) return;
        setResults(d.results ?? []);
        setAiAvail(!!d.aiAvailable);
      })
      .catch(() => live && setResults([]));
    return () => {
      live = false;
    };
  }, [q, adding]);

  if (character.sheetAbilities.length === 0 && !editable) return null;

  const add = (e: SpellHit) => {
    setSheetAbility(character.id, {
      ...e,
      id: crypto.randomUUID?.() ?? String(Date.now()),
    });
    setAdding(false);
    setQ('');
  };

  const askAI = async () => {
    if (!q.trim() || aiBusy) return;
    setAiBusy(true);
    try {
      const r = await fetch('/api/spells/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: q.trim() }),
      });
      if (r.ok) add(await r.json());
    } catch {
      /* network/AI errors fail quietly — local search still works */
    } finally {
      setAiBusy(false);
    }
  };

  const doRoll = (a: SheetAbility) =>
    rollAbility({
      characterId: character.id,
      abilityId: a.id,
      castLevel: upcastable(a) ? castLevel[a.id] ?? a.roll?.baseLevel : undefined,
    });

  return (
    <div className="spells">
      <h4>Spells &amp; Abilities</h4>
      {character.sheetAbilities.length === 0 && (
        <p className="muted">None yet.</p>
      )}
      <ul className="spell-list">
        {character.sheetAbilities.map((a) => {
          const lvl = castLevel[a.id] ?? a.roll?.baseLevel ?? 1;
          return (
            <li key={a.id} className="spell-entry">
              <div className="spell-head">
                <button
                  className="spell-toggle"
                  onClick={() => setOpen((o) => ({ ...o, [a.id]: !o[a.id] }))}
                  title="Show details"
                >
                  <span className="spell-caret">{open[a.id] ? '▾' : '▸'}</span>
                  <span className="spell-name">{a.name}</span>
                  {tagFor(a) && <span className="muted spell-tag">{tagFor(a)}</span>}
                </button>
                {editable && a.roll && upcastable(a) && (
                  <select
                    className="spell-level"
                    value={lvl}
                    title="Cast at level (upcast)"
                    onChange={(e) =>
                      setCastLevel((c) => ({ ...c, [a.id]: Number(e.target.value) }))
                    }
                  >
                    {Array.from({ length: 9 - (a.roll.baseLevel ?? 1) + 1 }).map(
                      (_, i) => {
                        const v = (a.roll!.baseLevel ?? 1) + i;
                        return (
                          <option key={v} value={v}>
                            L{v}
                          </option>
                        );
                      },
                    )}
                  </select>
                )}
                {editable && a.roll && (
                  <button className="btn tiny" onClick={() => doRoll(a)}>
                    {rollLabel(a.roll)}
                  </button>
                )}
                {editable && (
                  <button
                    className="res-x"
                    title="Remove"
                    onClick={() => removeSheetAbility(character.id, a.id)}
                  >
                    ✕
                  </button>
                )}
              </div>
              {open[a.id] && (
                <div className="spell-body">
                  {a.meta && <p className="muted spell-meta">{a.meta}</p>}
                  <p>{a.description}</p>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {editable && (
        <>
          <button className="btn tiny" onClick={() => setAdding((p) => !p)}>
            {adding ? 'Close' : '+ Add spell / ability'}
          </button>
          {adding && (
            <div className="spell-add">
              <input
                autoFocus
                placeholder="Search e.g. Fireball, Cure Wounds…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
              <div className="item-picker">
                {results.map((r) => (
                  <button
                    key={r.name}
                    className="suggest-row"
                    onClick={() => add(r)}
                    title={r.description}
                  >
                    {r.name}
                    <span className="muted">{tagFor(r as SheetAbility) || r.type}</span>
                  </button>
                ))}
                {results.length === 0 && q.trim() && !aiBusy && (
                  <p className="muted spell-none">
                    No local match.{' '}
                    {aiAvail
                      ? 'Try AI lookup below.'
                      : 'Add a Gemini API key in Settings to use AI lookup.'}
                  </p>
                )}
              </div>
              {q.trim() && aiAvail && (
                <button className="btn tiny" disabled={aiBusy} onClick={askAI}>
                  {aiBusy ? 'Asking AI…' : `✨ Ask AI for "${q.trim()}"`}
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
