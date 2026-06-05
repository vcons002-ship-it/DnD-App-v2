import { useEffect, useState } from 'react';
import type { Character, LibraryItem } from '../../../shared/types';
import { useStore } from '../state/socket';

/** Per-character inventory: editable list + add free-form or from the library. */
export function CharacterItems({
  character,
  editable,
}: {
  character: Character;
  editable: boolean;
}) {
  const setItem = useStore((s) => s.setItem);
  const removeItem = useStore((s) => s.removeItem);
  const [name, setName] = useState('');
  const [qty, setQty] = useState(1);
  const [picker, setPicker] = useState(false);
  const [lib, setLib] = useState<LibraryItem[]>([]);

  useEffect(() => {
    if (!picker) return;
    fetch('/api/library/items')
      .then((r) => r.json())
      .then(setLib)
      .catch(() => setLib([]));
  }, [picker]);

  if (character.items.length === 0 && !editable) return null;

  const add = (n: string, q: number, note = '') => {
    if (!n.trim()) return;
    setItem(character.id, {
      id: crypto.randomUUID?.() ?? String(Date.now()),
      name: n.trim(),
      qty: q,
      note,
    });
  };
  const changeQty = (id: string, delta: number) => {
    const item = character.items.find((i) => i.id === id);
    if (item) setItem(character.id, { ...item, qty: Math.max(0, item.qty + delta) });
  };

  return (
    <div className="items">
      <h4>Items</h4>
      {character.items.length === 0 && <p className="muted">No items.</p>}
      <ul className="item-list">
        {character.items.map((it) => (
          <li key={it.id} className="item-row">
            <span className="item-name">{it.name}</span>
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
              Library
            </button>
          </div>
          {picker && (
            <div className="item-picker">
              {lib.length === 0 && <p className="muted">Library is empty.</p>}
              {lib.map((li) => (
                <button
                  key={li.id}
                  className="suggest-row"
                  onClick={() => add(li.name, li.qtyDefault, li.description)}
                  title={li.description}
                >
                  {li.name}
                  <span className="muted">×{li.qtyDefault}</span>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
