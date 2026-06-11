import { useEffect, useState } from 'react';
import type { Character, InventoryItem, LibraryItem, SheetModifier } from '../../../shared/types';
import { useStore } from '../state/socket';
import { ModifierEditor } from './ModifierEditor';
import { ItemLibrarySaveDialog, type SaveableItem } from './ItemLibrarySaveDialog';

/** Per-character inventory: editable list + add free-form or from the searchable
 *  library. Each item can carry a description, viewable in a popup window. */
export function CharacterItems({
  character,
  editable,
}: {
  character: Character;
  editable: boolean;
}) {
  const setItem = useStore((s) => s.setItem);
  const removeItem = useStore((s) => s.removeItem);
  const updateCharacter = useStore((s) => s.updateCharacter);
  const [name, setName] = useState('');
  const [qty, setQty] = useState(1);
  const [picker, setPicker] = useState(false);
  const [query, setQuery] = useState('');
  const [lib, setLib] = useState<LibraryItem[]>([]);
  // The inventory item whose description window is open (null = none).
  const [desc, setDesc] = useState<{ name: string; note: string } | null>(null);
  // The inventory item whose magic-effects panel is open (by id; null = none).
  const [fxId, setFxId] = useState<string | null>(null);
  // The item being saved to the library (custom or AI-added; null = none).
  const [saveTo, setSaveTo] = useState<SaveableItem | null>(null);
  // Bumped after a library save so an open picker refetches and shows it.
  const [libRefresh, setLibRefresh] = useState(0);

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

  if (character.items.length === 0 && character.gold === 0 && !editable) return null;

  const add = (n: string, q: number, note = '', modifiers?: SheetModifier[]) => {
    if (!n.trim()) return;
    setItem(character.id, {
      id: crypto.randomUUID?.() ?? String(Date.now()),
      name: n.trim(),
      qty: q,
      note,
      // Library presets (e.g. Cloak of Protection's +1 AC / +1 saves) come along;
      // they stay dormant until the player equips the item.
      ...(modifiers && modifiers.length ? { modifiers } : {}),
    });
  };
  const changeQty = (id: string, delta: number) => {
    const item = character.items.find((i) => i.id === id);
    if (item) setItem(character.id, { ...item, qty: Math.max(0, item.qty + delta) });
  };
  const setMods = (it: InventoryItem, modifiers: SheetModifier[]) =>
    setItem(character.id, { ...it, modifiers });
  const toggleEquip = (it: InventoryItem) =>
    setItem(character.id, { ...it, equipped: !it.equipped });
  const fxItem = character.items.find((i) => i.id === fxId) ?? null;

  return (
    <div className="items">
      <h4>Inventory</h4>
      <div className="purse">
        <span className="purse-label">💰 Gold</span>
        {editable ? (
          <input
            type="number"
            min={0}
            className="purse-input"
            value={character.gold}
            onChange={(e) =>
              updateCharacter({ characterId: character.id, gold: Math.max(0, Number(e.target.value)) })
            }
          />
        ) : (
          <span>{character.gold}</span>
        )}
        <span className="muted">gp</span>
      </div>
      {character.items.length === 0 && <p className="muted">No items.</p>}
      <ul className="item-list">
        {character.items.map((it) => (
          <li key={it.id} className="item-row">
            <button
              className="item-info"
              title={it.note ? 'View description' : 'No description'}
              onClick={() => setDesc({ name: it.name, note: it.note ?? '' })}
            >
              ℹ️
            </button>
            <span className="item-name">{it.name}</span>
            {/* Magic effects: open the editor (editable) or a read-only view.
                A ✦ badge shows the modifier count; ⚔ marks an equipped item. */}
            {(editable || (it.modifiers?.length ?? 0) > 0) && (
              <button
                className={`item-fx${(it.modifiers?.length ?? 0) > 0 ? ' has-fx' : ''}`}
                title="Magic effects"
                onClick={() => setFxId(it.id)}
              >
                ✦{(it.modifiers?.length ?? 0) > 0 ? it.modifiers!.length : ''}
              </button>
            )}
            {(it.modifiers?.length ?? 0) > 0 && (
              <button
                className={`item-equip${it.equipped ? ' on' : ''}`}
                title={it.equipped ? 'Equipped (effects active)' : 'Not equipped'}
                onClick={() => editable && toggleEquip(it)}
                disabled={!editable}
              >
                {it.equipped ? '⚔' : '🛡'}
              </button>
            )}
            {editable ? (
              <span className="item-qty">
                <button className="qbtn" onClick={() => changeQty(it.id, -1)}>
                  −
                </button>
                <span>{it.qty}</span>
                <button className="qbtn" onClick={() => changeQty(it.id, +1)}>
                  +
                </button>
              </span>
            ) : (
              <span className="item-qty muted">×{it.qty}</span>
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
              <button
                className="res-x"
                title="Remove"
                onClick={() => removeItem(character.id, it.id)}
              >
                ✕
              </button>
            )}
          </li>
        ))}
      </ul>

      {editable && (
        <>
          <div className="item-add">
            <input placeholder="Item name" value={name} onChange={(e) => setName(e.target.value)} />
            <input
              type="number"
              value={qty}
              min={1}
              onChange={(e) => setQty(Math.max(1, Number(e.target.value)))}
            />
            <button
              className="btn tiny"
              disabled={!name.trim()}
              onClick={() => {
                add(name, qty);
                setName('');
                setQty(1);
              }}
            >
              + Add
            </button>
            <button className="btn tiny" onClick={() => setPicker((p) => !p)}>
              {picker ? 'Close' : 'Library'}
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
                  <p className="muted">
                    {query.trim() ? 'No matches.' : 'Library is empty.'}
                  </p>
                )}
                {lib.map((li) => (
                  <div key={li.id} className="lib-row">
                    <button
                      className="suggest-row"
                      onClick={() => add(li.name, li.qtyDefault, li.description, li.modifiers)}
                      title="Add to inventory"
                    >
                      {li.name}
                      {(li.modifiers?.length ?? 0) > 0 && (
                        <span className="lib-fx" title="Has magic effects"> ✦{li.modifiers!.length}</span>
                      )}
                      <span className="muted">×{li.qtyDefault}</span>
                    </button>
                    {li.description && (
                      <button
                        className="item-info"
                        title="View description"
                        onClick={() => setDesc({ name: li.name, note: li.description })}
                      >
                        ℹ️
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {desc && (
        <div className="popover-backdrop spellbook-backdrop" onClick={() => setDesc(null)}>
          <div className="item-desc-window" onClick={(e) => e.stopPropagation()}>
            <div className="item-desc-head">
              <h4>{desc.name}</h4>
              <button className="res-x" title="Close" onClick={() => setDesc(null)}>
                ✕
              </button>
            </div>
            <p>{desc.note || <span className="muted">No description for this item.</span>}</p>
          </div>
        </div>
      )}

      {fxItem && (
        <div className="popover-backdrop spellbook-backdrop" onClick={() => setFxId(null)}>
          <div className="item-desc-window" onClick={(e) => e.stopPropagation()}>
            <div className="item-desc-head">
              <h4>✦ {fxItem.name} — effects</h4>
              <button className="res-x" title="Close" onClick={() => setFxId(null)}>
                ✕
              </button>
            </div>
            <p className="muted">
              Effects apply only while the item is equipped/attuned.
            </p>
            {editable && (
              <label className="item-equip-row">
                <input
                  type="checkbox"
                  checked={!!fxItem.equipped}
                  onChange={() => toggleEquip(fxItem)}
                />
                Equipped / attuned
              </label>
            )}
            <ModifierEditor
              modifiers={fxItem.modifiers ?? []}
              onChange={(mods) => setMods(fxItem, mods)}
              editable={editable}
              defaultSource={fxItem.name}
            />
          </div>
        </div>
      )}

      {saveTo && (
        <ItemLibrarySaveDialog
          item={saveTo}
          onClose={() => setSaveTo(null)}
          onSaved={() => setLibRefresh((n) => n + 1)}
        />
      )}
    </div>
  );
}
