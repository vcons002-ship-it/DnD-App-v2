import { useEffect } from 'react';
import { useStore } from '../state/socket';

/**
 * The second half of a two-step attack, as a big button pinned over the map.
 *
 * When an attack hits, the server parks the damage on its roll entry instead of
 * applying it (`RollEntry.pending`) and only ships that payload to the DM and to
 * the player who made the attack — so the prompt appears for exactly the people
 * who should click it. Clicking rolls the damage reveal and takes the HP off.
 *
 * Driven off the snapshot rather than a transient event, so it survives a
 * refresh, a reconnect, or a server restart: a landed hit can never be stranded.
 * Enter/Space fires it too, unless a text field has focus.
 */
export function DamagePrompt() {
  const snapshot = useStore((s) => s.snapshot);
  const combatDamage = useStore((s) => s.combatDamage);
  // The newest un-rolled hit. (The log is oldest-first and small.)
  const entry = [...(snapshot?.rollLog ?? [])]
    .reverse()
    .find((r) => r.pending && !r.pending.done);
  const rollId = entry?.id;

  useEffect(() => {
    if (!rollId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const el = document.activeElement;
      const tag = el?.tagName.toLowerCase();
      // Don't steal the key from chat, a dice expression, or any other field.
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      if (el instanceof HTMLElement && el.isContentEditable) return;
      e.preventDefault();
      combatDamage(rollId);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [rollId, combatDamage]);

  if (!entry?.pending || !rollId) return null;
  const p = entry.pending;
  return (
    <div className="damage-prompt">
      <button
        className={`damage-prompt-btn${p.crit ? ' crit' : ''}`}
        onClick={() => combatDamage(rollId)}
        title="Roll the damage for this hit and apply it (Enter / Space)"
      >
        <span className="dp-dice">🎲</span>
        <span className="dp-text">
          <strong>{p.crit ? 'CRIT — roll damage' : 'Roll damage'}</strong>
          <span className="dp-sub">
            {p.weapon} → {p.target.name}
          </span>
        </span>
      </button>
    </div>
  );
}
