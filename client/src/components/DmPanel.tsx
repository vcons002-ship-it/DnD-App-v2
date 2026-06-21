import { useEffect, useRef, useState } from 'react';
import type {
  CreatureTemplate,
  Monster,
  ObjectKind,
  StateSnapshot,
  TokenKind,
} from '../../../shared/types';
import { useStore } from '../state/socket';
import { unsupportedImageReason } from '../lib/images';
import { useComfyAvailable, comfyGenerate } from '../lib/comfy';
import { NewCharacterForm } from './NewCharacterForm';
import { LibraryCharacterPicker } from './LibraryCharacterPicker';
import { ImportMapsDialog } from './ImportMapsDialog';
import { TemplateEditor } from './TemplateEditor';
import { EditableName } from './EditableName';

/** Show emoji icons inline; image-path icons get a placeholder glyph. */
const iconText = (icon: string): string =>
  icon.startsWith('/') || icon.startsWith('http') ? '🖼️' : icon;

type Props = {
  snapshot: StateSnapshot;
  pending: { kind: 'pc' | 'monster'; refId: string } | null;
  onPickSpawn: (kind: 'pc' | 'monster', refId: string) => void;
};

export function DmPanel({ snapshot, pending, onPickSpawn }: Props) {
  const selectMap = useStore((s) => s.selectMap);
  const setActiveMap = useStore((s) => s.setActiveMap);
  const deleteMap = useStore((s) => s.deleteMap);
  const renameMap = useStore((s) => s.renameMap);
  const createMonster = useStore((s) => s.createMonster);
  const deleteMonster = useStore((s) => s.deleteMonster);
  const deleteCharacter = useStore((s) => s.deleteCharacter);
  const unlockCharacter = useStore((s) => s.unlockCharacter);
  const setGlobalAiBusy = useStore((s) => s.setAiBusy);
  const notify = useStore((s) => s.notify);
  const copyTokens = useStore((s) => s.copyTokens);
  const fileRef = useRef<HTMLInputElement>(null);
  const [mapName, setMapName] = useState('');
  const [slides, setSlides] = useState('');
  const [importing, setImporting] = useState(false);
  // Local ComfyUI map generation.
  const comfyOk = useComfyAvailable();
  const [mapPrompt, setMapPrompt] = useState('');
  const [genMapBusy, setGenMapBusy] = useState(false);
  const [monName, setMonName] = useState('');
  const [monHp, setMonHp] = useState(10);
  // '' = a normal creature; otherwise a non-combat object (trap/door/chest/item).
  const [objectKind, setObjectKind] = useState<'' | ObjectKind>('');
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
    const name = monName.trim();
    if (!name) return;
    setAiBusy(true);
    setGlobalAiBusy(true); // show the shared "AI is working…" banner
    notify(`✨ Asking AI for "${name}"…`);
    try {
      const res = await fetch('/api/creatures/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (res.ok) {
        applyTemplate(await res.json());
        notify(`Filled "${name}" from AI/SRD.`);
      } else {
        const msg = await res.json().catch(() => null);
        notify(msg?.error ?? `No match for "${name}".`);
      }
    } catch {
      notify('AI lookup failed — check your connection. Offline search still works.');
    } finally {
      setAiBusy(false);
      setGlobalAiBusy(false);
    }
  };

  const addMonster = () => {
    // Objects don't need a typed name — fall back to the kind (e.g. "Chest") so
    // the DM can pick "Chest" and click straight away.
    const fallback = objectKind
      ? objectKind[0].toUpperCase() + objectKind.slice(1)
      : '';
    const name = monName.trim() || fallback;
    if (!name) return;
    createMonster({
      name,
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
      objectKind: objectKind || undefined,
      // Objects default to 'neutral' so players see the object (name + state) when
      // it isn't hidden; creatures keep the default (enemy).
      disposition: objectKind ? 'neutral' : undefined,
      // Library creatures are stored as 'manual' instances once placed.
      source: tmpl?.source === 'library' ? 'manual' : tmpl?.source ?? 'manual',
    });
    setMonName('');
    setTmpl(null);
    setObjectKind('');
  };

  const upload = async (body: FormData) => {
    setBusy(true);
    try {
      // The route is passphrase-gated when one is configured.
      const pass = useStore.getState().dmPassphrase;
      if (pass) body.append('dmPassphrase', pass);
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
    const reason = unsupportedImageReason(file);
    if (reason) {
      window.alert(reason);
      if (fileRef.current) fileRef.current.value = '';
      return;
    }
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

  // Generate a battle map with the local ComfyUI, then add it (the image is
  // already saved to uploads, so we pass its path rather than re-uploading).
  const generateMap = async () => {
    if (!mapPrompt.trim() || genMapBusy) return;
    setGenMapBusy(true);
    try {
      const { path, error } = await comfyGenerate(mapPrompt, 'map');
      if (!path) {
        window.alert(error || 'Map generation failed — is ComfyUI running with a checkpoint loaded?');
        return;
      }
      const fd = new FormData();
      fd.append('imagePath', path);
      fd.append('name', mapName || mapPrompt.trim().slice(0, 40));
      await upload(fd);
      setMapPrompt('');
    } finally {
      setGenMapBusy(false);
    }
  };

  // One spawn button per creature template (placement makes numbered instances).
  const monsters = snapshot.monsterTemplates as Monster[];
  const viewMap = snapshot.map;
  const otherMaps = snapshot.maps.filter((m) => m.id !== viewMap?.id);

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
              <button
                className="map-thumb-btn"
                onClick={() => selectMap(m.id)}
                title="View this map"
              >
                {m.imagePath ? (
                  <img className="map-thumb" src={m.imagePath} alt="" />
                ) : (
                  <span className="map-thumb placeholder">▦</span>
                )}
              </button>
              <span className="map-thumb-name">
                <EditableName value={m.name} onSave={(n) => renameMap(m.id, n)} />
                {m.id === snapshot.activeMapId && <span className="badge">LIVE</span>}
              </span>
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
        {comfyOk && (
          <div className="slides-row comfy-map-row">
            <input
              placeholder="🎨 Describe a battle map — e.g. ruined forest temple, top-down"
              value={mapPrompt}
              onChange={(e) => setMapPrompt(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && generateMap()}
            />
            <button
              className="btn"
              disabled={busy || genMapBusy || !mapPrompt.trim()}
              onClick={generateMap}
              title="Generate a battle map with your local ComfyUI"
            >
              {genMapBusy ? '✨…' : '✨ Generate'}
            </button>
          </div>
        )}
        <button
          className="btn tiny"
          onClick={() => setImporting(true)}
          title="Copy maps and their tokens from another session into this one"
        >
          ⇪ Import maps from another session
        </button>
        {importing && <ImportMapsDialog onClose={() => setImporting(false)} />}

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
          <div key={c.id} className="spawn-line">
            <button
              className={`spawn-row ${pending?.refId === c.id ? 'picked' : ''}`}
              onClick={() => onPickSpawn('pc', c.id)}
            >
              {c.name} <span className="muted">{c.className}</span>
            </button>
            {c.ownerId && (
              <button
                className="btn tiny"
                title="Unlock: clear this character's owner so a different player (e.g. a new device) can claim it"
                onClick={() => {
                  if (window.confirm(`Unlock ${c.name} so any player can claim it?`))
                    unlockCharacter(c.id);
                }}
              >
                🔓
              </button>
            )}
            <button
              className="btn tiny"
              title={
                c.claimedBy
                  ? 'Remove from the spawn list (blocked while a player is in the session)'
                  : 'Remove this character from the spawn list'
              }
              onClick={() => {
                if (
                  window.confirm(
                    `Remove ${c.name} from the spawn list? This deletes the character and any of its tokens.`,
                  )
                )
                  deleteCharacter(c.id);
              }}
            >
              ✕
            </button>
          </div>
        ))}
        <div className="new-char-wrap">
          <NewCharacterForm />
          <LibraryCharacterPicker />
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
            <label className="mini" title="Make this a non-combat object instead of a creature">
              Object
              <select
                value={objectKind}
                onChange={(e) => setObjectKind(e.target.value as '' | ObjectKind)}
              >
                <option value="">— creature —</option>
                <option value="trap">Trap</option>
                <option value="door">Door</option>
                <option value="chest">Chest</option>
                <option value="item">Item</option>
                <option value="other">Other</option>
              </select>
            </label>
            <button className="btn" onClick={addMonster}>
              {objectKind ? 'Add object' : 'Add creature'}
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
    </div>
  );
}
