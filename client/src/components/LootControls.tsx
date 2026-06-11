import { useEffect, useState } from 'react';
import type {
  InventoryItem,
  LibraryItem,
  LootContents,
  StateSnapshot,
} from '../../../shared/types';
import { useStore } from '../state/socket';

const newItemId = () => crypto.randomUUID?.() ?? String(Date.now() + Math.random());

/**
 * Loot inside an object (chest/treasure pile). The DM stocks it with gold + items;
 * anyone holding a character (a player's own, or the DM picking a recipient) can
 * take loot into that character's inventory + purse. Players only ever see this
 * once the container is opened — the server gates `loot` in `visibility.ts`.
 */
export function LootControls({
  snapshot,
  monsterId,
  loot,
  editable,
  reveal,
}: {
  snapshot: StateSnapshot;
  monsterId: string;
  loot: LootContents | undefined;
  editable: boolean;
  /** Creature loot only: a DM toggle to reveal the corpse's loot to players
   *  (takeable once the creature is also dead). Omitted for objects. */
  reveal?: { revealed: boolean; dead: boolean; onToggle: () => void };
}) {
  const setLoot = useStore((s) => s.setLoot);
  const notify = useStore((s) => s.notify);
  const takeLoot = useStore((s) => s.takeLoot);
  const socketId = useStore((s) => s.socket?.id);

  const [name, setName] = useState('');
  const [qty, setQty] = useState(1);
  const [gold, setGold] = useState(0);
  const [picker, setPicker] = useState(false);
  const [query, setQuery] = useState('');
  const [lib, setLib] = useState<LibraryItem[]>([]);
  const [shownNote, setShownNote] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiBusy, setAiBusy] = useState(false);

  // Who receives the loot: a player takes to their own claimed PC; the DM picks.
  const myCharacter = snapshot.characters.find((c) => c.claimedBy === socketId);
  const claimable = snapshot.characters;
  const [target, setTarget] = useState('');
  const targetId = editable
    ? target || claimable[0]?.id || ''
    : myCharacter?.id ?? '';

  useEffect(() => {
    if (!picker) return;
    let live = true;
    fetch(`/api/library/items?q=${encodeURIComponent(query)}`)
      .then((r) => r.json())
      .then((d) => live && setLib(Array.isArray(d) ? d : []))
      .catch(() => live && setLib([]));
    return () => {
      live = false;
    };
  }, [picker, query]);

  const items: InventoryItem[] = loot?.items ?? [];
  const goldHeld = loot?.gold ?? 0;
  const empty = goldHeld <= 0 && items.length === 0;

  // DM editing: rebuild the whole loot object and push it.
  const write = (next: LootContents) => setLoot(monsterId, next);
  const addItem = (n: string, q: number, note = '') => {
    if (!n.trim()) return;
    write({
      gold: goldHeld,
      items: [...items, { id: newItemId(), name: n.trim(), qty: q, note }],
    });
  };
  const removeLootItem = (id: string) =>
    write({ gold: goldHeld, items: items.filter((i) => i.id !== id) });
  const changeGold = (v: number) => write({ gold: Math.max(0, v), items });

  if (!editable && empty) return null;

  return (
    <div className="loot-controls">
      <div className="loot-head">
        <span className="loot-title">💰 Loot</span>
        {goldHeld > 0 && <span className="loot-gold">{goldHeld} gp</span>}
      </div>
      {editable && reveal && (
        <label className="loot-reveal" title="Players can search the body once it's revealed AND dead">
          <input type="checkbox" checked={reveal.revealed} onChange={reveal.onToggle} />
          Revealed to players
          {!reveal.dead && <span className="muted"> · only lootable once dead</span>}
        </label>
      )}

      {empty ? (
        <p className="muted">{editable ? 'Empty — add gold or items below.' : 'Empty.'}</p>
      ) : (
        <ul className="loot-list">
          {items.map((it) => (
            <li key={it.id} className="loot-row">
              <span className="item-name">
                {it.name}
                {it.qty > 1 && <span className="muted"> ×{it.qty}</span>}
                {it.note && (
                  <button
                    className="item-info"
                    title="Show description"
                    onClick={() => setShownNote(shownNote === it.id ? null : it.id)}
                  >
                    ⓘ
                  </button>
                )}
              </span>
              {shownNote === it.id && it.note && (
                <span className="item-note muted">{it.note}</span>
              )}
              {targetId && (
                <button
                  className="btn tiny"
                  title="Move this into the character's inventory"
                  onClick={() => takeLoot({ monsterId, characterId: targetId, itemId: it.id })}
                >
                  Take
                </button>
              )}
              {editable && (
                <button className="res-x" title="Remove" onClick={() => removeLootItem(it.id)}>
                  ✕
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Recipient + take-all / take-gold actions (player = own PC; DM picks). */}
      {targetId && !empty && (
        <div className="loot-take">
          {editable && claimable.length > 1 && (
            <select value={targetId} onChange={(e) => setTarget(e.target.value)} title="Recipient">
              {claimable.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
          {goldHeld > 0 && (
            <button
              className="btn tiny"
              onClick={() => takeLoot({ monsterId, characterId: targetId, gold: goldHeld })}
            >
              Take {goldHeld} gp
            </button>
          )}
          <button
            className="btn tiny"
            onClick={() => takeLoot({ monsterId, characterId: targetId, all: true })}
          >
            Take all
          </button>
        </div>
      )}

      {editable && (
        <div className="loot-edit">
          <label className="loot-gold-edit">
            Gold
            <input
              type="number"
              min={0}
              value={gold || goldHeld}
              onChange={(e) => setGold(Math.max(0, Number(e.target.value)))}
              onBlur={() => changeGold(gold)}
            />
          </label>
          <div className="item-add">
            <input placeholder="Item name" value={name} onChange={(e) => setName(e.target.value)} />
            <input
              type="number"
              min={1}
              value={qty}
              onChange={(e) => setQty(Math.max(1, Number(e.target.value)))}
            />
            <button
              className="btn tiny"
              disabled={!name.trim()}
              onClick={() => {
                addItem(name, qty, note);
                setName('');
                setQty(1);
                setNote('');
              }}
            >
              + Add
            </button>
            <button className="btn tiny" onClick={() => setPicker((p) => !p)}>
              {picker ? 'Close' : 'Library'}
            </button>
          </div>
          <input
            className="item-desc-input"
            placeholder="Description (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <div className="item-ai">
            <input
              placeholder="✨ Describe an item for AI to create…"
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
            />
            <button
              className="btn tiny"
              disabled={aiBusy || !aiPrompt.trim()}
              onClick={async () => {
                setAiBusy(true);
                try {
                  const res = await fetch('/api/items/generate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ prompt: aiPrompt.trim() }),
                  });
                  if (!res.ok) {
                    notify(
                      res.status === 503
                        ? 'AI is unavailable (set a Gemini key in Settings).'
                        : 'Could not generate an item.',
                    );
                    return;
                  }
                  const it = await res.json();
                  addItem(it.name, it.qtyDefault ?? 1, it.description ?? '');
                  setAiPrompt('');
                } finally {
                  setAiBusy(false);
                }
              }}
            >
              {aiBusy ? '…' : '✨ Generate'}
            </button>
          </div>
          {picker && (
            <div className="item-library">
              <input
                autoFocus
                className="item-search"
                placeholder="Search the item library…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <div className="item-picker">
                {lib.length === 0 && (
                  <p className="muted">{query.trim() ? 'No matches.' : 'Library is empty.'}</p>
                )}
                {lib.map((li) => (
                  <button
                    key={li.id}
                    className="suggest-row"
                    onClick={() => addItem(li.name, li.qtyDefault, li.description)}
                    title="Add to this container"
                  >
                    {li.name}
                    <span className="muted">×{li.qtyDefault}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
