import { useState } from 'react';
import type { Character } from '../../../shared/types';
import {
  exportSheetJSON,
  parseSheet,
  type SheetPatch,
} from '../../../shared/sheetIO';
import { useStore } from '../state/socket';

/**
 * Import a character sheet from pasted plain text (any sheet — HP/AC/level/
 * abilities/skills/spell-slots picked up best-effort) or our own JSON export,
 * and export this character's full sheet as JSON for clean round-tripping.
 *
 * Import OVERWRITES the fields it recognizes (everything else is preserved), so
 * it previews exactly which fields will change and asks to confirm first.
 */
export function SheetImportExport({ character }: { character: Character }) {
  const updateCharacter = useStore((s) => s.updateCharacter);
  const [text, setText] = useState('');
  const [pending, setPending] = useState<SheetPatch | null>(null);
  const [msg, setMsg] = useState('');

  const preview = () => {
    setMsg('');
    const patch = parseSheet(text);
    if (Object.keys(patch).length === 0) {
      setPending(null);
      setMsg('Nothing recognized in that text.');
      return;
    }
    setPending(patch);
  };

  const apply = () => {
    if (!pending) return;
    updateCharacter({ characterId: character.id, ...pending });
    setMsg(`Overwrote ${Object.keys(pending).length} field(s).`);
    setPending(null);
    setText('');
  };

  const doExport = async () => {
    const json = exportSheetJSON(character);
    try {
      await navigator.clipboard.writeText(json);
      setMsg('Copied JSON to clipboard.');
    } catch {
      setText(json);
      setMsg('Clipboard blocked — JSON placed in the box to copy.');
    }
  };

  return (
    <details className="sheet-io">
      <summary>Import / export sheet</summary>
      <textarea
        className="ai-desc"
        placeholder="Paste plain text (e.g. 'HP 25/30, AC 16, Wizard 5, STR 14…') or our JSON export"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setPending(null);
        }}
      />
      <div className="dice-quick">
        <button className="btn tiny" disabled={!text.trim()} onClick={preview}>
          Preview import
        </button>
        <button className="btn tiny" onClick={doExport}>
          Export JSON
        </button>
      </div>

      {pending && (
        <div className="import-confirm">
          <p className="hint">
            This will <strong>overwrite</strong> these fields (others are kept):
          </p>
          <p className="muted">{Object.keys(pending).join(', ')}</p>
          <div className="dice-quick">
            <button className="btn tiny red" onClick={apply}>
              Overwrite
            </button>
            <button className="btn tiny" onClick={() => setPending(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {msg && <p className="hint">{msg}</p>}
    </details>
  );
}
