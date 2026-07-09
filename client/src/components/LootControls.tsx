import { useEffect, useState } from 'react';
import type {
  InventoryItem,
  LibraryItem,
  LootContents,
  Monster,
  SheetModifier,
  StateSnapshot,
} from '../../../shared/types';
import { targetLabel } from '../../../shared/modifiers';
import { apiFetch } from '../lib/api';
import { useStore } from '../state/socket';
import { ItemLibrarySaveDialog, type SaveableItem } from './ItemLibrarySaveDialog';
import { ModifierEditor } from './ModifierEditor';

const newItemId = () => crypto.randomUUID?.() ?? String(Date.now() + Math.random());

/** One-line summary of an item's magic effects, e.g. "+1 AC, STR = 19". */
const fxSummary = (mods?: SheetModifier[]): string | undefined =>
  mods && mods.length
    ? `Magic effects: ${mods
        .map((m) =>
          m.set
            ? `${targetLabel(m.target)} = ${m.value}`
            : `${m.value >= 0 ? '+' : ''}${m.value} ${targetLabel(m.target)}`,
        )
        .join(', ')}`
    : undefined;

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
  // Gold edit draft: null = not editing (show the live value). Tracking a draft
  // (instead of a number defaulting to 0) means focus+blur without typing can't
  // accidentally zero the container.
  const [goldDraft, setGoldDraft] = useState<string | null>(null);
  const [picker, setPicker] = useState(false);
  const [query, setQuery] = useState('');
  const [lib, setLib] = useState<LibraryItem[]>([]);
  const [shownNote, setShownNote] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  // The loot item being saved to the library (custom or AI-added; null = none).
  const [saveTo, setSaveTo] = useState<SaveableItem | null>(null);
  // Bumped after a library save so an open picker refetches and shows it.
  const [libRefresh, setLibRefresh] = useState(0);
  // The loot item whose magic-effects editor is open (by id; null = none).
  const [fxId, setFxId] = useState<string | null>(null);

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
  }, [picker, query, libRefresh]);

  const items: InventoryItem[] = loot?.items ?? [];
  const goldHeld = loot?.gold ?? 0;
  const empty = goldHeld <= 0 && items.length === 0;

  // DM editing rebuilds the whole loot object, so always start from the LATEST
  // container state (not render-time props): an async path (AI generate) or a
  // blur handler could otherwise resurrect items a player took in the meantime.
  const freshLoot = (): LootContents => {
    const m = useStore
      .getState()
      .snapshot?.monsters.find((x) => x.id === monsterId) as Monster | undefined;
    return { gold: m?.loot?.gold ?? 0, items: m?.loot?.items ?? [] };
  };
  const addItem = (n: string, q: number, note = '', modifiers?: SheetModifier[]) => {
    if (!n.trim()) return;
    const cur = freshLoot();
    setLoot(monsterId, {
      gold: cur.gold,
      items: [
        ...cur.items,
        {
          id: newItemId(),
          name: n.trim(),
          qty: q,
          note,
          // Library/AI magic effects ride into the container and onward to the
          // looter's inventory (active once they equip the item).
          ...(modifiers && modifiers.length ? { modifiers } : {}),
        },
      ],
    });
  };
  const removeLootItem = (id: string) => {
    const cur = freshLoot();
    setLoot(monsterId, { gold: cur.gold, items: cur.items.filter((i) => i.id !== id) });
  };
  const changeGold = (v: number) =>
    setLoot(monsterId, { gold: Math.max(0, v), items: freshLoot().items });
  // DM edits a loot item's magic effects in place (e.g. tweak an AI item's
  // bonuses BEFORE a player loots it).
  const setItemMods = (id: string, modifiers: SheetModifier[]) => {
    const cur = freshLoot();
    setLoot(monsterId, {
      gold: cur.gold,
      items: cur.items.map((i) =>
        i.id === id
          ? { ...i, ...(modifiers.length ? { modifiers } : { modifiers: undefined }) }
          : i,
      ),
    });
  };
  const fxItem = items.find((i) => i.id === fxId) ?? null;

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
                {/* ✦ effects: the DM can open the editor (also on plain items, to
                    ADD effects); players just see the count + summary. */}
                {editable ? (
                  <button
                    className={`item-fx${(it.modifiers?.length ?? 0) > 0 ? ' has-fx' : ''}`}
                    title={fxSummary(it.modifiers) ?? 'Edit magic effects'}
                    onClick={() => setFxId(it.id)}
                  >
                    ✦{(it.modifiers?.length ?? 0) > 0 ? it.modifiers!.length : ''}
                  </button>
                ) : (
                  (it.modifiers?.length ?? 0) > 0 && (
                    <span className="lib-fx" title={fxSummary(it.modifiers)}>
                      {' '}✦{it.modifiers!.length}
                    </span>
                  )
                )}
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
                <button
                  className="item-save"
                  title="Save to item library"
                  onClick={() =>
                    setSaveTo({
                      name: it.name,
                      description: it.note ?? '',
                      qtyDefault: Math.max(1, it.qty), // a run-down stack still saves a usable default
                      modifiers: it.modifiers,
                    })
                  }
                >
                  💾
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
              value={goldDraft ?? String(goldHeld)}
              onChange={(e) => setGoldDraft(e.target.value)}
              onBlur={() => {
                if (goldDraft === null) return; // untouched — write nothing
                const v = Math.max(0, Math.round(Number(goldDraft) || 0));
                setGoldDraft(null);
                if (v !== goldHeld) changeGold(v);
              }}
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
                  const res = await apiFetch('/api/items/generate', {
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
                  addItem(it.name, it.qtyDefault ?? 1, it.description ?? '', it.modifiers);
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
                    onClick={() => addItem(li.name, li.qtyDefault, li.description, li.modifiers)}
                    title="Add to this container"
                  >
                    {li.name}
                    {(li.modifiers?.length ?? 0) > 0 && (
                      <span className="lib-fx" title="Has magic effects"> ✦{li.modifiers!.length}</span>
                    )}
                    <span className="muted">×{li.qtyDefault}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {saveTo && (
        <ItemLibrarySaveDialog
          item={saveTo}
          onClose={() => setSaveTo(null)}
          onSaved={() => setLibRefresh((n) => n + 1)}
        />
      )}

      {fxItem && editable && (
        <div className="popover-backdrop spellbook-backdrop" onClick={() => setFxId(null)}>
          <div className="item-desc-window" onClick={(e) => e.stopPropagation()}>
            <div className="item-desc-head">
              <h4>✦ {fxItem.name} — effects</h4>
              <button className="res-x" title="Close" onClick={() => setFxId(null)}>
                ✕
              </button>
            </div>
            <p className="muted">
              These ride with the item into the looter's inventory and apply once
              it's equipped/attuned.
            </p>
            <ModifierEditor
              modifiers={fxItem.modifiers ?? []}
              onChange={(mods) => setItemMods(fxItem.id, mods)}
              editable
              defaultSource={fxItem.name}
            />
          </div>
        </div>
      )}
    </div>
  );
}
