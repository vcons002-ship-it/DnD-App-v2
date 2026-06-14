import { useEffect, useState } from 'react';

type PublicSettings = {
  hasKey: boolean;
  geminiModel: string;
  ollamaUrl: string;
  ollamaModel: string;
  aiMode: 'gemini' | 'local';
  dmPassphraseRequired: boolean;
};

type RulebookInfo = { name: string; uploadedAt: number; pages: number; chunks: number };

const SUGGESTED_MODELS = [
  'gemini-flash-latest',
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-pro-latest',
  'gemini-2.5-pro',
];

/** DM settings popup: edit the Gemini API key + model (and future options). */
export function SettingsModal({ onClose }: { onClose: () => void }) {
  const [current, setCurrent] = useState<PublicSettings | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');
  const [ollamaUrl, setOllamaUrl] = useState('');
  const [ollamaModel, setOllamaModel] = useState('');
  const [aiMode, setAiMode] = useState<'gemini' | 'local'>('gemini');
  const [passphrase, setPassphrase] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>(
    'idle',
  );
  const [errorMsg, setErrorMsg] = useState('');
  const [rulebook, setRulebook] = useState<RulebookInfo | null>(null);
  const [bookStatus, setBookStatus] = useState<'idle' | 'uploading' | 'error'>('idle');
  const [bookError, setBookError] = useState('');

  useEffect(() => {
    fetch('/api/settings')
      .then((r) => r.json())
      .then((s: PublicSettings) => {
        setCurrent(s);
        setModel(s.geminiModel);
        setOllamaUrl(s.ollamaUrl);
        setOllamaModel(s.ollamaModel);
        setAiMode(s.aiMode);
      })
      .catch(() => setCurrent(null));
    fetch('/api/rulebook')
      .then((r) => r.json())
      .then((b: RulebookInfo | null) => setRulebook(b))
      .catch(() => setRulebook(null));
  }, []);

  const uploadRulebook = async (file: File) => {
    setBookStatus('uploading');
    setBookError('');
    try {
      const form = new FormData();
      form.append('pdf', file);
      const res = await fetch('/api/rulebook', {
        method: 'POST',
        headers: passphrase ? { 'x-dm-passphrase': passphrase } : undefined,
        body: form,
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        setBookError(e.error ?? 'Upload failed');
        setBookStatus('error');
        return;
      }
      setRulebook((await res.json()) as RulebookInfo);
      setBookStatus('idle');
    } catch {
      setBookError('Could not reach the server');
      setBookStatus('error');
    }
  };

  const removeRulebook = async () => {
    await fetch('/api/rulebook', {
      method: 'DELETE',
      headers: passphrase ? { 'x-dm-passphrase': passphrase } : undefined,
    }).catch(() => {});
    setRulebook(null);
  };

  const save = async () => {
    setStatus('saving');
    setErrorMsg('');
    try {
      const body: Record<string, string> = {
        geminiModel: model.trim(),
        ollamaUrl: ollamaUrl.trim(),
        ollamaModel: ollamaModel.trim(),
        aiMode,
      };
      // Only send the key if the DM typed a new one (blank = leave unchanged).
      if (apiKey.trim()) body.geminiApiKey = apiKey.trim();
      if (passphrase) body.dmPassphrase = passphrase;
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        setErrorMsg(e.error ?? 'Could not save settings');
        setStatus('error');
        return;
      }
      const updated = (await res.json()) as PublicSettings;
      setCurrent(updated);
      setModel(updated.geminiModel);
      setOllamaUrl(updated.ollamaUrl);
      setOllamaModel(updated.ollamaModel);
      setAiMode(updated.aiMode);
      setApiKey('');
      setStatus('saved');
    } catch {
      setErrorMsg('Could not reach the server');
      setStatus('error');
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>Settings</h3>
          <button className="btn tiny" onClick={onClose}>
            ✕
          </button>
        </div>

        <h4>AI backend</h4>
        <label className="settings-field">
          Default for AI features (creatures, characters, items)
          <select value={aiMode} onChange={(e) => setAiMode(e.target.value as 'gemini' | 'local')}>
            <option value="gemini">Gemini — best quality (local fallback)</option>
            <option value="local">Local only — Ollama, no cloud calls</option>
          </select>
          <span className="muted">
            The chat's <code>/ask</code> assistant has its own model dropdown
            (defaults to local). "Local only" forces every feature onto Ollama.
          </span>
        </label>

        <h4>AI (Gemini)</h4>
        <label className="settings-field">
          API key
          <input
            type="password"
            placeholder={
              current?.hasKey ? '•••••••• (set — leave blank to keep)' : 'Paste API key'
            }
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
        </label>
        <label className="settings-field">
          Model <span className="muted">(blank = auto-detect a fast model)</span>
          <input
            list="gemini-models"
            placeholder="auto"
            value={model}
            onChange={(e) => setModel(e.target.value)}
          />
          <datalist id="gemini-models">
            {SUGGESTED_MODELS.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </label>

        <h4>Rules assistant (local — Ollama)</h4>
        <p className="muted" style={{ marginTop: 0 }}>
          The DM can type <code>/ask &lt;question&gt;</code> in chat to query a 5e
          rules assistant. It uses your local Ollama server first, then falls back
          to Gemini above. Answers are DM-only.
        </p>
        <label className="settings-field">
          Ollama URL
          <input
            placeholder="http://localhost:11434"
            value={ollamaUrl}
            onChange={(e) => setOllamaUrl(e.target.value)}
          />
        </label>
        <label className="settings-field">
          Ollama model <span className="muted">(must be pulled locally)</span>
          <input
            list="ollama-models"
            placeholder="llama3.1"
            value={ollamaModel}
            onChange={(e) => setOllamaModel(e.target.value)}
          />
          <datalist id="ollama-models">
            {['llama3.1', 'llama3.2', 'mistral', 'qwen2.5', 'phi3'].map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </label>

        <h4>Rulebook (PDF)</h4>
        <p className="muted" style={{ marginTop: 0 }}>
          Optional. Upload your rulebook PDF to ground answers; it takes
          precedence over the built-in SRD rules on any conflict.
        </p>
        {rulebook ? (
          <div className="settings-field" style={{ gap: 6 }}>
            <span>
              📖 <strong>{rulebook.name}</strong>{' '}
              <span className="muted">
                ({rulebook.pages} pages · {rulebook.chunks} chunks)
              </span>
            </span>
            <button className="btn tiny" onClick={removeRulebook}>
              Remove rulebook
            </button>
          </div>
        ) : (
          <label className="settings-field">
            <input
              type="file"
              accept="application/pdf,.pdf"
              disabled={bookStatus === 'uploading'}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) uploadRulebook(f);
              }}
            />
            {bookStatus === 'uploading' && <span className="hint">Parsing PDF…</span>}
          </label>
        )}
        {bookStatus === 'error' && <p className="err">{bookError}</p>}

        {current?.dmPassphraseRequired && (
          <label className="settings-field">
            DM passphrase <span className="muted">(required to save)</span>
            <input
              type="password"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
            />
          </label>
        )}

        {status === 'error' && <p className="err">{errorMsg}</p>}
        {status === 'saved' && <p className="hint">Saved ✓</p>}

        <div className="modal-actions">
          <button className="btn green" disabled={status === 'saving'} onClick={save}>
            {status === 'saving' ? 'Saving…' : 'Save'}
          </button>
          <button className="btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
