import { useState } from 'react';

const URL_KEY = 'roll20-url';

/**
 * Roll20: a collapsible embed that falls back to a pop-out when framing is
 * blocked (X-Frame-Options). (Sheet import/export lives on the character sheet —
 * Roll20 has no public per-character export API.)
 */
export function Roll20Panel() {
  const [url, setUrl] = useState(() => localStorage.getItem(URL_KEY) ?? '');
  const [open, setOpen] = useState(false);

  const saveUrl = (u: string) => {
    setUrl(u);
    localStorage.setItem(URL_KEY, u);
  };

  return (
    <div className="panel-section">
      <h3>Roll20</h3>
      <div className="dice-row">
        <input
          placeholder="Roll20 game/sheet URL"
          value={url}
          onChange={(e) => saveUrl(e.target.value)}
        />
      </div>
      {url && (
        <div className="dice-quick">
          <button className="btn tiny" onClick={() => setOpen((o) => !o)}>
            {open ? 'Hide embed' : 'Show embed'}
          </button>
          <button
            className="btn tiny"
            onClick={() => window.open(url, '_blank', 'noopener')}
            title="Roll20 often blocks embedding — pop it out instead"
          >
            Open ↗
          </button>
        </div>
      )}
      {open && url && (
        <>
          <iframe className="roll20-frame" title="Roll20" src={url} />
          <p className="hint">If the embed is blank, Roll20 blocks framing — use “Open ↗”.</p>
        </>
      )}
    </div>
  );
}
