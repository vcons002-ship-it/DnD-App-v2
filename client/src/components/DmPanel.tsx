import { useRef, useState } from 'react';
import type { Monster, StateSnapshot, Token } from '../../../shared/types';
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
  const fileRef = useRef<HTMLInputElement>(null);
  const [mapName, setMapName] = useState('');
  const [slides, setSlides] = useState('');
  const [monName, setMonName] = useState('');
  const [monHp, setMonHp] = useState(10);
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
              <button className="link" onClick={() => selectMap(m.id)}>
                {m.name}
                {m.id === snapshot.activeMapId && <span className="badge">LIVE</span>}
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
      </div>

      <div className="panel-section">
        <h3>Spawn</h3>
        {pending && (
          <p className="hint">Click the map to place the selected unit.</p>
        )}
        <h4>Player characters</h4>
        {snapshot.characters.map((c) => (
          <button
            key={c.id}
            className={`spawn-row ${
              pending?.refId === c.id ? 'picked' : ''
            }`}
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
        <h3>On this map</h3>
        {snapshot.tokens.map((t) => {
          const d = resolveToken(snapshot, t);
          return (
            <div
              key={t.id}
              className={`init-row ${t.id === selectedTokenId ? 'sel' : ''}`}
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
              <span className="init-name">{d.name}</span>
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
