import { useState } from 'react';

type Props = {
  /** Apply an icon value: an emoji, an uploaded "/uploads/…" path, or '' to clear. */
  onApply: (icon: string) => void;
  /** Optional note, e.g. how many tokens this affects. */
  note?: string;
};

/** Emoji / image-upload / clear controls for a token or template's art. */
export function IconTools({ onApply, note }: Props) {
  const [emoji, setEmoji] = useState('');
  const [busy, setBusy] = useState(false);

  const upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
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
        <button className="btn tiny" onClick={() => onApply('')}>
          Clear
        </button>
      </div>
      {note && <p className="hint">{note}</p>}
    </>
  );
}
