import { useEffect, useState } from 'react';

type PublicSettings = {
  hasKey: boolean;
  geminiModel: string;
  dmPassphraseRequired: boolean;
};

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
  const [passphrase, setPassphrase] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>(
    'idle',
  );
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    fetch('/api/settings')
      .then((r) => r.json())
      .then((s: PublicSettings) => {
        setCurrent(s);
        setModel(s.geminiModel);
      })
      .catch(() => setCurrent(null));
  }, []);

  const save = async () => {
    setStatus('saving');
    setErrorMsg('');
    try {
      const body: Record<string, string> = { geminiModel: model.trim() };
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
