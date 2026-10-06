import {LiveDiceOverlay} from './LiveDiceOverlay';
import { hasNaturalTwenty, rollOutcomeLabel } from '../../../shared/rollReveal';
import {diceEntrySide} from '../lib/diceEntrySide';
import type {DiceEntrySide} from '../lib/diceTrayTypes';
import { PhysicsDiceTray } from './PhysicsDiceTray';
import type { TrayDie } from '../lib/diceTrayTypes';
import { diceThemeForRoll } from '../../../shared/diceThemes';
import { flattenDamageDice } from '../../../shared/diceVisuals';
import { memo, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../state/socket';
import { playHit, playMiss, playSkill, playCritical } from '../lib/sfx';
import { ThreeDie, DiceThemeContext } from './ThreeDie';
import type { RollComparison } from '../../../shared/types';

// Pacing (ms). Tweak to taste.
const STEP_MS = 550; // each to-hit / modifier chip flying in
const OUTCOME_MS = 340; // beat before the HIT/MISS stamp
const RESULT_STAMP_HOLD_MS = 1200; // let the result read before clearing the map
const DMG_GAP_MS = 300; // beat before the damage dice start rolling
const HOLD_MS = 6500; // linger on the final numbers after damage concludes
const DART_HOLD_MS = 6500; // linger for a damage-only burst (Fireball cast / MM dart)

type Stage = {
  phase: 'rolling' | 'landing' | 'tohit' | 'outcome' | 'damage';
  dieFace: number; // the big d20 number (cycles while 'rolling', then locks)
  toHitShown: number; // how many to-hit bonus chips are revealed
  diceLocked: number; // how many INDIVIDUAL damage dice have settled
  diceStopping: number; // authoritative faces assigned; 3D landing may still run
  modsShown: number; // how many damage-mod chips are revealed
};

/** Ease a displayed number toward `target` (cubic-out) so totals visibly climb. */
function useTween(target: number, ms = 260): number {
  const [val, setVal] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    if (ms === 0) { from.current = target; setVal(target); return; }
    const start = performance.now();
    const a = from.current;
    const b = target;
    if (a === b) return;
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / ms);
      const e = 1 - Math.pow(1 - p, 3);
      const cur = Math.round(a + (b - a) * e);
      setVal(cur);
      from.current = cur;
      if (p < 1) raf = requestAnimationFrame(tick);
      else from.current = b;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return val;
}

/** One die drawn in its real polygon shape (d4 triangle, d6 square, d8 diamond,
 *  d10 kite, d12 pentagon, d20 hexagon) with its face value centred. While
 *  `rolling`, the shape tumbles and its number flickers. */
function DieShape({
  sides,
  value,
  big,
  rolling,
  crit,
  onSettled,
}: {
  sides: number;
  value: number;
  big?: boolean;
  rolling?: boolean;
  crit?: boolean;
  onSettled?: () => void;
}) {
  const player = useStore(s => s.snapshot?.role === 'player');
  if (player) return <ThreeDie sides={sides} value={value} big={big} rolling={rolling} crit={crit} onSettled={onSettled} />;
  return (
    <span
      className={`die die-d${sides === 100 ? 10 : sides}${big ? ' die-big' : ''}${rolling ? ' rolling' : ''}${
        crit ? ' die-crit' : ''
      }`}
    >
      {value}
    </span>
  );
}

/** A pseudo-random face for a tumbling die (changes with the cycle tick). */
const flicker = (tick: number, seed: number, sides: number) =>
  1 + ((tick * 7 + seed * 13 + 5) % sides);

/** Both server-recorded candidates remain visible. The kept/discarded labels
 * appear only after the dice land; no random or inferred result is introduced. */
