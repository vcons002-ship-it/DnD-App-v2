import { useEffect, useRef, useState } from 'react';
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
  const targeting = useStore(s => s.orbTarget);
  const setTargeting = useStore(s => s.setOrbTarget);
  const leap = useStore(s => s.combatOrbLeap);
  const [includeAllies, setIncludeAllies] = useState(false);
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
  useEffect(() => {
    if (targeting && (!ready || targeting.rollId !== entry?.id)) setTargeting(null);
  }, [ready, entry?.id, targeting, setTargeting]);
  useEffect(() => {
    const cancel = (e: KeyboardEvent) => { if (e.key === 'Escape') setTargeting(null); };
    window.addEventListener('keydown', cancel);
    return () => window.removeEventListener('keydown', cancel);
  }, [setTargeting]);
  if (!ready || !snapshot || !orb || !entry) return null;
  const range = orb.initial ? 90 : 30;
  const caster = entry.apply?.attack?.attacker;
  const side = (kind: string, refId: string) => kind === 'pc' ? 'friendly'
    : snapshot.monsters.find(m => m.id === refId)?.disposition ?? 'neutral';
  const casterSide = caster ? side(caster.kind, caster.refId) : 'friendly';
  const allied = (kind: string, refId: string) => (caster?.kind === kind && caster.refId === refId) ||
    (casterSide !== 'neutral' && side(kind, refId) === casterSide);
  const targets = snapshot.tokens.filter(t => (includeAllies || !allied(t.kind, t.refId)) && t.mapId === orb.origin.mapId &&
    !orb.visited.includes(`${t.kind}:${t.refId}`) && !resolveToken(snapshot, t).objectKind &&
    tokenDistanceFt(orb.origin, t, snapshot.map) <= range + 1e-6)
    .sort((a,b) => tokenDistanceFt(orb.origin,a,snapshot.map) - tokenDistanceFt(orb.origin,b,snapshot.map));
  const choosing = targeting?.rollId === entry.id;
  const selected = choosing ? snapshot.tokens.find(t => t.id === targeting.targetId) : undefined;
  const valid = !!selected && targets.some(t => t.id === selected.id);
  return <section className={`orb-prompt${choosing ? ' orb-picking' : ''}`} aria-label="Chromatic Orb" aria-live="polite">
    <strong>{orb.initial ? 'Launch Chromatic Orb' : 'Matching dice — Orb can leap!'}</strong>
    {!orb.initial && <div className="orb-matches" aria-label="Matching damage dice">
      {orb.matches.map((face,i) => <span key={i}>{face}</span>)}
    </div>}
    <p>{entry.apply?.damageType} · {orb.initial ? `Up to ${orb.slotLevel} leaps` : `Leap ${orb.leapsUsed + 1} of ${orb.slotLevel} · No extra spell slot`}</p>
    <label style={{display:'block',fontSize:13,marginBottom:10}}>
      <input type="checkbox" checked={includeAllies} onChange={e => setIncludeAllies(e.target.checked)} /> Include allies
    </label>
    <div className="orb-targets">
      {!choosing ? <button className="btn" onClick={() => setTargeting({rollId:entry.id})}>Choose target</button> : <>
        {selected ? <>
          <p><strong>{targetLabel(snapshot, selected)}</strong> · {Math.round(tokenDistanceFt(orb.origin,selected,snapshot.map))} ft</p>
          {valid ? <button className="btn" onClick={() => { leap(entry.id,selected.id); setTargeting(null); }}>Confirm target</button>
            : <p role="alert">Choose an eligible creature within {range} feet that this orb has not hit. Enable Include allies for friendly targets.</p>}
          <button className="btn" onClick={() => setTargeting({rollId:entry.id})}>Choose another</button>
        </> : <p>Click a creature on the map within {range} feet.</p>}
        <button className="btn" onClick={() => setTargeting(null)}>Cancel targeting</button>
      </>}
    </div>
    <button className="btn orb-end" onClick={() => leap(entry.id,undefined,true)}>End spell</button>
  </section>;
}
