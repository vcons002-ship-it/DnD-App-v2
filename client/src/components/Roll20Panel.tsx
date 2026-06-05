import { useState } from 'react';
import type { Character } from '../../../shared/types';
import { useStore } from '../state/socket';

const URL_KEY = 'roll20-url';

/** Parse a pasted Roll20 sheet export, best-effort, into a character patch. */
function parseSheet(text: string) {
  const num = (re: RegExp) => {
    const m = text.match(re);
    return m ? Number(m[1]) : undefined;
  };
  const patch: Record<string, unknown> = {};
  const maxHp = num(/\bHP\b[^\d-]{0,8}(\d+)/i);
  if (maxHp) patch.maxHp = maxHp;
  const ac = num(/\bAC\b[^\d-]{0,8}(\d+)/i);
  if (ac) patch.armorClass = ac;
  const level = num(/\blevel\b[^\d-]{0,8}(\d+)/i);
  if (level) patch.level = level;
  const stats: Record<string, number> = {};
  const statRe = /\b(STR|DEX|CON|INT|WIS|CHA)\b[^\d-]{0,8}(\d+)/gi;
  let m: RegExpExecArray | null;
  while ((m = statRe.exec(text))) stats[m[1].toUpperCase()] = Number(m[2]);
  if (Object.keys(stats).length) patch.stats = stats;
  return patch;
}

/**
 * Roll20: a collapsible embed that falls back to a pop-out when framing is
 * blocked (X-Frame-Options), plus a best-effort "paste sheet export" importer
 * for the viewer's own character (no public Roll20 API exists).
 */
export function Roll20Panel({ character }: { character?: Character }) {
  const updateCharacter = useStore((s) => s.updateCharacter);
  const [url, setUrl] = useState(() => localStorage.getItem(URL_KEY) ?? '');
  const [open, setOpen] = useState(false);
  const [paste, setPaste] = useState('');
  const [importMsg, setImportMsg] = useState('');

  const saveUrl = (u: string) => {
    setUrl(u);
    localStorage.setItem(URL_KEY, u);
  };

  const doImport = () => {
    if (!character) return;
    const patch = parseSheet(paste);
    const n = Object.keys(patch).length;
    if (n === 0) {
      setImportMsg('Nothing recognized in that text.');
      return;
    }
    updateCharacter({ characterId: character.id, ...patch });
    setImportMsg(`Imported ${n} field${n === 1 ? '' : 's'}.`);
    setPaste('');
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

      {character && (
        <details className="roll20-import">
          <summary>Import sheet (paste)</summary>
          <textarea
            className="ai-desc"
            placeholder="Paste your Roll20 sheet export — HP, AC, level, STR/DEX/… are picked up."
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
          />
          <button className="btn tiny" disabled={!paste.trim()} onClick={doImport}>
            Import to {character.name}
          </button>
          {importMsg && <p className="hint">{importMsg}</p>}
        </details>
      )}
    </div>
  );
}
