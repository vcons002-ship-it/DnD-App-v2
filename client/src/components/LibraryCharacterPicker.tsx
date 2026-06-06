import { useEffect, useState } from 'react';
import type { LibraryCharacter } from '../../../shared/types';
import { useStore } from '../state/socket';

/**
 * "Load saved character" picker: searches the cross-session character library
 * and loads the chosen sheet into this session. A player loads with `claim` so
 * the new PC is immediately theirs; the DM loads it unclaimed.
 */
export function LibraryCharacterPicker({ claim }: { claim?: boolean }) {
  const loadCharacterFromLibrary = useStore((s) => s.loadCharacterFromLibrary);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<LibraryCharacter[]>([]);

  useEffect(() => {
    if (!open) return;
    let live = true;
    fetch(`/api/library/characters?q=${encodeURIComponent(q)}`)
      .then((r) => r.json())
      .then((d) => live && setHits(Array.isArray(d) ? d : []))
      .catch(() => live && setHits([]));
    return () => {
      live = false;
    };
  }, [q, open]);

  return (
    <div className="lib-char-picker">
      <button className="btn tiny" onClick={() => setOpen((o) => !o)}>
        {open ? 'Close' : '📂 Load saved character'}
      </button>
      {open && (
        <div className="weapon-picker">
          <input
            autoFocus
            placeholder="Search saved characters…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <div className="item-picker">
            {hits.map((c) => (
              <button
                key={c.name}
                className="suggest-row"
                onClick={() => {
                  loadCharacterFromLibrary(c.name, claim);
                  setOpen(false);
                  setQ('');
                }}
              >
                {c.name}
                <span className="muted">
                  {c.race || '—'} · {c.className || '—'} · Lvl {c.level}
                </span>
              </button>
            ))}
            {hits.length === 0 && (
              <p className="muted spell-none">
                {q.trim() ? 'No match.' : 'No saved characters yet.'}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
