import { useEffect, useState } from 'react';
import { useStore } from '../state/socket';
import { DamagePrompt, smiteOptionsFor } from './DamagePrompt';
import './player-damage-prompt.css';

/** Player-only action dock, outside the map's stacking context. These are the
 * existing pending-hit and spell-apply actions, not another cast/damage system.
 * The server still controls ownership, rolled damage, saves and dart budgets. */
export function PlayerDamagePrompt() {
  const snapshot = useStore((s) => s.snapshot);
  const armed = useStore((s) => s.saveResolve);
  const arm = useStore((s) => s.armSaveResolve);
  const clear = useStore((s) => s.clearSaveResolve);
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());
  const rolls = snapshot?.rollLog ?? [];
  // A hit with parked damage, or one that still offers a smite (auto-damage
  // sessions have no parked damage, so the smite alone must surface it).
  const hit = snapshot
    ? [...rolls].reverse().find(
        (r) => (r.pending && !r.pending.done) || smiteOptionsFor(r, snapshot).length > 0,
      )
    : undefined;
  // Consider only the latest cast, not every old AoE still in the history.
  // An explicitly re-opened log action always takes precedence.
  const spell = armed
    ? rolls.find((r) => r.id === armed.rollId && r.apply && !r.apply.orb)
    : [...rolls].reverse().find((r) => r.apply && !r.apply.orb);
  const apply = spell?.apply;
  const attacks = apply?.attacks ?? 0;
  const remainingAttacks = Math.max(0, attacks - (apply?.consumedAttacks ?? 0));
  const darts = apply?.darts ?? apply?.split?.length ?? 0;
  const remaining = Math.max(0, darts - (apply?.consumedDarts ?? 0));
  const completed = (attacks > 0 && remainingAttacks === 0) || (darts > 0 && remaining === 0) ||
    (apply?.targetMode === 'single' && !!apply.consumedTargets?.length);
  const saveOnly = !!apply?.save && apply.amount === 0 && !darts;
  const alreadyApplied = !attacks && !darts && !apply?.save && !!apply?.consumedTargets?.length;
  const active = armed?.rollId === spell?.id && !!armed;
  const showSpell = !!spell && !!apply && !completed && (active || (!alreadyApplied && !dismissed.has(spell.id)));
  // Another client may finish a dart budget while this player is targeting.
  // Never leave an invisible targeting mode behind a completed prompt.
  useEffect(() => {
    if (armed && (!spell || completed)) clear();
  }, [armed, spell, completed, clear]);
  useEffect(() => {
    if (!active || !spell) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setDismissed((previous) => new Set(previous).add(spell.id));
      clear();
    };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [active, spell, clear]);
  if (!hit && !showSpell) return null;
  // A deliberate active targeting mode stays visible even with an older hit.
  if (hit && (!armed || hit.pending?.sourceRollId === armed.rollId)) return <div className="player-damage-dock" aria-label="Damage action"><DamagePrompt /></div>;
  if (!spell || !apply || !showSpell) return null;
  const close = () => {
    if (active) clear();
    setDismissed((previous) => new Set(previous).add(spell.id));
  };
  return <section className="player-damage-dock spell-damage-dock" aria-label="Damage action">
    <div className={`damage-prompt spell-prompt${active ? ' targeting' : ''}`}>
      <button type="button" className="damage-prompt-btn" onClick={() => arm({
        rollId: spell.id, dc: apply.dc, save: apply.save, label: spell.expr,
        // Existing target clicks still roll each dart. Resuming a cast offers
        // only its server-reported remaining darts (no slot spend or new roll).
        splitTotal: darts ? remaining : undefined,
      })} title={attacks ? 'Choose targets on the map; each click rolls one separate spell attack. Finish its damage before the next ray.' : darts ? 'Choose targets on the map; each click rolls one dart' : saveOnly ? 'Choose targets on the map to roll their saving throws. Apply spell effects manually.' : 'Choose targets on the map; use this cast’s existing damage and saving throws'}>
        <span className="dp-dice" aria-hidden="true">✦</span>
        <span className="dp-text">
          <strong>{active ? 'Choose targets on the map' : attacks ? 'Assign rays · roll attacks' : darts ? 'Roll damage · assign darts' : saveOnly ? 'Roll saving throws' : 'Apply spell damage'}</strong>
          <span className="dp-sub">{spell.label || spell.expr}{attacks ? ` · ${remainingAttacks} attack${remainingAttacks === 1 ? '' : 's'} left` : darts ? ` · ${remaining} dart${remaining === 1 ? '' : 's'} left` : `${saveOnly ? '' : ` · ${apply.amount} damage`}${apply.save ? ` · DC ${apply.dc} ${apply.save}` : ''}`}</span>
        </span>
      </button>
      <button type="button" className="damage-prompt-dismiss" onClick={close} title="Close this prompt; the spell remains available in the roll log">{active ? 'Done' : 'Close'}</button>
    </div>
  </section>;
}
