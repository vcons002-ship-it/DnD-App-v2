import { useEffect, useRef, useState } from 'react';
import type { MapPopup, ShopItem, StateSnapshot } from '../../../shared/types';
import { useStore } from '../state/socket';

/**
 * The popup that opens when a clickable map decal (a "shop") is clicked. Players
 * see it read-only (title + note + priced items); the DM gets inline editing
 * (title/note + add/remove items) that live-saves, plus "Remove shop". Which
 * decal is open is held in the store (`decalPopupId`); the lock toggle on the
 * map decides whether a DM click opens this (locked) or drags the decal.
 */
export function DecalPopup({ snapshot }: { snapshot: StateSnapshot }) {
  const id = useStore((s) => s.decalPopupId);
  const setOpen = useStore((s) => s.openDecalPopup);
  const save = useStore((s) => s.setDecalPopup);
  const notify = useStore((s) => s.notify);
  const isDm = snapshot.role === 'dm';
  const ann = id ? snapshot.annotations.find((a) => a.id === id) : null;

  const [draft, setDraft] = useState<MapPopup | null>(null);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Seed the DM's editable draft once when a decal is opened (not on every
  // snapshot echo, so live edits aren't clobbered).
  useEffect(() => {
    if (id && isDm) {
      const existing = snapshot.annotations.find((a) => a.id === id)?.popup;
      setDraft(existing ? structuredClone(existing) : { title: 'Shop', items: [] });
    } else {
      setDraft(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isDm]);

  if (!id || !ann) return null;
  // Players only ever see a decal that actually has a popup.
  if (!isDm && !ann.popup) return null;

  const commit = (next: MapPopup) => {
    setDraft(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => save(id, next), 300);
  };
  const flushAndClose = () => {
    if (timer.current) clearTimeout(timer.current);
    if (isDm && draft) save(id, draft); // ensure the last edit persists
    setOpen(null);
  };
  const patchItem = (i: number, patch: Partial<ShopItem>) => {
    if (!draft) return;
    const items = draft.items.map((it, idx) => (idx === i ? { ...it, ...patch } : it));
    commit({ ...draft, items });
  };

  const data = isDm ? draft : ann.popup!;

  // AI-fill: ask the server to stock the shop from a description, then APPEND
  // the returned items to the draft (ids assigned on save by sanitizePopup).
  const aiFill = async () => {
    if (!draft || aiBusy || !aiPrompt.trim()) return;
    setAiBusy(true);
    try {
      const res = await fetch('/api/shops/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: aiPrompt.trim() }),
      });
      if (!res.ok) {
        notify(
          res.status === 503
            ? 'AI is unavailable (set a Gemini key in Settings).'
            : 'Could not generate a shop.',
        );
        return;
      }
      const { items } = (await res.json()) as { items: Omit<ShopItem, 'id'>[] };
      const withIds: ShopItem[] = items.map((it) => ({
        ...it,
        id: crypto.randomUUID?.() ?? String(Date.now() + Math.random()),
      }));
      commit({ ...draft, items: [...draft.items, ...withIds] });
      setAiPrompt('');
    } finally {
      setAiBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={flushAndClose}>
      <div className="modal decal-popup" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          {isDm ? (
            <input
              className="decal-title-edit"
              value={draft?.title ?? ''}
              placeholder="Shop name"
              onChange={(e) => draft && commit({ ...draft, title: e.target.value })}
            />
          ) : (
            <h3>🛒 {data?.title || 'Shop'}</h3>
          )}
          <button className="btn tiny" onClick={flushAndClose}>
            ✕
          </button>
        </div>

        {isDm ? (
          <textarea
            className="decal-note-edit"
            placeholder="Note / flavor (optional)"
            value={draft?.note ?? ''}
            onChange={(e) => draft && commit({ ...draft, note: e.target.value || undefined })}
          />
        ) : (
          data?.note && <p className="muted decal-note">{data.note}</p>
        )}

        <table className="decal-items">
          <thead>
            <tr>
              <th>Item</th>
              <th className="num">Price</th>
              {isDm || (data?.items ?? []).some((i) => i.qty != null) ? <th className="num">Qty</th> : null}
              <th>Notes</th>
              {isDm && <th />}
            </tr>
          </thead>
          <tbody>
            {(data?.items ?? []).map((it, i) =>
              isDm ? (
                <tr key={it.id}>
                  <td><input value={it.name} placeholder="name" onChange={(e) => patchItem(i, { name: e.target.value })} /></td>
                  <td className="num"><input className="px" value={it.price} placeholder="15 gp" onChange={(e) => patchItem(i, { price: e.target.value })} /></td>
                  <td className="num"><input className="qx" type="number" value={it.qty ?? ''} placeholder="∞" onChange={(e) => patchItem(i, { qty: e.target.value === '' ? undefined : Number(e.target.value) })} /></td>
                  <td><input value={it.note ?? ''} placeholder="—" onChange={(e) => patchItem(i, { note: e.target.value || undefined })} /></td>
                  <td>
                    <button className="res-x" title="Remove item" onClick={() => draft && commit({ ...draft, items: draft.items.filter((_, idx) => idx !== i) })}>✕</button>
                  </td>
                </tr>
              ) : (
                <tr key={it.id}>
                  <td>{it.name}</td>
                  <td className="num">{it.price}</td>
                  {(data?.items ?? []).some((q) => q.qty != null) ? <td className="num">{it.qty ?? '∞'}</td> : null}
                  <td className="muted">{it.note ?? ''}</td>
                </tr>
              ),
            )}
            {(data?.items ?? []).length === 0 && (
              <tr><td colSpan={isDm ? 5 : 3} className="muted">No items yet.</td></tr>
            )}
          </tbody>
        </table>

        {isDm && draft && (
          <div className="item-ai decal-ai">
            <input
              placeholder="✨ Describe a shop for AI to stock…"
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && aiFill()}
            />
            <button className="btn tiny" disabled={aiBusy || !aiPrompt.trim()} onClick={aiFill}>
              {aiBusy ? '…' : '✨ AI fill'}
            </button>
          </div>
        )}

        {isDm && draft && (
          <div className="dice-quick decal-actions">
            <button
              className="btn tiny"
              onClick={() => commit({ ...draft, items: [...draft.items, { id: crypto.randomUUID?.() ?? String(Date.now()), name: '', price: '' }] })}
            >
              + Add item
            </button>
            <button
              className="btn tiny red"
              title="Remove this shop popup from the decal (the art stays)"
              onClick={() => { save(id, null); setOpen(null); }}
            >
              Remove shop
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
