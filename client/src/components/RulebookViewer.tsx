import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../state/socket';

type Chunk = { title: string; text: string; page?: number; pageEnd?: number };

/**
 * Read/search the uploaded rulebook — a manual backup reference, opened from the
 * toolbar or by clicking a page citation on an assistant answer. Loads the full
 * chunk list once and filters client-side; jumps to a page when asked.
 */
export function RulebookViewer() {
  const view = useStore((s) => s.rulebookView);
  const close = useStore((s) => s.closeRulebook);
  const [doc, setDoc] = useState<{ name: string; chunks: Chunk[] } | null>(null);
  const [q, setQ] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const open = view !== null;

  useEffect(() => {
    if (!open || doc) return;
    fetch('/api/rulebook/content')
      .then((r) => r.json())
      .then((d) => setDoc(d))
      .catch(() => setDoc(null));
  }, [open, doc]);

  // Escape closes the reader.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  const results = useMemo(() => {
    if (!doc) return [];
    const terms = q.toLowerCase().split(/\s+/).filter((t) => t.length >= 2);
    if (terms.length === 0) return doc.chunks;
    return doc.chunks.filter((c) => {
      const hay = `${c.title} ${c.text}`.toLowerCase();
      return terms.every((t) => hay.includes(t));
    });
  }, [doc, q]);

  const targetPage = view?.page;
  // The first result at/after the cited page — highlighted and scrolled into view.
  const targetIdx = useMemo(() => {
    if (targetPage == null || q) return -1;
    return results.findIndex((c) => c.page != null && c.page >= targetPage);
  }, [results, targetPage, q]);

  useEffect(() => {
    if (!open || targetIdx < 0) return;
    listRef.current?.querySelector(`#rb-idx-${targetIdx}`)?.scrollIntoView({ block: 'start' });
  }, [open, targetIdx]);

  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={close}>
      <div className="modal rulebook-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>📖 {doc?.name ?? 'Rulebook'}</h3>
          <button className="btn tiny" onClick={close}>
            ✕
          </button>
        </div>
        <input
          className="rulebook-search"
          placeholder="Search the rulebook…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoFocus
        />
        {!doc ? (
          <p className="muted">Loading…</p>
        ) : results.length === 0 ? (
          <p className="muted">No matches.</p>
        ) : (
          <div className="rulebook-list" ref={listRef}>
            {results.map((c, i) => {
              const pg = c.page;
              return (
                <div
                  key={i}
                  id={`rb-idx-${i}`}
                  className={`rulebook-chunk${i === targetIdx ? ' target' : ''}`}
                >
                  <div className="rulebook-chunk-head">
                    {pg != null && (
                      <span className="rulebook-page">
                        p.{pg}
                        {c.pageEnd && c.pageEnd !== pg ? `–${c.pageEnd}` : ''}
                      </span>
                    )}
                    <span className="rulebook-title">{c.title}</span>
                  </div>
                  <p className="rulebook-text">{c.text}</p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
