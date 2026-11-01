import { useCallback, useEffect, useMemo, useState } from 'react';
import { useStore } from '../state/socket';
import { DamagePrompt, isDamagePromptDismissed, smiteOptionsFor, useDamagePromptDismissals } from './DamagePrompt';
import { safeSetItem } from '../lib/storage';
import './player-damage-prompt.css';

/** Action dock, outside the map's stacking context. These are the
 * existing pending-hit and spell-apply actions, not another cast/damage system.
 * The server still controls ownership, rolled damage, saves and dart budgets. */
export function PlayerDamagePrompt() {
  useDamagePromptDismissals();
  const snapshot = useStore((s) => s.snapshot);
  const armed = useStore((s) => s.saveResolve);
  const arm = useStore((s) => s.armSaveResolve);
  const clear = useStore((s) => s.clearSaveResolve);
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());
  const rolls = (snapshot?.rollLog ?? []).filter(r => snapshot?.role !== 'dm' || r.roller === 'DM');
  // A hit with parked damage, or one that still offers a smite (auto-damage
  // sessions have no parked damage, so the smite alone must surface it).
  const hit = snapshot && snapshot.role !== 'dm'
    ? [...rolls].reverse().find(
        (r) =>
          ((r.pending && !r.pending.done && !r.pending.awaitingShield) || smiteOptionsFor(r, snapshot).length > 0) &&
          !isDamagePromptDismissed(snapshot, r.id),
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
  const targetsLeft = apply?.maxTargets ? Math.max(0, apply.maxTargets - (apply.consumedTargets?.length ?? 0)) : undefined;
  const completed = (attacks > 0 && remainingAttacks === 0) || (darts > 0 && remaining === 0) ||
    (apply?.targetMode === 'single' && !!apply.consumedTargets?.length) || targetsLeft === 0;
  const saveOnly = !!apply?.save && apply.amount === 0 && !darts;
  const alreadyApplied = !attacks && !darts && !apply?.save && !apply?.healing && !!apply?.consumedTargets?.length;
  const active = armed?.rollId === spell?.id && !!armed;
  // Dismiss this cast's automatic dock, without consuming its damage or
  // preventing a deliberate reopen from the log. Scope to campaign and role
  // so sharing a browser does not dismiss another viewer's prompts.
  const dismissalKey = snapshot && spell
    ? `dnd.spell-prompt-dismissed.v1:${snapshot.sessionCode}:${snapshot.role}:${spell.id}`
    : undefined;
  const savedDismissal = useMemo(() => {
    try { return !!dismissalKey && localStorage.getItem(dismissalKey) === '1'; }
    catch { return false; }
  }, [dismissalKey]);
  const close = useCallback(() => {
    if (dismissalKey) {
      safeSetItem(dismissalKey, '1');
      setDismissed((previous) => new Set(previous).add(dismissalKey));
    }
    clear();
  }, [dismissalKey, clear]);
  const showSpell = !!spell && !!apply && !completed &&
    (active || (!alreadyApplied && !savedDismissal && !dismissed.has(dismissalKey!)));
  // Another client may finish a dart budget while this player is targeting.
  // Never leave an invisible targeting mode behind a completed prompt.
  useEffect(() => {
    if (armed && (!spell || completed)) clear();
  }, [armed, spell, completed, clear]);
  useEffect(() => {
    if (!showSpell || !spell) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      close();
    };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [showSpell, spell, close]);
  if (!hit && !showSpell) return null;
  // A deliberate active targeting mode stays visible even with an older hit.
  if (hit && (!armed || hit.pending?.sourceRollId === armed.rollId)) return <div className="player-damage-dock" aria-label="Damage action"><DamagePrompt /></div>;
  if (!spell || !apply || !showSpell) return null;
  return <section className="player-damage-dock spell-damage-dock" aria-label="Damage action">
    <div className={`damage-prompt spell-prompt${active ? ' targeting' : ''}`}>
      <button type="button" className="damage-prompt-btn" onClick={() => arm({
        rollId: spell.id, dc: apply.dc, save: apply.save, label: spell.expr,
        // Existing target clicks still roll each dart. Resuming a cast offers
        // only its server-reported remaining darts (no slot spend or new roll).
        splitTotal: darts ? remaining : undefined,
      })} title={apply.healing ? 'Choose up to six creatures on the map; each receives the same healing roll without casting again.' : attacks ? 'Choose targets on the map; each click rolls one separate spell attack. Finish its damage before the next ray.' : darts ? 'Choose targets on the map; each click rolls one dart' : saveOnly ? apply.effect ? 'Choose targets on the map; failed saves apply the linked spell condition automatically.' : 'Choose targets on the map to roll their saving throws. Apply spell effects manually.' : 'Choose targets on the map; use this cast’s existing damage and saving throws'}>
        <span className="dp-dice" aria-hidden="true">✦</span>
        <span className="dp-text">
          <strong>{active ? 'Choose targets on the map' : apply.healing ? 'Apply healing' : attacks ? 'Assign rays · roll attacks' : darts ? 'Roll damage · assign darts' : saveOnly ? 'Roll saving throws' : 'Apply spell damage'}</strong>
          <span className="dp-sub">{spell.label || spell.expr}{attacks ? ` · ${remainingAttacks} attack${remainingAttacks === 1 ? '' : 's'} left` : darts ? ` · ${remaining} dart${remaining === 1 ? '' : 's'} left` : `${saveOnly ? '' : ` · ${apply.amount} ${apply.healing ? 'HP' : 'damage'}`}${apply.save ? ` · DC ${apply.dc} ${apply.save}` : ''}${targetsLeft !== undefined ? ` · ${targetsLeft} targets left` : ''}`}</span>
        </span>
      </button>
      <button type="button" className="damage-prompt-dismiss" onClick={close} title="Dismiss this prompt permanently in this browser; reopen it from the roll log">{active ? 'Done' : 'Close'}</button>
    </div>
  </section>;
}
