import { useEffect, useMemo, useState } from 'react';
import type { SheetAbility } from '../../../shared/types';

type SpellHit = Omit<SheetAbility, 'id'>;

const LEVEL_LABEL = (lvl: number) => (lvl === 0 ? 'Cantrips' : `Level ${lvl}`);
const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Everything matched by the keyword box: name + school + classes + tags + type. */
function haystack(s: SpellHit): string {
  return [s.name, s.school, s.roll?.damageType, ...(s.classes ?? []), ...(s.tags ?? [])]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

/**
 * A large, browsable spellbook over the full local spell list. Filter by class,
 * search by keyword/tag, grouped and sorted by spell level. Adds to the open
 * character via the same path as the inline "+ Add" search. Spells already on the
 * sheet are marked. Pure client-side filtering over `GET /api/spells/all`.
 */
export function Spellbook({
  onAdd,
  onClose,
  ownedNames,
}: {
  onAdd: (s: SpellHit) => void;
  onClose: () => void;
  ownedNames: Set<string>;
}) {
  const [all, setAll] = useState<SpellHit[]>([]);
  const [q, setQ] = useState('');
  const [cls, setCls] = useState('all');
  const [open, setOpen] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let live = true;
    fetch('/api/spells/all')
      .then((r) => r.json())
      .then((d) => live && setAll(d.results ?? []))
      .catch(() => live && setAll([]));
    return () => {
      live = false;
    };
  }, []);

  // Classes actually present in the data, for the filter chips.
  const classes = useMemo(() => {
    const set = new Set<string>();
    for (const s of all) for (const c of s.classes ?? []) set.add(c);
    return [...set].sort();
  }, [all]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return all
      .filter((s) => (cls === 'all' ? true : (s.classes ?? []).includes(cls)))
      .filter((s) => (needle ? haystack(s).includes(needle) : true))
      .sort(
        (a, b) => (a.level ?? 0) - (b.level ?? 0) || a.name.localeCompare(b.name),
      );
  }, [all, q, cls]);

  // Group the filtered spells by level for level headers.
  const groups = useMemo(() => {
    const m = new Map<number, SpellHit[]>();
    for (const s of filtered) {
      const lvl = s.level ?? 0;
      (m.get(lvl) ?? m.set(lvl, []).get(lvl)!).push(s);
    }
    return [...m.entries()].sort((a, b) => a[0] - b[0]);
  }, [filtered]);

  return (
    <div className="popover-backdrop spellbook-backdrop" onClick={onClose}>
      <div className="spellbook" onClick={(e) => e.stopPropagation()}>
        <div className="spellbook-head">
          <h3>📖 Spellbook</h3>
          <span className="muted">{filtered.length} spells</span>
          <button className="res-x" title="Close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="spellbook-controls">
          <input
            autoFocus
            className="spellbook-search"
            placeholder="Search name or tag — e.g. fire, cantrip, control…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <select value={cls} onChange={(e) => setCls(e.target.value)} title="Filter by class">
            <option value="all">All classes</option>
            {classes.map((c) => (
              <option key={c} value={c}>
                {titleCase(c)}
              </option>
            ))}
          </select>
        </div>
        <div className="spellbook-list">
          {groups.length === 0 && <p className="muted">No spells match.</p>}
          {groups.map(([lvl, spells]) => (
            <div key={lvl} className="spellbook-group">
              <h4 className="spellbook-level">{LEVEL_LABEL(lvl)}</h4>
              {spells.map((s) => {
                const owned = ownedNames.has(s.name.toLowerCase());
                const isOpen = open[s.name];
                return (
                  <div key={s.name} className="spellbook-row">
                    <div className="spellbook-row-head">
                      <button
                        className="spell-toggle"
                        onClick={() => setOpen((o) => ({ ...o, [s.name]: !o[s.name] }))}
                        title="Show details"
                      >
                        <span className="spell-caret">{isOpen ? '▾' : '▸'}</span>
                        <span className="spell-name">{s.name}</span>
                        <span className="muted spell-tag">
                          {s.school}
                          {s.roll?.damageType ? ` · ${s.roll.damageType}` : ''}
                        </span>
                      </button>
                      <button
                        className={`btn tiny ${owned ? 'on' : ''}`}
                        disabled={owned}
                        onClick={() => onAdd(s)}
                        title={owned ? 'Already on the sheet' : 'Add to sheet'}
                      >
                        {owned ? '✓ Added' : '+ Add'}
                      </button>
                    </div>
                    {isOpen && (
                      <div className="spellbook-body">
                        {s.meta && <p className="muted spell-meta">{s.meta}</p>}
                        {(s.classes ?? []).length > 0 && (
                          <p className="muted spell-meta">
                            {(s.classes ?? []).map(titleCase).join(', ')}
                          </p>
                        )}
                        <p>{s.description}</p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