function ComparedDice({ comparison, locked, stopping, tick, onSettled }: {
  comparison: RollComparison;
  locked: number;
  stopping: number;
  tick: number;
  onSettled?: (index: number, set: number) => void;
}) {
  const settled = comparison.sets.every((set) => locked >= set.dice.length);
  return (
    <div className="rr-comparison" data-mode={comparison.mode}>
      <div className="rr-comparison-title">
        {comparison.mode === 'adv' ? 'Advantage · keep higher' : 'Disadvantage · keep lower'}
      </div>
      <div className="rr-comparison-sets">
        {comparison.sets.map((set, setIndex) => {
          const kept = setIndex === comparison.kept;
          return (
            <div key={setIndex} className={`rr-candidate${settled ? kept ? ' is-kept' : ' is-discarded' : ''}`}
              data-candidate={setIndex} data-result={settled ? kept ? 'kept' : 'discarded' : 'rolling'}>
              <div className="rr-candidate-label">{settled ? kept ? 'Kept' : 'Discarded' : `Roll ${setIndex + 1}`}</div>
              <div className="rr-candidate-dice">
                {set.dice.map((die, i) => (
                  <span key={i} className="rr-candidate-die">
                    {die.negative && <span className="rr-negative-die" title="Subtract this die">−</span>}
                    <DieShape sides={die.sides} big={set.dice.length === 1 && die.sides !== 100}
                      value={i < stopping ? die.value : flicker(tick, setIndex * 101 + i, die.sides)} rolling={i >= stopping}
                      onSettled={() => onSettled?.(i, setIndex)} />
                  </span>
                ))}
              </div>
              {comparison.kind === 'dice' && <div className="rr-candidate-total">{settled ? `Set total ${set.total}` : 'Rolling…'}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * A staged attack-roll reveal everyone sees when an attack resolves:
 *   1. the d20 tumbles and lands on its natural face;
 *   2. each bonus (ability mod, proficiency, …) flies in and the to-hit total
 *      counts UP;
 *   3. a HIT / MISS / CRIT / FUMBLE stamp lands;
 *   4. on a hit, the damage dice collide and settle together in the overhead tray,
 *      and the damage total climbs as they settle.
 * A Fireball cast / Magic Missile dart is a damage-only burst (no to-hit/stamp).
 * Non-blocking (the map stays interactive); click / tap / Esc skips it. Mechanics
 * already applied server-side — this is purely cosmetic.
 */
export const RollRevealOverlay = memo(function RollRevealOverlay() {
  // Warming is optional; disabled WebGL must retain the ordinary result fallback.
  useEffect(()=>{void import('../lib/diceTrayRenderer').then(async m=>{m.warmTrayGraphics();for(const theme of ['fighter','ranger','sorcerer']){const t=await m.loadTrayTexture(theme);t?.dispose();}}).catch(()=>{});},[]);
  const player = useStore(s => s.snapshot?.role === 'player');
  const [reducedMotion, setReducedMotion] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const changed = () => setReducedMotion(media.matches);
    media.addEventListener('change', changed);
    return () => media.removeEventListener('change', changed);
  }, []);
  const liveDice = useStore(s=>s.liveDice);
  const rollFx = useStore((s) => s.rollFx);
  const staticReveal = reducedMotion || !!rollFx?.reveal.physical;
  const dismiss = useStore((s) => s.dismissRollFx);
  const rollTheme = useStore(s => {
    const name = s.rollFx?.reveal.attacker;
    const roller = s.snapshot?.rollLog.find(r => r.id === s.rollFx?.rollId)?.roller;
    const direct = s.snapshot?.characters.filter(c => c.name === name) ?? [];
    const matches = direct.length ? direct : s.snapshot?.characters.filter(c => c.name === roller) ?? [];
    const npc=s.snapshot?.monsters.find(m=>m.name===name||name?.startsWith(m.name+' ')||m.name===roller);
    return diceThemeForRoll(matches.length===1?matches[0].className:'',!!npc||(!matches.length&&roller==='DM'),npc?.disposition);
  });
  const entrySide = useStore(s => {
    const roller = s.snapshot?.rollLog.find(r => r.id === s.rollFx?.rollId)?.roller;
    const name = s.rollFx?.reveal.attacker || roller || 'Unknown';
    const matches = s.snapshot?.characters.filter(c => c.name === name) ?? [];
    const character = matches.length === 1 ? matches[0] : undefined;
    const own = s.snapshot?.role === 'player'
      ? !!character?.claimedBy && character.claimedBy === s.socket?.id
      : name === 'DM' || !!character && !character.claimedBy;
    return diceEntrySide(own, character?.id ?? name);
  });
  // Only THIS viewer's own level-up HP roll lifts above an open level-up guide;
  // everyone else's rolls stay ordinary, non-blocking overlays.
  const ownLevelUpRoll = useStore(s => {
    const entry = s.rollFx ? s.snapshot?.rollLog.find(r => r.id === s.rollFx?.rollId) : undefined;
    const label = s.liveDice?.label ?? entry?.label;
    if (label !== 'Level-up Hit Point Increase' && label !== 'Level-up HP') return false;
    const roller = s.liveDice?.roller ?? entry?.roller;
    if (s.snapshot?.role === 'dm') return roller === 'DM';
    return !!s.snapshot?.characters.some(c => c.name === roller && !!c.claimedBy && c.claimedBy === s.socket?.id);
  });
  // A new roll gets fresh stages AND fresh tween origins. Replacing an attack
  // with its damage must never briefly paint the previous roll's final total.
  const content = liveDice ? <LiveDiceOverlay /> : rollFx ? <DiceThemeContext.Provider value={rollTheme}><RollSequence key={rollFx.id} rollFx={rollFx} entrySide={entrySide} player={player} staticReveal={staticReveal} animatePhysical={!reducedMotion && !!rollFx.reveal.physical} dismiss={dismiss} /></DiceThemeContext.Provider> : null;
  if (!content) return null;
  // Decided per roll, not once per mount: the guide may open or close between
  // rolls. Keyed so the modal layer comes and goes with the decision.
  const lift = ownLevelUpRoll && !!document.querySelector('dialog[data-level-up][open]');
  return lift ? <LevelUpRollLayer key="lift" player={player}>{content}</LevelUpRollLayer> : content;
});

/** A native character dialog is above ordinary fixed overlays. Let the real
 * Hit Die tray sit above the level-up guide without closing or losing its draft. */
function LevelUpRollLayer({ children, player }: { children: ReactNode; player: boolean }) {
  const [target] = useState(() => document.createElement('dialog'));
  useLayoutEffect(() => {
    if (!target) return;
    target.className = `level-up-roll-layer ${player ? 'player-fantasy' : 'dm-fantasy'}`;
    target.setAttribute('aria-label', 'Level-up Hit Die roll');
    // Escape cannot cancel an authoritative physical toss. The normal result
    // card still handles skipping once that toss has completed.
    const preventCancel = (event: Event) => event.preventDefault();
    target.addEventListener('cancel', preventCancel);
    document.body.append(target);
    target.showModal();
    return () => { target.removeEventListener('cancel', preventCancel); target.close(); target.remove(); };
  }, [target, player]);
  return target ? createPortal(children, target) : children;
}

function RollSequence({ rollFx, entrySide, player, staticReveal, animatePhysical, dismiss }: {
  rollFx: NonNullable<ReturnType<typeof useStore.getState>['rollFx']>;
  entrySide: DiceEntrySide;
  player: boolean;
  staticReveal: boolean;
  animatePhysical: boolean;
  dismiss: () => void;
}) {
  const releaseImpact = useStore((s) => s.releaseRollImpact);
  const rollTheme = useContext(DiceThemeContext);
  const landings = useRef<{ d20?: (set: number) => void; damage?: (index: number, set: number) => void }>({});
  const reveal = rollFx?.reveal;
  const awaitingDamage=useStore(s=>!!s.snapshot?.rollLog.some(e=>e.id===rollFx.rollId&&e.pending&&!e.pending.done));
  const resultHoldMs=reveal?.kind==='check' && ['pass','fail'].includes(reveal.outcome)?8000:awaitingDamage?1200:HOLD_MS;
  const comparison = reveal?.comparison;
  // A 'check' is a single-d20 skill/save/check → total (no damage phase). A 'dice'
  // roll (`/roll`, dice-panel buttons) and a spell-damage 'damage' burst are both
  // dice-only bursts (no to-hit); 'dice' just labels itself with the expression
  // and colours its total neutrally instead of as damage.
  const isCheck = reveal?.kind === 'check';
  const isDice = reveal?.kind === 'dice';
  const isBurst = reveal?.kind === 'damage' || isDice;
  const naturalTwenty = hasNaturalTwenty(reveal);

  const [stage, setStage] = useState<Stage>({
    phase: 'rolling',
    dieFace: 0,
    toHitShown: 0,
    diceLocked: 0,
    diceStopping: 0,
    modsShown: 0,
  });

  const dice = reveal?.damageDice ?? [];
  const mods = reveal?.damageMods ?? [];
  const toHit = reveal?.toHit ?? [];
  const faces = flattenDamageDice(dice);

  // Drive the timeline. Re-runs per roll (keyed on the FX id); all timers
  // clear on unmount or replacement so a rapid follow-up roll leaves nothing stale.
  useEffect(() => {
    if (!rollFx || !reveal) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const at = (ms: number, fn: () => void) => timers.push(setTimeout(fn, ms));
    const cleanup = () => {
      timers.forEach(clearTimeout);
      landings.current = {};
    };


    const allFaces = flattenDamageDice(reveal.damageDice);
    const visualDiceCount = comparison?.kind === 'dice'
      ? Math.max(...comparison.sets.map((set) => set.dice.length))
      : allFaces.length;
    const localMods = reveal.damageMods ?? [];
    if (animatePhysical) {
      // Live physics already revealed the dice. Continue with the labeled
      // arithmetic before collapsing to the map-impact summary.
      const adjustments = isBurst ? localMods : toHit;
      setStage({phase:isBurst?'damage':'tohit',dieFace:reveal.d20??0,toHitShown:0,
        diceLocked:visualDiceCount,diceStopping:visualDiceCount,modsShown:0});
      adjustments.forEach((_,i)=>at(STEP_MS*(i+1),()=>setStage(p=>({...p,
        ...(isBurst?{modsShown:i+1}:{toHitShown:i+1})}))));
      const complete=adjustments.length*STEP_MS+900;
      at(complete,()=>{
        setStage(p=>({...p,phase:isBurst?'damage':'outcome'}));
        if(naturalTwenty||reveal.outcome==='crit')playCritical();
        else if(reveal.outcome==='miss'||reveal.outcome==='fumble'||reveal.outcome==='fail')playMiss();
        else if(isCheck||isDice)playSkill();else playHit();
      });
      const impactAt=complete+(!isBurst&&reveal.outcome!=='none'?RESULT_STAMP_HOLD_MS:0);
      at(impactAt,()=>releaseImpact(rollFx.rollId));
      at(impactAt+resultHoldMs,dismiss);
      return cleanup;
    }
    if (staticReveal) {
      if(reveal.physical){if(naturalTwenty||reveal.outcome==='crit')playCritical();else if(reveal.outcome==='miss'||reveal.outcome==='fumble'||reveal.outcome==='fail')playMiss();else if(isCheck||isDice)playSkill();else playHit();}
      setStage({ phase: 'damage', dieFace: reveal.d20 ?? 0, toHitShown: toHit.length, diceLocked: visualDiceCount, diceStopping: visualDiceCount, modsShown: localMods.length });
      at(0, () => releaseImpact(rollFx.rollId));
      at(resultHoldMs, dismiss);
      return cleanup;
    }
    if (!staticReveal) {
      // One presentation clock: the tray reports its physically settled
      // landing. Only then may totals count it, labels resolve, and damage FX
      // play. Server HP/data already changed; this gates cosmetic feedback only.
      const startDamage = (delay: number, sound?: () => void) => {
        const landed = new Set<string>();
        let finished = false;
        const complete = () => {
          if (finished) return;
          finished = true;
          localMods.forEach((_, i) => at(STEP_MS * (i + 1), () => setStage((p) => ({ ...p, modsShown: i + 1 }))));
          const end = localMods.length * STEP_MS + 260;
          at(end, () => { sound?.(); releaseImpact(rollFx.rollId); });
          at(end + (isBurst ? DART_HOLD_MS : HOLD_MS), dismiss);
        };
        landings.current.damage = (index, set) => {
          landed.add(`${index}:${set}`);
          let locked = 0;
          while (locked < visualDiceCount) {
            const sets = comparison?.kind === 'dice'
              ? comparison.sets.flatMap((candidate, group) => locked < candidate.dice.length ? [group] : []) : [0];
            if (!sets.every((group) => landed.has(`${locked}:${group}`))) break;
            locked++;
          }
          setStage((p) => ({ ...p, diceLocked: locked }));
          if (locked === visualDiceCount) complete();
        };
        at(delay, () => {
          setStage((p) => ({ ...p, phase: 'damage', diceLocked: 0, diceStopping: 0, modsShown: 0 }));
          if (!visualDiceCount) { complete(); return; }

        });
      };
      if (isBurst) startDamage(0, isDice ? naturalTwenty ? playCritical : playSkill : playHit);
      else {
        // Also reset when reduced-motion changes during the same visible roll.
        setStage({ phase: 'rolling', dieFace: 1, toHitShown: 0, diceLocked: 0, diceStopping: 0, modsShown: 0 });
        const landed = new Set<number>();
        landings.current.d20 = (set) => {
          landed.add(set);
          if (landed.size < (comparison?.kind === 'd20' ? comparison.sets.length : 1)) return;
          landings.current.d20 = undefined;
          setStage((p) => ({ ...p, phase: 'tohit', dieFace: reveal.d20 ?? p.dieFace }));
          toHit.forEach((_, i) => at(STEP_MS * (i + 1), () => setStage((p) => ({ ...p, toHitShown: i + 1 }))));
          const outcomeAt = toHit.length * STEP_MS + OUTCOME_MS;
          at(outcomeAt, () => {
            setStage((p) => ({ ...p, phase: 'outcome' }));
            if (isCheck) naturalTwenty ? playCritical() : reveal.outcome === 'fail' ? playMiss() : playSkill();
            else if (reveal.outcome === 'crit') playCritical();
            else if (reveal.outcome === 'hit') playHit();
            else playMiss();
          });
          const hasDamage = (reveal.damage ?? 0) > 0 && allFaces.length + localMods.length > 0;
          if (hasDamage) startDamage(outcomeAt + DMG_GAP_MS);
          else {
            at(outcomeAt, () => releaseImpact(rollFx.rollId));
            at(outcomeAt + resultHoldMs, dismiss);
          }
        };

      }
      return cleanup;
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rollFx?.id, staticReveal, animatePhysical]);

  // Running totals (tweened so the numbers visibly climb as dice settle).
  const toHitTarget =
    (reveal?.d20 ?? 0) + toHit.slice(0, stage.toHitShown).reduce((s, x) => s + x.value, 0);
  // Compared expression sets include negative dice in their visual order, while
  // legacy reveal.damageDice contains only positive dice (negative terms remain
  // modifier chips). Do not count a later positive die before it visibly lands.
  const positiveDiceLocked = comparison?.kind === 'dice'
    ? comparison.sets[comparison.kept].dice.slice(0, stage.diceLocked).filter((die) => !die.negative).length
    : stage.diceLocked;
  const dmgTarget =
    faces.slice(0, positiveDiceLocked).reduce((s, f) => s + f.value, 0) +
    mods.slice(0, stage.modsShown).reduce((s, m) => s + m.value, 0);
  const toHitShownNum = useTween(stage.phase === 'rolling' || stage.phase === 'landing' ? 0 : toHitTarget, staticReveal && !animatePhysical ? 0 : 260);
  const dmgShownNum = useTween(dmgTarget, staticReveal && !animatePhysical ? 0 : 260);

  // Skip on Escape (parity with click/tap-to-skip).
  useEffect(() => {
    if (!rollFx) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && dismiss();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [rollFx, dismiss]);

  if (!rollFx || !reveal) return null;

  const mapImpact = !!rollFx.impactReady && ((!isCheck && !isDice) || !!rollFx.hasMapImpact);
  const showNaturalTwenty = naturalTwenty && (staticReveal || (isCheck ? stage.phase === 'outcome' || stage.phase === 'damage' : !!rollFx.impactReady));
  const outcomeLabel = rollOutcomeLabel(reveal);
  // The result stamp shows once the roll resolves — but only when there IS a
  // pass/fail/hit result (a plain check or `/roll` has outcome 'none' → no stamp).
  const showOutcome =
    !isBurst &&
    (stage.phase === 'outcome' || stage.phase === 'damage') &&
    reveal.outcome !== 'none';
  // Hold the colour back until the result reveals (grey while rolling/building up).
  const colourClass = showOutcome ? `roll-reveal-${reveal.outcome}` : 'roll-reveal-pending';
  // A 'dice' roll always shows its total (even 0/negative); a damage burst only
  // when it dealt damage.
  const showDamage =
    (isBurst || stage.phase === 'damage') && (isDice || (reveal.damage ?? 0) > 0);

  const attackTray:TrayDie[]=comparison?.kind==='d20'
    ? comparison.sets.flatMap((set,group)=>set.dice.map((d,index)=>({...d,index,set:group})))
    : [{sides:20,value:reveal.d20??1,index:0,set:0}];
  const damageTray:TrayDie[]=comparison?.kind==='dice'
    ? comparison.sets.flatMap((set,group)=>set.dice.map((d,index)=>({...d,index,set:group})))
    : faces.map((d,index)=>({...d,index,set:0}));
  return (
    // Click-through backdrop (pointer-events:none) so play isn't blocked.
    <div className={`roll-reveal-backdrop${mapImpact ? ' is-impact' : ''}`}>
      <div
        key={rollFx.id}
        className={`roll-reveal ${colourClass}`}
        data-roll-id={rollFx.rollId}
        data-reveal-kind={reveal.kind}
        data-dice-theme={rollTheme.id}
        data-phase={stage.phase}
        data-impact-ready={!!rollFx.impactReady}
        onClick={dismiss}
        title="Click to skip"
      >
        {reveal.title && <div className="rr-title">{reveal.title.replace(/\bsave\b/i,'Saving Throw')}</div>}
        <div className="roll-reveal-who">
          {reveal.attacker}
          {reveal.target ? <span className="rr-arrow"> &rarr; {reveal.target}</span> : reveal.kind==='damage' ? <span className="rr-arrow"> &middot; Targets not selected</span> : ''}
        </div>
        {mapImpact && (!reveal.hideModifiers||reveal.kind==='damage') && <div className="roll-impact-summary" role="status">
          <strong>{reveal.damage !== undefined ? reveal.damage : reveal.attackTotal}</strong>
          <span>{reveal.damage !== undefined ? isDice ? /healing/i.test(reveal.title??'')?'healing':'total' : `${reveal.damageType ?? ''} damage` : isCheck ? /save|saving throw/i.test(reveal.title??'')?'Save total':'Check total' : 'Attack total'}</span>
        </div>}
        {showNaturalTwenty && <div className="natural-twenty" role="status" aria-label="Natural 20 celebration">Nat 20!</div>}
        {/* Sub-headline for a check/dice roll: the check name or the expression. */}

        {!isBurst && (staticReveal || stage.phase !== 'damage') && (
          <div className={`roll-reveal-tohit${comparison?.kind === 'd20' ? ' rr-tohit-compared' : ''}`}>
            {!staticReveal ? <PhysicsDiceTray entrySide={entrySide} key="attack-tray" rollKey={rollFx.rollId+':attack'} comparison={comparison?.kind==='d20'?comparison:undefined} dice={attackTray} onSettled={(_,set)=>landings.current.d20?.(set)} /> : comparison?.kind === 'd20'
              ? <ComparedDice comparison={comparison} stopping={stage.phase === 'rolling' ? 0 : 1}
                locked={stage.phase === 'rolling' || stage.phase === 'landing' ? 0 : 1} tick={stage.dieFace}
                onSettled={(_, set) => landings.current.d20?.(set)} />
              : <DieShape sides={20} value={stage.dieFace || 0} big rolling={stage.phase === 'rolling'} onSettled={() => landings.current.d20?.(0)} />}
            {!reveal.hideModifiers&&<div className="rr-buildup rr-equation" aria-label="Roll calculation">
              {stage.phase !== 'rolling' && stage.phase !== 'landing' && <>
                <span className="rr-equation-base"><strong>{reveal.d20}</strong><small>{comparison?'Kept d20':'d20 roll'}</small></span>
                {toHit.slice(0, stage.toHitShown).map((s, i) => (
                  <span className={`rr-chip rr-adjustment ${s.value<0?'negative':'positive'}`} key={i}>
                    <strong>{s.value >= 0 ? '+' : '-'}{Math.abs(s.value)}</strong><small>{s.label}</small>
                  </span>
                ))}
                <span className="rr-equals">=</span>
              </>}
              <span className="rr-equation-total"><strong className="rr-total">{toHitShownNum}</strong><small>{stage.phase==='rolling'||stage.phase==='landing'?'Rolling...':stage.toHitShown<toHit.length?'Adding modifiers...':'Total'}</small></span>
            </div>}
          </div>
        )}

        {!staticReveal && comparison && ((comparison.kind==='d20' && stage.phase!=='rolling' && stage.phase!=='landing') || (comparison.kind==='dice' && stage.diceLocked>0)) && <div className="rr-comparison-title">{comparison.mode==='adv'?'Advantage':'Disadvantage'} / Kept roll {comparison.kept+1}</div>}
        {showOutcome && <div className="roll-reveal-outcome" role="status" aria-label="Roll result">
          {outcomeLabel}
        </div>}
        {showOutcome && reveal.effectOutcome && <div className="rr-title" role="status" aria-label="Spell outcome">{reveal.effectOutcome}</div>}
        {showOutcome && reveal.outcome === 'crit' && <div className="critical-flourish" aria-label="Critical hit celebration">
          <span aria-hidden="true">✦</span><strong>DEVASTATING STRIKE</strong><span aria-hidden="true">✦</span>
          <small>Double the damage dice</small>
        </div>}

        {showDamage && (
          <div className="roll-reveal-damage">
            {/* Every damage die, each tumbling until it settles on its face. */}
            {!staticReveal ? <PhysicsDiceTray entrySide={entrySide} key="damage-tray" rollKey={rollFx.rollId+':damage'} comparison={comparison?.kind==='dice'?comparison:undefined} dice={damageTray} onSettled={(index,set)=>landings.current.damage?.(index,set)} /> : comparison?.kind === 'dice' ? <ComparedDice comparison={comparison} locked={stage.diceLocked} stopping={stage.diceStopping} tick={0}
              onSettled={(index, set) => landings.current.damage?.(index, set)} /> : <div className="rr-dice-row">
              {faces.map((f, i) => {
                const locked = i < stage.diceStopping;
                return (
                  <DieShape
                    key={i}
                    sides={f.sides}
                    big={player && faces.length <= 3}
                    value={locked ? f.value : flicker(0, i, f.sides)}
                    rolling={!locked}
                    crit={f.crit}
                    onSettled={() => landings.current.damage?.(i, 0)}
                  />
                );
              })}
            </div>}
            {reveal.hideModifiers ? (reveal.kind==='damage'&&reveal.damage!==undefined&&<div className="rr-equation"><strong className="rr-dmg-num">{reveal.damage}</strong><small>{reveal.damageType??''} damage</small></div>) : <div className="rr-equation" aria-label="Damage or dice calculation">
              {(stage.diceLocked>0 || staticReveal || !faces.length) && <>
                <span className="rr-equation-base"><strong>{faces.slice(0,positiveDiceLocked).reduce((sum,die)=>sum+die.value,0)}</strong><small>Dice subtotal</small></span>
                {mods.slice(0, stage.modsShown).map((m, i) => (
                  <span className={`rr-chip rr-adjustment ${m.value<0?'negative':'positive'}`} key={`m${i}`}>
                    <strong>{m.value >= 0 ? '+' : '-'}{Math.abs(m.value)}</strong><small>{m.label}</small>
                  </span>
                ))}
                <span className="rr-equals">=</span>
              </>}
              <span className="rr-equation-total"><strong className={isDice ? 'rr-roll-num' : 'rr-dmg-num'}>{dmgShownNum}</strong>
                <small>{stage.diceLocked<faces.length?'Rolling...':stage.modsShown<mods.length?'Applying modifiers...':isDice?'Total':`${reveal.damageBreakdown?.mixedTypes?'Mixed':reveal.damageType??''} damage`}</small>
              </span>
            </div>}
          </div>
        )}
      </div>
    </div>
  );
}
