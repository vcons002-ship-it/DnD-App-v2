import { useEffect, useRef, useState } from 'react';
import type {
  CreatureTemplate,
  Monster,
  StateSnapshot,
  Token,
  TokenKind,
} from '../../../shared/types';
import { useStore } from '../state/socket';
import { resolveToken } from '../lib/entities';
import { NewCharacterForm } from './NewCharacterForm';
import { TemplateEditor } from './TemplateEditor';

/** Show emoji icons inline; image-path icons get a placeholder glyph. */
const iconText = (icon: string): string =>
  icon.startsWith('/') || icon.startsWith('http') ? '🖼️' : icon;

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
  const deleteMap = useStore((s) => s.deleteMap);
  const createMonster = useStore((s) => s.createMonster);
  const deleteMonster = useStore((s) => s.deleteMonster);
  const setGlobalAiBusy = useStore((s) => s.setAiBusy);
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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [copyFrom, setCopyFrom] = useState('');
  const [busy, setBusy] = useState(false);
  // Creature search (SRD autofill + optional AI lookup).
  const [suggest, setSuggest] = useState<CreatureTemplate[]>([]);
  const [aiAvailable, setAiAvailable] = useState(false);
  const [tmpl, setTmpl] = useState<CreatureTemplate | null>(null);
  const [aiBusy, setAiBusy] = useState(false);

  // Debounced SRD search as the DM types a monster name.
  useEffect(() => {
    const t = setTimeout(() => {
      fetch(`/api/creatures?q=${encodeURIComponent(monName)}`)
        .then((r) => r.json())
        .then((d) => {
          setSuggest(d.results ?? []);
          setAiAvailable(!!d.aiAvailable);
        })
        .catch(() => setSuggest([]));
    }, 150);
    return () => clearTimeout(t);
  }, [monName]);

  const applyTemplate = (t: CreatureTemplate) => {
    setTmpl(t);
    setMonName(t.name);
    setMonHp(t.maxHp);
    setSuggest([]);
  };

  const aiFill = async () => {
    if (!monName.trim()) return;
    setAiBusy(true);
    setGlobalAiBusy(true); // show the shared "AI is working…" banner
    try {
      const res = await fetch('/api/creatures/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: monName.trim() }),
      });
      if (res.ok) applyTemplate(await res.json());
    } finally {
      setAiBusy(false);
      setGlobalAiBusy(false);
    }
  };

  const addMonster = () => {
    if (!monName.trim()) return;
    createMonster({
      name: monName.trim(),
      maxHp: monHp,
      creatureType: tmpl?.creatureType,
      level: tmpl?.level,
      armorClass: tmpl?.armorClass,
      speed: tmpl?.speed,
      stats: tmpl?.stats,
      resistances: tmpl?.resistances,
      weaknesses: tmpl?.weaknesses,
      actions: tmpl?.actions,
      abilities: tmpl?.abilities,
      weapons: tmpl?.weapons,
      icon: tmpl?.icon,
      source: tmpl?.source ?? 'manual',
    });
    setMonName('');
    setTmpl(null);
  };

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

  // One spawn button per creature template (placement makes numbered instances).
  const monsters = snapshot.monsterTemplates as Monster[];
  const viewMap = snapshot.map;
  const otherMaps = snapshot.maps.filter((m) => m.id !== viewMap?.id);

  // Tokens on the viewed map, ordered for initiative (rolled first, desc).
  const orderedTokens = [...snapshot.tokens].sort((a, b) => {
    if (a.initiative === null && b.initiative === null) return 0;
    if (a.initiative === null) return 1;
    if (b.initiative === null) return -1;
    return b.initiative - a.initiative;
  });
  // 1-based turn order for tokens that have rolled.
  const rankOf = new Map<string, number>();
  orderedTokens
    .filter((t) => t.initiative !== null)
    .forEach((t, i) => rankOf.set(t.id, i + 1));

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
              <button
                className="btn tiny danger"
                title="Delete this map (removes its tokens)"
                onClick={() => {
                  if (
                    confirm(
                      `Delete map "${m.name}"? Its token placements will be removed. This cannot be undone.`,
                    )
                  )
                    deleteMap(m.id);
                }}
              >
                ✕
              </button>
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
        <div className="new-char-wrap">
          <NewCharacterForm />
        </div>

        <h4>Monsters</h4>
        {pending?.kind === 'monster' && (
          <p className="hint">Click the map to drop a numbered instance.</p>
        )}
        {monsters.map((m) => (
          <div key={m.id}>
            <div className="spawn-line">
              <button
                className={`spawn-row ${pending?.refId === m.id ? 'picked' : ''}`}
                onClick={() => onPickSpawn('monster', m.id)}
                title="Select, then click the map to place"
              >
                {m.icon && <span className="spawn-icon">{iconText(m.icon)}</span>}
                {m.name} <span className="muted">{m.maxHp} hp</span>
              </button>
              <button
                className={`btn tiny ${editingId === m.id ? 'on' : ''}`}
                title="Adjust stats / image before placing"
                onClick={() =>
                  setEditingId((cur) => (cur === m.id ? null : m.id))
                }
              >
                Edit
              </button>
              <button
                className="btn tiny"
                title="Remove this spawn button"
                onClick={() => deleteMonster(m.id)}
              >
                ✕
              </button>
            </div>
            {editingId === m.id && <TemplateEditor monster={m} />}
          </div>
        ))}
        {monsters.length === 0 && (
          <p className="muted">No creatures yet — add one below.</p>
        )}

        <div className="add-monster">
          <div className="creature-search">
            <textarea
              className="creature-desc"
              placeholder="Search SRD, or describe a creature for AI — e.g. 'goblin with a longbow', 'orc fighter with a halberd'"
              value={monName}
              onChange={(e) => {
                setMonName(e.target.value);
                setTmpl(null); // manual edit drops the autofilled stat block
              }}
            />
            {suggest.length > 0 &&
              monName.trim() &&
              !(tmpl && tmpl.name === monName) && (
              <div className="suggest">
                {suggest.map((s) => (
                  <button
                    key={s.name}
                    className="suggest-row"
                    onClick={() => applyTemplate(s)}
                  >
                    <span className="spawn-icon">{s.icon}</span>
                    {s.name}
                    <span className="muted">
                      {s.maxHp} hp · {s.creatureType}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="add-monster-row">
            <label className="mini">
              HP
              <input
                type="number"
                value={monHp}
                onChange={(e) => setMonHp(Number(e.target.value))}
              />
            </label>
            <button className="btn" onClick={addMonster}>
              Add creature
            </button>
            {aiAvailable && (
              <button className="btn" disabled={aiBusy} onClick={aiFill}>
                {aiBusy ? '✨…' : '✨ AI'}
              </button>
            )}
          </div>
          {tmpl && (
            <p className="hint">
              Autofilled from {tmpl.source.toUpperCase()}: {tmpl.creatureType}
            </p>
          )}
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
              <span className="init-order" title="Turn order">
                {rankOf.get(t.id) ?? '–'}
              </span>
              <input
                className="init-input"
                type="number"
                value={t.initiative ?? ''}
                placeholder="roll"
                title="Initiative roll"
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
