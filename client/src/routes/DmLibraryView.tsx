import { useEffect, useMemo, useState } from 'react';
import type { CreatureTemplate, Monster } from '../../../shared/types';
import { useStore } from '../state/socket';
import { apiFetch } from '../lib/api';
import { templateToStatSheet } from '../lib/entities';
import { postSpawnRequest, spawnChannelSupported } from '../lib/spawnChannel';
import { SidePanel } from '../components/SidePanel';
import { StatBlock } from '../components/StatBlock';
import { TemplateEditor } from '../components/TemplateEditor';
import { LibrarySaveDialog } from '../components/LibrarySaveDialog';
import { AiStatus } from '../components/AiStatus';
import { ConnectionStatus } from '../components/ConnectionStatus';
import { RollRevealOverlay } from '../components/RollRevealOverlay';
import { Toast } from '../components/Toast';

/** The three places a creature can come from. */
type Source = 'session' | 'library' | 'find';

const SOURCE_LABELS: { id: Source; label: string; hint: string }[] = [
  { id: 'session', label: 'This session', hint: 'Creatures already added to this campaign — edit them or place them on the map.' },
  { id: 'library', label: 'Saved library', hint: 'Your cross-campaign bestiary. Add one to this session, or delete it for good.' },
  { id: 'find', label: 'Find new', hint: 'Search the SRD bestiary, or ask the AI for anything it does not have.' },
];

/**
 * Standalone "Monster Library" window (second screen / monitor). Brings the
 * creature work that used to be squeezed into the DM's left panel into a room
 * of its own: this session's creatures, the cross-session saved library, and
 * SRD/AI search — each with a full-width stat block beside it.
 *
 * Purely additive: the left panel still has everything it always did. Nothing
 * here needs new server endpoints; it uses the same REST + socket calls the
 * left panel does, plus the two library routes that had no UI until now.
 */
