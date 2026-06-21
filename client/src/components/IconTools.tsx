import { useState } from 'react';
import { unsupportedImageReason } from '../lib/images';
import { useComfyAvailable, comfyGenerate, type ComfyKind } from '../lib/comfy';

type Props = {
  /** Apply an icon value: an emoji, an uploaded "/uploads/…" path, or '' to clear. */
  onApply: (icon: string) => void;
  /** Optional note, e.g. how many tokens this affects. */
  note?: string;
  /** Image dimensions ComfyUI generates for ('token' square by default). */
  comfyKind?: ComfyKind;
};

/** Emoji / image-upload / AI-generate / clear controls for a token or decal's art. */
export function IconTools({ onApply, note, comfyKind = 'token' }: Props) {
  const [emoji, setEmoji] = useState('');
  const [busy, setBusy] = useState(false);
  const comfyOk = useComfyAvailable();
  const [genOpen, setGenOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [genBusy, setGenBusy] = useState(false);
  const [genErr, setGenErr] = useState('');

  const generate = async () => {
    if (!prompt.trim() || genBusy) return;
    setGenBusy(true);
    setGenErr('');
    try {
      const path = await comfyGenerate(prompt, comfyKind);
      if (path) {
        onApply(path);
        setGenOpen(false);
        setPrompt('');
      } else {
        setGenErr('Generation failed — is ComfyUI running with a checkpoint loaded?');
      }
    } finally {
      setGenBusy(false);
    }
  };

  const upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reason = unsupportedImageReason(file);
    if (reason) {
      window.alert(reason);
      e.target.value = '';
      return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('image', file);
      const res = await fetch('/api/icons', { method: 'POST', body: fd });
      if (res.ok) onApply((await res.json()).icon);
    } finally {
      setBusy(false);
      e.target.value = '';
    }
  };

  return (
    <>
      <div className="icon-tools">
        <input
          className="emoji-input"
          maxLength={2}
          placeholder="🐉"
          value={emoji}
          onChange={(e) => setEmoji(e.target.value)}
        />
        <button
          className="btn tiny"
          disabled={!emoji}
          onClick={() => onApply(emoji)}
        >
          Set
        </button>
        <label className="btn tiny upload-icon">
          {busy ? '…' : 'Upload'}
          <input type="file" accept="image/*" hidden onChange={upload} />
        </label>
        {comfyOk && (
          <button
            className={`btn tiny ${genOpen ? 'on' : ''}`}
            onClick={() => setGenOpen((v) => !v)}
            title="Generate art with your local ComfyUI"
          >
            🎨 AI art
          </button>
        )}
        <button className="btn tiny" onClick={() => onApply('')}>
          Clear
        </button>
      </div>
      {comfyOk && genOpen && (
        <div className="comfy-gen">
          <input
            autoFocus
            placeholder="Describe the art — e.g. snarling goblin warrior, dark fantasy"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && generate()}
          />
          <button className="btn tiny" disabled={genBusy || !prompt.trim()} onClick={generate}>
            {genBusy ? '✨ Generating…' : '✨ Generate'}
          </button>
        </div>
      )}
      {genErr && <p className="err">{genErr}</p>}
      {note && <p className="hint">{note}</p>}
    </>
  );
}
