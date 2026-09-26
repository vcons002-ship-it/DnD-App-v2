import { useEffect, useState } from 'react';
import type { RollEntry, StateSnapshot } from '../../../shared/types';
import { smiteChoices, type SmiteChoice } from '../../../shared/smite';
import { useStore } from '../state/socket';

/** What a hit still offers: its parked damage, and/or a smite to cast on it. */
const openDamage = (r: RollEntry) => !!r.pending && !r.pending.done;
const openSmite = (r: RollEntry) => openDamage(r) && !!r.smite && !r.smite.used;

/**
 * Whether this hit's follow-up belongs to the viewer. A player only ever
 * RECEIVES their own payloads (visibility gate), so presence implies ownership.
 * The DM receives everyone's — the big prompt shows the DM only their OWN hits
 * (rolled as "DM"), so the second click stays with the player who earned it.
 * The roll-log buttons remain the DM's deliberate override.
 */
function isMine(r: RollEntry, snapshot: StateSnapshot): boolean {
  return snapshot.role !== 'dm' || r.roller === 'DM';
}

/** The ways the smite on this hit can be cast right now (shared rule). */
export function smiteOptionsFor(r: RollEntry, snapshot: StateSnapshot): SmiteChoice[] {
  const sm = r.smite;
  if (!sm || sm.used || !r.pending || r.pending.done) return [];
  const ch = snapshot.characters.find((c) => c.id === sm.owner);
  const ability = ch?.sheetAbilities.find((a) => a.id === sm.abilityId);
  return ch && ability ? smiteChoices(ch, ability) : [];
}

/**
 * The follow-up to a landed hit, as a big prompt pinned over the map: roll the
 * parked damage (two-step attacks), and — for a Paladin — cast Divine Smite with
 * a chosen slot or the free casting. Smite is offered only here, AFTER the hit,
 * so the player picks it knowing whether it hit or crit.
 *
 * Driven off the snapshot rather than a transient event, so it survives a
 * refresh, a reconnect, or a server restart. Enter/Space rolls the damage unless
 * a text field has focus.
 */
export function DamagePrompt() {
  const [smitePicker, setSmitePicker] = useState<string>();
  const snapshot = useStore((s) => s.snapshot);
  const combatDamage = useStore((s) => s.combatDamage);
  const combatSmite = useStore((s) => s.combatSmite);
  // The attack's own reveal is still playing — let the d20 land and the HIT stamp
  // drop before offering the follow-up. Cleared when the animation ends OR the
  // viewer skips it (click / tap / Esc), so it never gates on the full runtime.
  const rollFx = useStore((s) => s.rollFx);
  // The newest hit with something still to do. (The log is oldest-first and small.)
  const entry = snapshot
    ? [...snapshot.rollLog]
        .reverse()
        .find((r) => (openDamage(r) || openSmite(r)) && isMine(r, snapshot))
    : undefined;
  const rollId = entry?.id;
  const damageReady = !!entry && openDamage(entry);
  const smiteOptions = entry && snapshot ? smiteOptionsFor(entry, snapshot) : [];

  // Armed = there's a follow-up AND its reveal has finished (or been skipped).
  const armed = !!entry && !!rollId && rollFx?.rollId !== rollId;

  useEffect(() => {
    if (!armed || !rollId || !damageReady) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.repeat || (e.key !== 'Enter' && e.key !== ' ')) return;
      const el = document.activeElement;
      const tag = el?.tagName.toLowerCase();
      // Don't steal the key from chat, a dice expression, or any other field.
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      if (el instanceof HTMLElement && (el.isContentEditable || el.closest('button, a, [role="button"], [role="slider"], dialog'))) return;
      e.preventDefault();
      combatDamage(rollId);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [armed, rollId, damageReady, combatDamage]);

  if (!armed || !entry || !rollId || (!damageReady && smiteOptions.length === 0)) return null;
  const p = entry.pending;
  const crit = !!(p?.crit ?? entry.smite?.crit);
  return (
    <div className="damage-prompt">
      {damageReady && p && (
        <button
          className={`damage-prompt-btn${p.crit ? ' crit' : ''}`}
          onClick={() => combatDamage(rollId)}
          title={smiteOptions.length ? 'Apply this hit without Smite (Enter / Space)' : 'Roll the damage for this hit and apply it (Enter / Space)'}
        >
          <span className="dp-dice">🎲</span>
          <span className="dp-text">
            <strong>{p.crit ? 'CRIT — roll damage' : 'Roll damage'}</strong>
            <span className="dp-sub">
              {p.weapon} → {p.target.name}
            </span>
          </span>
        </button>
      )}
      {smiteOptions.length > 0 && entry.smite && (
        <div className={`dp-smite${crit ? ' crit' : ''}`}>
          <button className="btn tiny dp-smite-toggle"
            title="Add Smite to this hit (bonus action); choose a free use or spell slot"
            aria-expanded={smitePicker === rollId}
            onClick={() => setSmitePicker(smitePicker === rollId ? undefined : rollId)}>
            ✦ Smite{crit ? ' — CRIT' : ''}
          </button>
          {smitePicker === rollId && smiteOptions.map((opt) => (
            <button
              key={String(opt)}
              className="btn tiny dp-smite-btn"
              onClick={() => combatSmite(rollId, opt)}
              title={
                opt === 'free'
                  ? 'Cast it without a slot (once per Long Rest)'
                  : `Spend a level-${opt} spell slot`
              }
            >
              {opt === 'free' ? 'Free' : `L${opt}`}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