export function DmLibraryView() {
  const snapshot = useStore((s) => s.snapshot)!;
  const createMonster = useStore((s) => s.createMonster);
  const deleteMonster = useStore((s) => s.deleteMonster);
  const notify = useStore((s) => s.notify);
  const setAiBusy = useStore((s) => s.setAiBusy);

  const [source, setSource] = useState<Source>('session');
  const [query, setQuery] = useState('');
  // Selection is per-source so switching tabs doesn't show a mismatched detail.
  const [pickedId, setPickedId] = useState<string | null>(null); // session template id
  const [picked, setPicked] = useState<CreatureTemplate | null>(null); // library/SRD entry
  const [remote, setRemote] = useState<CreatureTemplate[]>([]);
  const [aiAvailable, setAiAvailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [armed, setArmed] = useState<string | null>(null); // name we asked the map window to place
  const [saving, setSaving] = useState<Monster | null>(null);

  const templates = snapshot.monsterTemplates as Monster[];

  // Session list filters client-side (it's already in the snapshot).
  const sessionHits = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? templates.filter((m) => m.name.toLowerCase().includes(q)) : templates;
  }, [templates, query]);

  // Library + SRD/AI are REST-backed; debounce like the left panel's typeahead.
  useEffect(() => {
    if (source === 'session') return;
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const url =
          source === 'library'
            ? `/api/library/creatures?q=${encodeURIComponent(query)}`
            : `/api/creatures?q=${encodeURIComponent(query)}`;
        const res = await fetch(url);
        if (!res.ok || cancelled) return;
        const data = await res.json();
        // The library route returns a bare array; /api/creatures wraps it.
        setRemote(Array.isArray(data) ? data : (data.results ?? []));
        if (!Array.isArray(data)) setAiAvailable(!!data.aiAvailable);
      } catch {
        /* offline / transient — leave the last results up */
      }
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, source, busy]);

  const selectedTemplate = templates.find((m) => m.id === pickedId) ?? null;

  const switchSource = (next: Source) => {
    setSource(next);
    setPicked(null);
    setPickedId(null);
    setRemote([]);
  };

  /** Ask the AI for a creature the local DBs don't have. */
  const askAi = async () => {
    const name = query.trim();
    if (!name || busy) return;
    setBusy(true);
    setAiBusy(true);
    notify(`✨ Asking AI for "${name}"…`);
    try {
      const res = await apiFetch('/api/creatures/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (res.ok) {
        const t = (await res.json()) as CreatureTemplate;
        setPicked(t);
        setRemote((r) => [t, ...r.filter((x) => x.name !== t.name)]);
        notify(`✨ ${t.name} ready — review it, then Add to session.`);
      } else {
        notify(res.status === 403 ? 'DM secret required.' : 'No match, and AI is unavailable.');
      }
    } catch {
      notify('AI lookup failed.');
    } finally {
      setBusy(false);
      setAiBusy(false);
    }
  };

  /** Add the previewed SRD/library/AI creature to this session as a template. */
  const addToSession = (t: CreatureTemplate) => {
    createMonster({
      name: t.name,
      maxHp: t.maxHp,
      creatureType: t.creatureType,
      level: t.level,
      armorClass: t.armorClass,
      speed: t.speed,
      stats: t.stats,
      resistances: t.resistances,
      weaknesses: t.weaknesses,
      actions: t.actions,
      abilities: t.abilities,
      sheetAbilities: t.sheetAbilities,
      weapons: t.weapons,
      icon: t.icon,
      // `Monster.source` has no 'library' member — a placed copy is 'manual'.
      source: t.source === 'library' ? 'manual' : t.source,
    });
    notify(`${t.name} added to this session — it's in your spawn list.`);
    switchSource('session');
    setQuery(t.name);
  };

  /** Remove a creature from the CROSS-CAMPAIGN library (not just this session). */
  const deleteFromLibrary = async (t: CreatureTemplate) => {
    if (
      !confirm(
        `Delete "${t.name}" from your saved library?\n\nThis removes it from EVERY campaign, not just this session. Creatures already added to a session are unaffected.`,
      )
    )
      return;
    setBusy(true);
    try {
      const res = await apiFetch(`/api/library/creatures/${encodeURIComponent(t.name)}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setPicked(null);
        setRemote((r) => r.filter((x) => x.name !== t.name));
        notify(`${t.name} removed from the library.`);
      } else {
        notify(res.status === 403 ? 'DM secret required.' : 'Could not delete.');
      }
    } catch {
      notify('Could not delete.');
    } finally {
      setBusy(false);
    }
  };

  /** Arm the MAIN DM window to place this creature (it owns the map canvas). */
  const placeOnMap = (m: Monster) => {
    const ok = postSpawnRequest(snapshot.sessionCode, {
      kind: 'monster',
      refId: m.id,
      name: m.name,
    });
    setArmed(ok ? m.name : null);
    if (!ok) notify('This browser cannot hand off to the map window.');
  };

  const canPlace = spawnChannelSupported();

  return (
    <div className="data-view">
      <header className="data-top">
        <div>
          <strong>📚 Monster Library</strong>
          <span className="muted"> · {snapshot.sessionCode}</span>
        </div>
        <div className="library-tabs">
          {SOURCE_LABELS.map((s) => (
            <button
              key={s.id}
              className={`btn tiny ${source === s.id ? 'on' : ''}`}
              onClick={() => switchSource(s.id)}
              title={s.hint}
            >
              {s.label}
              {s.id === 'session' ? ` (${templates.length})` : ''}
            </button>
          ))}
        </div>
        <input
          className="library-search"
          placeholder={
            source === 'session'
              ? 'Filter this session…'
              : source === 'library'
                ? 'Search your saved library…'
                : 'Search the SRD, or type any creature for AI…'
          }
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {source === 'find' && aiAvailable && (
          <button className="btn tiny" disabled={!query.trim() || busy} onClick={askAi}>
            ✨ AI
          </button>
        )}
      </header>

      <div className="data-body">
        {/* Absolutely-positioned scroller: a definite height that iOS Safari
            honours (the nested-flex min-height:0 chain is unreliable there). */}
        <div className="library-list-wrap">
          <div className="library-list">
            {source === 'session' &&
              sessionHits.map((m) => (
                <button
                  key={m.id}
                  className={`library-card ${pickedId === m.id ? 'picked' : ''}`}
                  onClick={() => setPickedId(m.id)}
                >
                  <span className="library-card-icon">{m.icon || '👾'}</span>
                  <span className="library-card-name">{m.name}</span>
                  <span className="muted">
                    {m.creatureType || 'creature'} · {m.maxHp} hp
                    {m.level ? ` · CR ${m.level}` : ''}
                  </span>
                </button>
              ))}
            {source !== 'session' &&
              remote.map((t) => (
                <button
                  key={`${t.source}:${t.name}`}
                  className={`library-card ${picked?.name === t.name ? 'picked' : ''}`}
                  onClick={() => setPicked(t)}
                >
                  <span className="library-card-icon">{t.icon || '👾'}</span>
                  <span className="library-card-name">{t.name}</span>
                  <span className="muted">
                    {t.creatureType || 'creature'} · {t.maxHp} hp
                    {t.level ? ` · CR ${t.level}` : ''}
                  </span>
                  <span className={`library-src src-${t.source}`}>{t.source}</span>
                </button>
              ))}

            {source === 'session' && sessionHits.length === 0 && (
              <p className="muted">
                {templates.length
                  ? 'No creature here matches that.'
                  : 'No creatures in this session yet — add one from the library or Find new.'}
              </p>
            )}
            {source === 'library' && remote.length === 0 && (
              <p className="muted">
                {query.trim()
                  ? 'Nothing saved under that name.'
                  : 'Your library is empty. Select a creature on the map and use “💾 Save to library” to start it.'}
              </p>
            )}
            {source === 'find' && remote.length === 0 && (
              <p className="muted">
                {query.trim()
                  ? aiAvailable
                    ? 'No local match — try ✨ AI.'
                    : 'No local match (AI is unavailable).'
                  : 'Type a name to search the SRD bestiary.'}
              </p>
            )}
          </div>
        </div>

        <SidePanel side="right" storageKey={`dm-library-detail:${snapshot.sessionCode}`}>
          <div className="panel">
            {/* A session creature: the SAME editor the left panel uses. */}
            {source === 'session' && selectedTemplate && (
              <div className="panel-section">
                <h3>{selectedTemplate.name}</h3>
                <div className="dice-row">
                  <button
                    className="btn"
                    disabled={!canPlace}
                    onClick={() => placeOnMap(selectedTemplate)}
                    title={
                      canPlace
                        ? 'Arms your main DM window — then click the map to drop it'
                        : 'Needs the map window open in the same browser'
                    }
                  >
                    ➕ Place on map
                  </button>
                  <button
                    className="btn tiny"
                    onClick={() => setSaving(selectedTemplate)}
                    title="Save this creature to your cross-campaign library"
                  >
                    💾 Save to library
                  </button>
                  <button
                    className="btn tiny red"
                    onClick={() => {
                      if (confirm(`Remove "${selectedTemplate.name}" from this session?`)) {
                        deleteMonster(selectedTemplate.id);
                        setPickedId(null);
                      }
                    }}
                  >
                    ✕ Remove
                  </button>
                </div>
                {armed === selectedTemplate.name && (
                  <p className="hint">
                    Now click your map window to drop {selectedTemplate.name}.
                  </p>
                )}
                <TemplateEditor monster={selectedTemplate} />
              </div>
            )}

            {/* A library / SRD / AI entry: read-only preview until it's added. */}
            {source !== 'session' && picked && (
              <div className="panel-section">
                <h3>
                  {picked.icon} {picked.name}
                </h3>
                <div className="dice-row">
                  <button className="btn" disabled={busy} onClick={() => addToSession(picked)}>
                    ➕ Add to this session
                  </button>
                  {source === 'library' && (
                    <button
                      className="btn tiny red"
                      disabled={busy}
                      onClick={() => deleteFromLibrary(picked)}
                      title="Delete from the cross-campaign library"
                    >
                      🗑 Delete from library
                    </button>
                  )}
                </div>
                <p className="hint">
                  Preview only — add it to the session to edit, AI-fill or place it.
                </p>
                <StatBlock
                  creature={templateToStatSheet(picked)}
                  subtitle={picked.creatureType}
                  levelLabel="CR"
                  monster
                />
              </div>
            )}

            {((source === 'session' && !selectedTemplate) ||
              (source !== 'session' && !picked)) && (
              <div className="panel-section">
                <p className="muted">
                  {SOURCE_LABELS.find((s) => s.id === source)?.hint}
                </p>
                <p className="muted">Pick a creature on the left to see its stat block.</p>
              </div>
            )}
          </div>
        </SidePanel>
      </div>

      {saving && <LibrarySaveDialog monster={saving} onClose={() => setSaving(null)} />}
      {/* Same global overlays the other views mount — without AiStatus/Toast the
          AI lookup and AI fill in THIS window would give no feedback at all. */}
      <AiStatus />
      <ConnectionStatus />
      <RollRevealOverlay />
      <Toast />
    </div>
  );
}
