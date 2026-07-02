import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { SessionSummary } from '../../../shared/types';
import { useStore, loadSavedSession } from '../state/socket';
import { DmView } from './DmView';

const fmtDate = (ms: number) =>
  ms ? new Date(ms).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }) : '—';

export function DmRoute() {
  const [params] = useSearchParams();
  const status = useStore((s) => s.status);
  const snapshot = useStore((s) => s.snapshot);
  const error = useStore((s) => s.error);
  const connect = useStore((s) => s.connect);
  const [code, setCode] = useState(params.get('code') ?? '');
  const [customCode, setCustomCode] = useState('');
  const [createErr, setCreateErr] = useState<string | null>(null);
  const [passphrase, setPassphrase] = useState('');
  const [creating, setCreating] = useState(false);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [editing, setEditing] = useState<string | null>(null); // code being edited
  const [editName, setEditName] = useState('');
  const [editCode, setEditCode] = useState('');
  const [rowErr, setRowErr] = useState<string | null>(null);

  useEffect(() => {
    const c = params.get('code');
    if (c) setCode(c);
  }, [params]);

  // Auto-rejoin the saved DM session after a reload / tab eviction.
  useEffect(() => {
    if (status !== 'idle') return;
    const saved = loadSavedSession();
    const param = params.get('code');
    if (saved?.role === 'dm' && (!param || param === saved.code)) {
      connect(saved.code, 'dm', saved.dmPassphrase);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The saved-session directory is DM-only now (it lists every join code), so
  // it's fetched WITH the DM secret. Until the right secret is entered the list
  // stays empty — the DM can still rejoin by typing a code directly above.
  const refreshSessions = () =>
    fetch('/api/sessions', {
      headers: passphrase ? { 'x-dm-passphrase': passphrase } : undefined,
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setSessions(Array.isArray(d) ? d : []))
      .catch(() => setSessions([]));

  // Refresh the saved-session list whenever we're on this screen — including
  // after "Load session" disconnects us from a session (status → 'idle') — so a
  // session you just played or created shows up immediately and can be renamed
  // or deleted. (Sessions persist server-side on every change, so there's
  // nothing to "save" first; the old list was simply stale until a full reload.)
  useEffect(() => {
    if (status !== 'connected') refreshSessions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, passphrase]);

  const startEdit = (s: SessionSummary) => {
    setEditing(s.code);
    setEditName(s.name);
    setEditCode(s.code);
    setRowErr(null);
  };

  const saveEdit = async (origCode: string) => {
    setRowErr(null);
    const res = await fetch(`/api/sessions/${origCode}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editName, code: editCode, dmPassphrase: passphrase }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setRowErr(data.error ?? 'Could not save the changes.');
      return;
    }
    setEditing(null);
    await refreshSessions();
  };

  const removeSession = async (s: SessionSummary) => {
    if (
      !window.confirm(
        `Delete session "${s.name}" (${s.code}) and ALL its maps, tokens and data?\nThis cannot be undone.`,
      )
    )
      return;
    setRowErr(null);
    const res = await fetch(`/api/sessions/${s.code}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dmPassphrase: passphrase }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setRowErr(data.error ?? 'Could not delete the session.');
      return;
    }
    await refreshSessions();
  };

  const createSession = async () => {
    setCreating(true);
    setCreateErr(null);
    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(customCode.trim() ? { code: customCode.trim() } : {}),
          dmPassphrase: passphrase,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        // e.g. a custom code that's already taken / too short (409).
        setCreateErr(data.error ?? 'Could not create the session.');
        return;
      }
      setCode(data.code);
      connect(data.code, 'dm', passphrase);
    } finally {
      setCreating(false);
    }
  };

  // Hold the game view through a reconnect blip (keep the last snapshot).
  if (status === 'connected' || (status === 'reconnecting' && snapshot)) {
    return <DmView />;
  }

  return (
    <div className="entry">
      <h1>DM Console</h1>
      <p>Start a new session or rejoin an existing one.</p>

      <input
        placeholder="DM secret (required — see server console)"
        type="password"
        value={passphrase}
        onChange={(e) => setPassphrase(e.target.value)}
        title="Printed in the server console at startup and saved in server/data/dm-secret.txt. Needed for every DM action; players don't need it."
      />

      <input
        placeholder="Custom code (optional, e.g. TAVERN)"
        value={customCode}
        onChange={(e) => setCustomCode(e.target.value.toUpperCase())}
        title="Pick a memorable code for a stable, shareable join link. Leave blank for a random one."
      />
      <button className="btn big" disabled={creating} onClick={createSession}>
        {creating ? 'Creating…' : 'Create new session'}
      </button>
      {createErr && <p className="err">{createErr}</p>}

      <div className="entry-divider">or rejoin</div>

      <input
        placeholder="Session code"
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
      />
      <button
        className="btn big"
        disabled={!code || status === 'connecting'}
        onClick={() => connect(code, 'dm', passphrase)}
      >
        {status === 'connecting' ? 'Connecting…' : 'Rejoin as DM'}
      </button>

      {error && <p className="err">{error}</p>}

      {sessions.length > 0 && (
        <div className="session-dir">
          <div className="entry-divider">saved sessions</div>
          {rowErr && <p className="err">{rowErr}</p>}
          {sessions.map((s) =>
            editing === s.code ? (
              <div key={s.code} className="session-edit">
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Session name"
                />
                <input
                  value={editCode}
                  onChange={(e) => setEditCode(e.target.value.toUpperCase())}
                  placeholder="Join code"
                  title="Changing the code keeps all maps & data; links to the old code stop working."
                />
                <div className="session-edit-actions">
                  <button className="btn tiny green" onClick={() => saveEdit(s.code)}>
                    Save
                  </button>
                  <button className="btn tiny" onClick={() => setEditing(null)}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div key={s.code} className="session-row-wrap">
                <button
                  className="session-row"
                  onClick={() => connect(s.code, 'dm', passphrase)}
                  title={`Created ${fmtDate(s.createdAt)} · click to open`}
                >
                  <span className="session-code">{s.code}</span>
                  <span className="session-name">{s.name}</span>
                  <span className="session-meta">
                    {s.mapCount} map{s.mapCount === 1 ? '' : 's'} · played{' '}
                    {fmtDate(s.lastPlayedAt)}
                  </span>
                </button>
                <button
                  className="btn tiny session-action"
                  title="Edit name / join code"
                  onClick={() => startEdit(s)}
                >
                  ✎
                </button>
                <button
                  className="btn tiny danger session-action"
                  title="Delete session"
                  onClick={() => removeSession(s)}
                >
                  🗑
                </button>
              </div>
            ),
          )}
        </div>
      )}
    </div>
  );
}
