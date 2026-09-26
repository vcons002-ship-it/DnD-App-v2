import { useEffect, useRef, useState } from 'react';
import { useStore } from '../state/socket';
import { playInitiative, playYourTurn } from '../lib/sfx';

/** Live announcements only: mounting/reconnecting never replays an old turn. */
export function CombatMoments() {
  const snapshot = useStore(s => s.snapshot);
  const socket = useStore(s => s.socket);
  const initiative = useStore(s => s.initiativeFx);
  const animate = useStore(s => s.showRollAnim);
  const riposte = useStore(s => s.combatRiposte);
  const [queue, setQueue] = useState<{id: string; title: string; detail: string; kind: 'initiative' | 'turn'}[]>([]);
  const lastTurn = useRef<string>();
  const lastInitiative = useRef(initiative?.id);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!initiative || initiative.id === lastInitiative.current) return;
    lastInitiative.current = initiative.id;
    if (snapshot?.map?.id !== initiative.mapId) return;
    setQueue(q => [...q, {id: `initiative-${initiative.id}`, title: 'Roll initiative!',
      detail: 'The battle begins', kind: 'initiative'}]);
  }, [initiative, snapshot?.map?.id]);

  useEffect(() => {
    if (!snapshot) return;
    const key = `${socket?.id}:${snapshot.sessionCode}:${snapshot.activeMapId}:${snapshot.round}:${snapshot.activeTurnTokenId}`;
    const previous = lastTurn.current;
    lastTurn.current = key;
    if (!previous || previous === key) return;
    setQueue(q => q.filter(v => v.kind !== 'turn'));
    if (!snapshot.round) return;
    // A socket change is a reconnect, not a new turn.
    if (!previous.startsWith(`${socket?.id}:${snapshot.sessionCode}:`)) return;
    const token = snapshot.tokens.find(t => t.id === snapshot.activeTurnTokenId);
    if (!token) return;
    const ch = token.kind === 'pc' ? snapshot.characters.find(c => c.id === token.refId) : null;
    const mine = snapshot.role === 'player' ? ch?.claimedBy === socket?.id
      : token.kind === 'monster' || !!ch && !ch.claimedBy;
    if (!mine) return;
    const name = ch?.name ?? snapshot.monsters.find(m => m.id === token.refId)?.name ?? 'Your creature';
    setQueue(q => [...q.filter(v => v.kind !== 'turn'), {id: key, title: 'Your Turn',
      detail: `${name} · Round ${snapshot.round}`, kind: 'turn'}]);
  }, [snapshot, socket?.id]);

  const banner = queue[0];
  useEffect(() => {
    if (!banner) return;
    banner.kind === 'initiative' ? playInitiative() : playYourTurn();
    const timer = window.setTimeout(() => setQueue(q => q.slice(1)), banner.kind === 'initiative' ? 4600 : 5400);
    return () => clearTimeout(timer);
  }, [banner?.id]);
  useEffect(() => {
    if (!snapshot?.ripostes?.length) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [snapshot?.ripostes]);
  const offer = snapshot?.ripostes?.find(o => o.expiresAt > now);
  const fighter = snapshot?.characters.find(c => c.id === offer?.owner);
  return <>
    {banner && <div className={`combat-moment combat-moment-${banner.kind} ${animate ? '' : 'no-motion'}`}
      style={{animationDuration: banner.kind === 'initiative' ? '4600ms' : '5400ms'}}
      role="status" aria-live="polite" key={banner.id}>
      <span className="combat-moment-kicker">{banner.kind === 'initiative' ? 'Combat' : 'Take the spotlight'}</span>
      <strong>{banner.title}</strong><span>{banner.detail}</span>
      <button aria-label="Dismiss announcement" onClick={() => setQueue(q => q.slice(1))}>×</button>
    </div>}
    {offer && fighter && <div className="riposte-prompt" role="region" aria-label="Riposte opportunity">
      <strong>Riposte?</strong><span>A melee attack missed {fighter.name}.</span>
      <small>Reaction + 1 Superiority Die · {Math.max(0, Math.ceil((offer.expiresAt - now) / 1000))}s</small>
      <div>{offer.weaponIndices.map(i => <button className="btn" key={i}
        onClick={() => riposte(offer.id, i)}>Riposte — {fighter.weapons[i]?.name ?? 'Weapon'}</button>)}
        <button className="btn" onClick={() => riposte(offer.id, undefined, true)}>Pass</button></div>
    </div>}
  </>;
}
