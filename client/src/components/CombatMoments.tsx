import { useEffect, useRef, useState } from 'react';
import {createPortal} from 'react-dom';
import { useStore } from '../state/socket';
import { playInitiative, playRest, playYourTurn } from '../lib/sfx';
import {CounterspellPrompt} from './CounterspellPrompt';
import {ShieldReactionPrompt} from './ShieldReactionPrompt';
import {CommandTurnPrompt} from './CommandTurnPrompt';

/** Live announcements only: mounting/reconnecting never replays an old turn. */
export function CombatMoments() {
  const snapshot = useStore(s => s.snapshot);
  const socket = useStore(s => s.socket);
  const initiative = useStore(s => s.initiativeFx);
  const rest = useStore(s => s.restFx);
  const animate = useStore(s => s.showRollAnim);
  const riposte = useStore(s => s.combatRiposte);
  const rollMyInitiative = useStore(s => s.rollMyInitiative);
  const rollRemaining = useStore(s => s.rollMissingInitiative);
  const rollFx = useStore(s => s.rollFx);
  const liveDice = useStore(s => s.liveDice);
  const [initiativeSubmitted,setInitiativeSubmitted]=useState(false);
  useEffect(()=>{setInitiativeSubmitted(false);},[snapshot?.initiativePending,snapshot?.map?.id,socket?.id]);
  useEffect(()=>{const reset=()=>setInitiativeSubmitted(false);socket?.on('error',reset);return()=>{socket?.off('error',reset);};},[socket]);
  useEffect(()=>{if(liveDice)setQueue(q=>q.filter(b=>b.kind!=='initiative'));},[liveDice?.id]);
  const pendingSeen = useRef(snapshot?.initiativePending);
  const [queue, setQueue] = useState<{id: string; title: string; detail: string; kind: 'initiative' | 'turn' | 'rest'}[]>([]);
  const lastTurn = useRef<string>();
  const lastInitiative = useRef(initiative?.id);
  const lastRest = useRef(rest?.id);
  const presented = useRef<string>();
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (snapshot?.initiativePending && !pendingSeen.current) playInitiative();
    pendingSeen.current = snapshot?.initiativePending;
  }, [snapshot?.initiativePending]);

  useEffect(() => {
    if (!initiative || initiative.id === lastInitiative.current) return;
    lastInitiative.current = initiative.id;
    if (snapshot?.map?.id !== initiative.mapId) return;
    setQueue(q => [...q, {id: `initiative-${initiative.id}`, title: 'Roll initiative!',
      detail: 'The battle begins', kind: 'initiative'}]);
  }, [initiative, snapshot?.map?.id]);

  useEffect(() => {
    if (!rest || rest.id === lastRest.current) return;
    lastRest.current = rest.id;
    setQueue(q => [...q, {id: `rest-${rest.id}`, title: rest.kind === 'long' ? 'Long Rest' : 'Short Rest',
      detail: rest.kind === 'long' ? 'HP, Hit Dice, slots and features restored'
        : 'Features refreshed — spend Hit Dice to heal', kind: 'rest'}]);
  }, [rest]);

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
    if (snapshot.role === 'player' && ch?.claimedBy !== socket?.id) return;
    const name = ch?.name ?? snapshot.monsters.find(m => m.id === token.refId)?.name ?? 'Your creature';
    setQueue(q => [...q.filter(v => v.kind !== 'turn'), {id: key,
      title: snapshot.role === 'dm' ? `${name}’s turn` : 'Your Turn',
      detail: snapshot.role === 'dm' ? `Round ${snapshot.round}` : `${name} · Round ${snapshot.round}`, kind: 'turn'}]);
  }, [snapshot, socket?.id]);

  // Starting an action consumes the invitation, even before the server's first
  // dice frame. A hidden roll must not leave an old turn announcement queued.
  useEffect(()=>{
    if(!socket)return;
    const acted=(event:string)=>{
      if(/^(?:combat:|ability:roll$|spell:(?:repeat|shield|counterspell)$|skill:roll$|save:(?:roll|resolve)$|check:roll$|dice:roll$|death:roll$|token:move$|object:interact$|trap:disarm$|item:use$)/.test(event))
        setQueue(q=>q.some(v=>v.kind==='turn')?q.filter(v=>v.kind!=='turn'):q);
    };
    socket.onAnyOutgoing(acted);
    return()=>{socket.offAnyOutgoing(acted);};
  },[socket]);
  // If a displayed turn is interrupted by a roll, retire it rather than
  // restarting its animation/sound when the tray closes. New turns queued
  // during someone else's roll can still announce when that roll finishes.
  useEffect(()=>{
    if(!liveDice&&!rollFx)return;
    const shown=presented.current;
    setQueue(q=>q.some(v=>v.kind==='turn'&&v.id===shown)
      ?q.filter(v=>v.kind!=='turn'||v.id!==shown):q);
  },[liveDice?.id,rollFx?.id]);
  const banner = liveDice || rollFx ? undefined : queue[0];
  const compactTurn=banner?.kind==='turn'&&snapshot?.role==='dm';
  const bannerDuration=compactTurn?2800:banner?.kind==='turn'?5400:4600;
  useEffect(() => {
    if (!banner) return;
    presented.current = banner.id;
    if(!compactTurn)(banner.kind === 'initiative' ? playInitiative : banner.kind === 'rest' ? playRest : playYourTurn)();
    const timer = window.setTimeout(() => setQueue(q => q.filter(v=>v.id!==banner.id)), bannerDuration);
    return () => clearTimeout(timer);
  }, [banner?.id,compactTurn,bannerDuration]);
  useEffect(() => {
    if (!snapshot?.ripostes?.length) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [snapshot?.ripostes]);
  const offer = snapshot?.ripostes?.find(o => o.expiresAt > now);
  const fighter = snapshot?.characters.find(c => c.id === offer?.owner);
  const waiting = snapshot?.initiativePending ? snapshot.tokens.filter(t =>
    t.kind === 'pc' && t.inCombatEffective && t.initiative === null) : [];
  const mine = waiting.find(t => snapshot?.characters.find(c => c.id === t.refId)?.claimedBy === socket?.id);
  const dmWaiting = snapshot?.initiativePending && snapshot.role === 'dm';
  const announcement=banner&&<div className={`combat-moment combat-moment-${banner.kind} ${compactTurn?'combat-moment-dm-turn':''} ${animate?'':'no-motion'}`}
    style={{animationDuration:`${bannerDuration}ms`}}
    role="status" aria-live="polite" aria-label={compactTurn?'Current turn':undefined} key={banner.id}>
    {!compactTurn&&<span className="combat-moment-kicker">{banner.kind==='initiative'?'Combat':banner.kind==='rest'?'The party rests':'Take the spotlight'}</span>}
    <strong title={banner.title}>{banner.title}</strong><span>{banner.detail}</span>
    <button aria-label="Dismiss announcement" onClick={()=>setQueue(q=>q.filter(v=>v.id!==banner.id))}>×</button>
  </div>;
  // Anchor the compact notice below the toolbar, even when it wraps on mobile.
  const turnHost=compactTurn?document.getElementById('dm-turn-announcement'):null;
  return <>
    <ShieldReactionPrompt/>
    <CounterspellPrompt/>
    <CommandTurnPrompt/>
    {(mine || dmWaiting) && !initiativeSubmitted && !liveDice && !rollFx && <div className={`combat-moment combat-moment-initiative initiative-persistent ${animate ? '' : 'no-motion'}`}
      role="region" aria-label="Initiative roll request">
      <span className="combat-moment-kicker">Combat is starting</span>
      <strong>Roll initiative!</strong>
      <span>{mine ? 'Roll to find your place in the turn order.' : `Waiting for ${waiting.length} player roll${waiting.length === 1 ? '' : 's'}.`}</span>
      <button className="btn initiative-roll-button" onClick={() => {setInitiativeSubmitted(true);setQueue(q=>q.filter(b=>b.kind!=='initiative'));mine ? rollMyInitiative(mine.id) : rollRemaining();}}>
        {mine ? 'Roll initiative' : 'Roll remaining'}
      </button>
    </div>}
    {snapshot?.initiativePending && !mine && !dmWaiting && <div className="initiative-waiting" role="status">Waiting for initiative rolls…</div>}
    {turnHost?createPortal(announcement,turnHost):announcement}
    {offer && fighter && <div className="riposte-prompt" role="region" aria-label="Riposte opportunity">
      <strong>Riposte?</strong><span>A melee attack missed {fighter.name}.</span>
      <small>Reaction + 1 Superiority Die · {Math.max(0, Math.ceil((offer.expiresAt - now) / 1000))}s</small>
      <div>{offer.weaponIndices.map(i => <button className="btn" key={i}
        onClick={() => riposte(offer.id, i)}>Riposte — {fighter.weapons[i]?.name ?? 'Weapon'}</button>)}
        <button className="btn" onClick={() => riposte(offer.id, undefined, true)}>Pass</button></div>
    </div>}
  </>;
}
