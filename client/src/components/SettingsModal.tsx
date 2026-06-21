import { useEffect, useState } from 'react';
import { isSfxMuted, setSfxMuted, playHit } from '../lib/sfx';
import { refreshComfyStatus } from '../lib/comfy';
import { useStore } from '../state/socket';

type PublicSettings = {
  hasKey: boolean;
  geminiModel: string;
  ollamaUrl: string;
  ollamaModel: string;
  aiMode: 'gemini' | 'local';
  comfyUrl: string;
  comfyModel: string;
  comfyWorkflow: string;
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
  // Per-user (this browser) combat-sound mute — default ON / unmuted.
  const [muted, setMuted] = useState(isSfxMuted());
  // Per-user roll-reveal animation toggle (store-backed, localStorage-persisted).
  const showRollAnim = useStore((s) => s.showRollAnim);
  const toggleRollAnim = useStore((s) => s.toggleRollAnim);
  const [rulebook, setRulebook] = useState<RulebookInfo | null>(null);
  const [bookStatus, setBookStatus] = useState<'idle' | 'uploading' | 'error'>('idle');
  const [bookError, setBookError] = useState('');
  // The Ollama models actually pulled on the connected server (GET /api/ai/models
  // → Ollama's /api/tags), so the dropdown lists what's really available, not a
  // hardcoded guess. `null` = not loaded yet.
  const [ollamaModels, setOllamaModels] = useState<string[] | null>(null);
  // Local ComfyUI: configured URL/checkpoint + the live connection's checkpoints.
  const [comfyUrl, setComfyUrl] = useState('');
  const [comfyModel, setComfyModel] = useState('');
  const [comfyWorkflow, setComfyWorkflow] = useState('');
  const [showWorkflow, setShowWorkflow] = useState(false);
  const [comfy, setComfy] = useState<{
    reachable: boolean;
    models: string[];
    usingWorkflow?: boolean;
  } | null>(null);

  const loadOllamaModels = () =>
    fetch('/api/ai/models')
      .then((r) => r.json())
      .then((d: { ollamaModels?: string[] }) => setOllamaModels(d.ollamaModels ?? []))
      .catch(() => setOllamaModels([]));

  const loadComfy = () => {
    setComfy(null);
    refreshComfyStatus();
    return fetch('/api/comfy/status')
      .then((r) => r.json())
      .then((d: { reachable?: boolean; models?: string[]; usingWorkflow?: boolean }) =>
        setComfy({
          reachable: !!d.reachable,
          models: d.models ?? [],
          usingWorkflow: !!d.usingWorkflow,
        }),
      )
      .catch(() => setComfy({ reachable: false, models: [] }));
  };

  useEffect(() => {
    loadOllamaModels();
    loadComfy();
    fetch('/api/settings')
      .then((r) => r.json())
      .then((s: PublicSettings) => {
        setCurrent(s);
        setModel(s.geminiModel);
        setOllamaUrl(s.ollamaUrl);
        setOllamaModel(s.ollamaModel);
        setAiMode(s.aiMode);
        setComfyUrl(s.comfyUrl ?? '');
        setComfyModel(s.comfyModel ?? '');
        setComfyWorkflow(s.comfyWorkflow ?? '');
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
        comfyUrl: comfyUrl.trim(),
        comfyModel: comfyModel.trim(),
        comfyWorkflow: comfyWorkflow.trim(),
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
      setComfyUrl(updated.comfyUrl ?? '');
      setComfyModel(updated.comfyModel ?? '');
      setComfyWorkflow(updated.comfyWorkflow ?? '');
      // The saved URLs are now live — re-probe Ollama models and ComfyUI.
      setOllamaModels(null);
      loadOllamaModels();
      loadComfy();
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

        <h4>Sound</h4>
        <label className="settings-field settings-check">
          <input
            type="checkbox"
            checked={!muted}
            onChange={(e) => {
              const on = e.target.checked;
              setSfxMuted(!on);
              setMuted(!on);
              if (on) playHit(); // preview when turning sound on
            }}
          />
          Combat sound cues <span className="muted">(hit / miss / heal / check — this device only)</span>
        </label>
        <label className="settings-field settings-check">
          <input
            type="checkbox"
            checked={showRollAnim}
            onChange={toggleRollAnim}
          />
          Roll animations <span className="muted">(brief d20 reveal on attacks — this device only)</span>
        </label>

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
          Ollama model{' '}
          <span className="muted">
            {ollamaModels === null
              ? '(checking the connection…)'
              : ollamaModels.length
                ? `(${ollamaModels.length} pulled on the server)`
                : '(none found — is Ollama running at the URL above? Save to recheck)'}
          </span>
          <input
            list="ollama-models"
            placeholder={ollamaModels?.[0] ?? 'llama3.1'}
            value={ollamaModel}
            onChange={(e) => setOllamaModel(e.target.value)}
          />
          <datalist id="ollama-models">
            {(ollamaModels ?? []).map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </label>

        <h4>Image generation (local — ComfyUI)</h4>
        <p className="muted" style={{ marginTop: 0 }}>
          Point this at a running{' '}
          <a href="https://github.com/comfyanonymous/ComfyUI" target="_blank" rel="noreferrer">
            ComfyUI
          </a>{' '}
          server to generate token art, decals and battle maps from a prompt — a 🎨
          button appears on the token/decal art tools and the map panel.
        </p>
        <label className="settings-field">
          ComfyUI URL{' '}
          <span className="muted">
            {comfy === null
              ? '(checking…)'
              : comfy.reachable
                ? `(connected · ${comfy.models.length} checkpoint${comfy.models.length === 1 ? '' : 's'})`
                : '(not reachable — start ComfyUI, then Save to recheck)'}
          </span>
          <input
            placeholder="http://127.0.0.1:8188"
            value={comfyUrl}
            onChange={(e) => setComfyUrl(e.target.value)}
          />
        </label>
        <label className="settings-field">
          Checkpoint{' '}
          <span className="muted">
            {comfy?.usingWorkflow
              ? '(ignored — a custom workflow is active)'
              : '(blank = first installed)'}
          </span>
          <input
            list="comfy-models"
            placeholder={comfy?.models[0] ?? 'model.safetensors'}
            value={comfyModel}
            onChange={(e) => setComfyModel(e.target.value)}
            disabled={comfy?.usingWorkflow}
          />
          <datalist id="comfy-models">
            {(comfy?.models ?? []).map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </label>
        <button
          type="button"
          className="btn tiny"
          onClick={() => setShowWorkflow((v) => !v)}
          style={{ alignSelf: 'flex-start' }}
        >
          {showWorkflow ? '▾' : '▸'} Advanced: custom workflow (Flux / SD3 / text-diffusion)
        </button>
        {showWorkflow && (
          <label className="settings-field">
            <span className="muted">
              The built-in graph only runs SD1.5/SDXL checkpoints. To use Flux,
              SD3, or any T5/Mistral text-encoder model, export your working graph
              from ComfyUI (gear → enable <em>Dev mode</em> → <em>Save (API Format)</em>),
              paste the JSON here, and replace the positive-prompt text with{' '}
              <code>"%prompt%"</code> (keep the quotes — it's text). Optional:{' '}
              <code>"%negative%"</code>, and the <strong>unquoted</strong> numbers{' '}
              <code>%width%</code>, <code>%height%</code>, <code>%seed%</code> — e.g.
              change <code>"seed": 12345</code> to <code>"seed": %seed%</code> for a
              fresh image each run. Leave blank to use the built-in SD graph.
            </span>
            <textarea
              className="workflow-json"
              rows={8}
              spellCheck={false}
              placeholder='{ "3": { "class_type": "KSampler", ... } }'
              value={comfyWorkflow}
              onChange={(e) => setComfyWorkflow(e.target.value)}
            />
          </label>
        )}

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
