import { useRef, useState } from 'react';
import type { Monster, StateSnapshot, Token, TokenKind } from '../../../shared/types';
import { useStore } from '../state/socket';
import { resolveToken } from '../lib/entities';

type Props = {
  snapshot: StateSnapshot;
  pending: { kind: 'pc' | 'monster'; refId: string } | null;
  onPickSpawn: (kind: 'pc' | 'monster', refId: string) => void;
  selectedTokenId: string | null;
  onSelectToken: (token: Token) => void;
};

export function DmPanel({
  snapshot,
  pending,
  onPickSpawn,
  selectedTokenId,
  onSelectToken,
}: Props) {
  const selectMap = useStore((s) => s.selectMap);
  const setActiveMap = useStore((s) => s.setActiveMap);
  const createMonster = useStore((s) => s.createMonster);
  const setInitiative = useStore((s) => s.setInitiative);
  const rollAllInitiative = useStore((s) => s.rollAllInitiative);
  const nextTurn = useStore((s) => s.nextTurn);
  const clearInitiative = useStore((s) => s.clearInitiative);
  const copyTokens = useStore((s) => s.copyTokens);
  const fileRef = useRef<HTMLInputElement>(null);
  const [mapName, setMapName] = useState('');
  const [slides, setSlides] = useState('');
  const [monName, setMonName] = useState('');
  const [monHp, setMonHp] = useState(10);
  const [copyFrom, setCopyFrom] = useState('');
  const [busy, setBusy] = useState(false);

  const upload = async (body: FormData) => {
    setBusy(true);
    try {
      await fetch(`/api/sessions/${snapshot.sessionCode}/maps`, {
        method: 'POST',
        body,
      });
      setMapName('');
      setSlides('');
      if (fileRef.current) fileRef.current.value = '';
    } finally {
      setBusy(false);
    }
  };

  const uploadImage = () => {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('image', file);
    if (mapName) fd.append('name', mapName);
    upload(fd);
  };

  const addSlides = () => {
    if (!slides) return;
    const fd = new FormData();
    fd.append('slidesUrl', slides);
    if (mapName) fd.append('name', mapName);
    upload(fd);
  };

  const monsters = snapshot.monsters as Monster[];
  const viewMap = snapshot.map;
  const otherMaps = snapshot.maps.filter((m) => m.id !== viewMap?.id);

  // Tokens on the viewed map, ordered for initiative (rolled first, desc).
  const orderedTokens = [...snapshot.tokens].sort((a, b) => {
    if (a.initiative === null && b.initiative === null) return 0;
    if (a.initiative === null) return 1;
    if (b.initiative === null) return -1;
    return b.initiative - a.initiative;
  });

  const bring = (kinds: TokenKind[]) => {
    if (copyFrom && viewMap) copyTokens(copyFrom, viewMap.id, kinds);
  };

  return (
    <div className="panel">
      <div className="panel-section">
        <h3>Maps</h3>
        <div className="map-list">
          {snapshot.maps.map((m) => (
            <div
              key={m.id}
              className={`map-row ${snapshot.map?.id === m.id ? 'viewing' : ''}`}
            >
              <button className="map-thumb-btn" onClick={() => selectMap(m.id)}>
                {m.imagePath ? (
                  <img className="map-thumb" src={m.imagePath} alt="" />
                ) : (
                  <span className="map-thumb placeholder">▦</span>
                )}
                <span className="map-thumb-name">
                  {m.name}
                  {m.id === snapshot.activeMapId && (
                    <span className="badge">LIVE</span>
                  )}
                </span>
              </button>
              {m.id !== snapshot.activeMapId && (
                <button className="btn tiny" onClick={() => setActiveMap(m.id)}>
                  Make active
                </button>
              )}
            </div>
          ))}
          {snapshot.maps.length === 0 && <p className="muted">No maps yet.</p>}
        </div>

        <input
          placeholder="Map name (optional)"
          value={mapName}
          onChange={(e) => setMapName(e.target.value)}
        />
        <input type="file" accept="image/*" ref={fileRef} />
        <button className="btn" disabled={busy} onClick={uploadImage}>
          Upload image map
        </button>
        <div className="slides-row">
          <input
            placeholder="Google Slides URL"
            value={slides}
            onChange={(e) => setSlides(e.target.value)}
          />
          <button className="btn" disabled={busy} onClick={addSlides}>
            Add
          </button>
        </div>

        {viewMap && otherMaps.length > 0 && (
          <div className="carry-row">
            <h4>Bring tokens to this map</h4>
            <select value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)}>
              <option value="">From map…</option>
              {otherMaps.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
            <div className="carry-btns">
              <button
                className="btn tiny"
                disabled={!copyFrom}
                onClick={() => bring(['pc'])}
              >
                PCs
              </button>
              <button
                className="btn tiny"
                disabled={!copyFrom}
                onClick={() => bring(['monster'])}
              >
                Monsters
              </button>
              <button
                className="btn tiny"
                disabled={!copyFrom}
                onClick={() => bring(['pc', 'monster'])}
              >
                All
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="panel-section">
        <h3>Spawn</h3>
        {pending && (
          <p className="hint">
            Click the map to place — place several, then press Esc or click the
            unit again to stop.
          </p>
        )}
        <h4>Player characters</h4>
        {snapshot.characters.map((c) => (
          <button
            key={c.id}
            className={`spawn-row ${pending?.refId === c.id ? 'picked' : ''}`}
            onClick={() => onPickSpawn('pc', c.id)}
          >
            {c.name} <span className="muted">{c.className}</span>
          </button>
        ))}

        <h4>Monsters</h4>
        {monsters.map((m) => (
          <button
            key={m.id}
            className={`spawn-row ${pending?.refId === m.id ? 'picked' : ''}`}
            onClick={() => onPickSpawn('monster', m.id)}
          >
            {m.name} <span className="muted">{m.curHp}/{m.maxHp} hp</span>
          </button>
        ))}
        <div className="add-monster">
          <input
            placeholder="Monster name"
            value={monName}
            onChange={(e) => setMonName(e.target.value)}
          />
          <input
            type="number"
            value={monHp}
            onChange={(e) => setMonHp(Number(e.target.value))}
          />
          <button
            className="btn"
            onClick={() => {
              if (monName.trim()) {
                createMonster(monName.trim(), monHp);
                setMonName('');
              }
            }}
          >
            Add monster
          </button>
        </div>
      </div>

      <div className="panel-section">
        <div className="init-header">
          <h3>Initiative</h3>
          <div className="init-actions">
            <button className="btn tiny" onClick={rollAllInitiative}>
              Roll all
            </button>
            <button className="btn tiny" onClick={nextTurn}>
              Next ▸
            </button>
            <button className="btn tiny" onClick={clearInitiative}>
              Clear
            </button>
          </div>
        </div>
        {orderedTokens.map((t) => {
          const d = resolveToken(snapshot, t);
          const isTurn = t.id === snapshot.activeTurnTokenId;
          return (
            <div
              key={t.id}
              className={`init-row ${t.id === selectedTokenId ? 'sel' : ''} ${
                isTurn ? 'turn' : ''
              }`}
              onClick={() => onSelectToken(t)}
            >
              <input
                className="init-input"
                type="number"
                value={t.initiative ?? ''}
                placeholder="–"
                onClick={(e) => e.stopPropagation()}
                onChange={(e) =>
                  setInitiative(
                    t.id,
                    e.target.value === '' ? null : Number(e.target.value),
                  )
                }
              />
              <span className="init-name">
                {isTurn && '▸ '}
                {d.name}
              </span>
              {d.curHp !== undefined && (
                <span className="muted">
                  {d.curHp}/{d.maxHp}
                </span>
              )}
            </div>
          );
        })}
        {snapshot.tokens.length === 0 && <p className="muted">No tokens placed.</p>}
      </div>
    </div>
  );
}
