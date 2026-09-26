import { useEffect, useRef } from 'react';
import { tokenDistanceFt } from '../../../shared/distance';
import { resolveToken } from '../lib/entities';
import { targetLabel } from '../lib/targets';
import { playHeal } from '../lib/sfx';
import { useStore } from '../state/socket';
import './chromatic-orb.css';

/** Continue the original cast; every target and leap budget is validated server-side. */
export function ChromaticOrbPrompt() {
  const snapshot = useStore(s => s.snapshot);
  const rollFx = useStore(s => s.rollFx);
  const leap = useStore(s => s.combatOrbLeap);
  const heard = useRef<string>();
  const entry = [...(snapshot?.rollLog ?? [])].reverse().find(r => r.apply?.orb?.available &&
    (!r.pending || r.pending.done) && (snapshot?.role !== 'dm' || r.roller === 'DM'));
  const orb = entry?.apply?.orb;
  const ready = !!entry && !rollFx && snapshot?.map?.id === orb?.origin.mapId;
  useEffect(() => {
    if (!ready || !entry || heard.current === entry.id) return;
    heard.current = entry.id;
    if (!orb?.initial) playHeal();
  }, [ready, entry?.id, orb?.initial]);
  if (!ready || !snapshot || !orb || !entry) return null;
  const range = orb.initial ? 90 : 30;
  const targets = snapshot.tokens.filter(t => t.mapId === orb.origin.mapId &&
    !orb.visited.includes(`${t.kind}:${t.refId}`) && !resolveToken(snapshot, t).objectKind &&
    tokenDistanceFt(orb.origin, t, snapshot.map) <= range + 1e-6)
    .sort((a,b) => tokenDistanceFt(orb.origin,a,snapshot.map) - tokenDistanceFt(orb.origin,b,snapshot.map));
  return <section className="orb-prompt" aria-label="Chromatic Orb" aria-live="polite">
    <strong>{orb.initial ? 'Launch Chromatic Orb' : 'Matching dice — Orb can leap!'}</strong>
    {!orb.initial && <div className="orb-matches" aria-label="Matching damage dice">
      {orb.matches.map((face,i) => <span key={i}>{face}</span>)}
    </div>}
    <p>{entry.apply?.damageType} · {orb.initial ? `Up to ${orb.slotLevel} leaps` : `Leap ${orb.leapsUsed + 1} of ${orb.slotLevel} · No extra spell slot`}</p>
    <div className="orb-targets">
      {targets.map(t => <button className="btn" key={t.id} onClick={() => leap(entry.id,t.id)}>
        {targetLabel(snapshot,t)} · {Math.round(tokenDistanceFt(orb.origin,t,snapshot.map))} ft
      </button>)}
      {!targets.length && <p>No new creatures within {range} feet.</p>}
    </div>
    <button className="btn orb-end" onClick={() => leap(entry.id,undefined,true)}>End spell</button>
  </section>;
}
