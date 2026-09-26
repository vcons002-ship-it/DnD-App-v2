import { flattenDamageDice } from '../../../shared/diceVisuals';
import { memo, useEffect, useRef, useState } from 'react';
import { useStore } from '../state/socket';
import { playHit, playMiss, playSkill, playCritical } from '../lib/sfx';
import { ThreeDie } from './ThreeDie';
import type { RollComparison } from '../../../shared/types';

// Pacing (ms). Tweak to taste.
const ROLL_MS = 420; // d20 shuffle before it locks
const STEP_MS = 300; // each to-hit / modifier chip flying in
const OUTCOME_MS = 340; // beat before the HIT/MISS stamp
const DMG_GAP_MS = 300; // beat before the damage dice start rolling
const HOLD_MS = 1600; // linger on the final numbers after damage concludes
const DART_HOLD_MS = 1200; // linger for a damage-only burst (Fireball cast / MM dart)
const CYCLE_MS = 70; // how fast tumbling dice flip numbers

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
 *   4. on a hit, EACH damage die tumbles and lands one by one (proper shapes),
 *      and the damage total climbs as they settle.
 * A Fireball cast / Magic Missile dart is a damage-only burst (no to-hit/stamp).
 * Non-blocking (the map stays interactive); click / tap / Esc skips it. Mechanics
 * already applied server-side — this is purely cosmetic.
 */
export const RollRevealOverlay = memo(function RollRevealOverlay() {
  const player = useStore(s => s.snapshot?.role === 'player');
  const [reducedMotion, setReducedMotion] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const changed = () => setReducedMotion(media.matches);
    media.addEventListener('change', changed);
    return () => media.removeEventListener('change', changed);
  }, []);
  const staticReveal = reducedMotion;
  const rollFx = useStore((s) => s.rollFx);
  const dismiss = useStore((s) => s.dismissRollFx);
  // A new roll gets fresh stages AND fresh tween origins. Replacing an attack
  // with its damage must never briefly paint the previous roll's final total.
  return rollFx ? <RollSequence key={rollFx.id} rollFx={rollFx} player={player} staticReveal={staticReveal} dismiss={dismiss} /> : null;
});

function RollSequence({ rollFx, player, staticReveal, dismiss }: {
  rollFx: NonNullable<ReturnType<typeof useStore.getState>['rollFx']>;
  player: boolean;
  staticReveal: boolean;
  dismiss: () => void;
}) {
  const releaseImpact = useStore((s) => s.releaseRollImpact);
  const landings = useRef<{ d20?: (set: number) => void; damage?: (index: number, set: number) => void }>({});
  const reveal = rollFx?.reveal;
  const comparison = player ? reveal?.comparison : undefined;
  // A 'check' is a single-d20 skill/save/check → total (no damage phase). A 'dice'
  // roll (`/roll`, dice-panel buttons) and a spell-damage 'damage' burst are both
  // dice-only bursts (no to-hit); 'dice' just labels itself with the expression
  // and colours its total neutrally instead of as damage.
  const isCheck = reveal?.kind === 'check';
  const isDice = reveal?.kind === 'dice';
  const isBurst = reveal?.kind === 'damage' || isDice;

  const [stage, setStage] = useState<Stage>({
    phase: 'rolling',
    dieFace: 0,
    toHitShown: 0,
    diceLocked: 0,
    diceStopping: 0,
    modsShown: 0,
  });
  // Bumped by an interval while dice are tumbling, to flicker their numbers.
  const [rollTick, setRollTick] = useState(0);

  const dice = reveal?.damageDice ?? [];
  const mods = reveal?.damageMods ?? [];
  const toHit = reveal?.toHit ?? [];
  const faces = flattenDamageDice(dice);

  // Drive the timeline. Re-runs per roll (keyed on the FX id); all timers/intervals
  // clear on unmount or replacement so a rapid follow-up roll leaves nothing stale.
  useEffect(() => {
    if (!rollFx || !reveal) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const intervals: ReturnType<typeof setInterval>[] = [];
    const at = (ms: number, fn: () => void) => timers.push(setTimeout(fn, ms));
    const cleanup = () => {
      timers.forEach(clearTimeout);
      intervals.forEach(clearInterval);
      landings.current = {};
    };
    const stopCycles = () => {
      intervals.forEach(clearInterval);
      intervals.length = 0;
    };

    const allFaces = flattenDamageDice(reveal.damageDice);
    const visualDiceCount = comparison?.kind === 'dice'
      ? Math.max(...comparison.sets.map((set) => set.dice.length))
      : allFaces.length;
    const localMods = reveal.damageMods ?? [];
    if (staticReveal) {
      setStage({ phase: 'damage', dieFace: reveal.d20 ?? 0, toHitShown: toHit.length, diceLocked: visualDiceCount, diceStopping: visualDiceCount, modsShown: localMods.length });
      at(0, () => releaseImpact(rollFx.rollId));
      at(HOLD_MS, dismiss);
      return cleanup;
    }
    // Each die lands in quick succession; total dice-rolling time is bounded so a
    // 14d6 Fireball doesn't drag (faster per-die when there are many).
    const perDie = visualDiceCount
      ? Math.max(55, Math.min(150, Math.round(700 / visualDiceCount)))
      : 0;

    if (player) {
      // One presentation clock: the mesh reports its painted, face-forward
      // landing. Only then may totals count it, labels resolve, and damage FX
      // play. Server HP/data already changed; this gates cosmetic feedback only.
      const startDamage = (delay: number, sound?: () => void) => {
        const landed = new Set<string>();
        let finished = false;
        const complete = () => {
          if (finished) return;
          finished = true;
          stopCycles();
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
          intervals.push(setInterval(() => setRollTick((x) => x + 1), CYCLE_MS));
          for (let i = 0; i < visualDiceCount; i++) {
            at(ROLL_MS + perDie * (i + 1), () => setStage((p) => ({ ...p, diceStopping: i + 1 })));
          }
        });
      };
      if (isBurst) startDamage(0, isDice ? playSkill : playHit);
      else {
        // Also reset when reduced-motion changes during the same visible roll.
        setStage({ phase: 'rolling', dieFace: 1, toHitShown: 0, diceLocked: 0, diceStopping: 0, modsShown: 0 });
        const landed = new Set<number>();
        landings.current.d20 = (set) => {
          landed.add(set);
          if (landed.size < (comparison?.kind === 'd20' ? comparison.sets.length : 1)) return;
          landings.current.d20 = undefined;
          stopCycles();
          setStage((p) => ({ ...p, phase: 'tohit', dieFace: reveal.d20 ?? p.dieFace }));
          toHit.forEach((_, i) => at(STEP_MS * (i + 1), () => setStage((p) => ({ ...p, toHitShown: i + 1 }))));
          const outcomeAt = toHit.length * STEP_MS + OUTCOME_MS;
          at(outcomeAt, () => {
            setStage((p) => ({ ...p, phase: 'outcome' }));
            if (isCheck) reveal.outcome === 'fail' ? playMiss() : playSkill();
            else if (reveal.outcome === 'crit') playCritical();
            else if (reveal.outcome === 'hit') playHit();
            else playMiss();
          });
          const hasDamage = (reveal.damage ?? 0) > 0 && allFaces.length + localMods.length > 0;
          if (hasDamage) startDamage(outcomeAt + DMG_GAP_MS);
          else {
            at(outcomeAt, () => releaseImpact(rollFx.rollId));
            at(outcomeAt + HOLD_MS, dismiss);
          }
        };
        intervals.push(setInterval(() => setStage((p) => ({ ...p, dieFace: 1 + Math.floor(Math.random() * 20) })), CYCLE_MS));
        at(ROLL_MS, () => {
          stopCycles();
          setStage((p) => ({ ...p, phase: 'landing', dieFace: reveal.d20 ?? p.dieFace }));
        });
      }
      return cleanup;
    }

    // Roll the damage dice one by one (all visible + tumbling, settling in order),
    // then reveal the flat modifiers; `start` is when the damage phase begins.
    const scheduleDamage = (start: number, onImpact?: () => void) => {
      let t = start;
      at(start, () => {
        setStage((p) => ({ ...p, phase: 'damage', diceLocked: 0, diceStopping: 0, modsShown: 0 }));
        intervals.push(setInterval(() => setRollTick((x) => x + 1), CYCLE_MS));
        onImpact?.();
      });
      // Player dice get a readable tumble before settling; the established DM
      // timeline is unchanged. Both compared sets land in the same sequence.
      if (player && visualDiceCount) t += ROLL_MS;
      for (let i = 0; i < visualDiceCount; i++) {
        t += perDie;
        at(t, () => setStage((p) => ({ ...p, diceLocked: i + 1, diceStopping: i + 1 })));
      }
      at(t, stopCycles); // all dice settled → stop flickering
      localMods.forEach((_, i) => {
        t += STEP_MS;
        at(t, () => setStage((p) => ({ ...p, modsShown: i + 1 })));
      });
      at(t + 260, () => releaseImpact(rollFx.rollId));
      return t;
    };

    if (isBurst) {
      setStage({ phase: 'damage', dieFace: 0, toHitShown: 0, diceLocked: 0, diceStopping: 0, modsShown: 0 });
      // A spell-damage burst "thunks" (playHit); a plain `/roll` gets a neutral tick.
      const end = scheduleDamage(0, isDice ? playSkill : playHit);
      at(end + DART_HOLD_MS, dismiss);
      return cleanup;
    }

    setStage({ phase: 'rolling', dieFace: 1, toHitShown: 0, diceLocked: 0, diceStopping: 0, modsShown: 0 });
    // Tumble the d20 while "rolling".
    intervals.push(
      setInterval(() => setStage((p) => ({ ...p, dieFace: 1 + Math.floor(Math.random() * 20) })), CYCLE_MS),
    );
    let t = ROLL_MS;
    at(t, () => {
      stopCycles();
      setStage((p) => ({ ...p, phase: 'tohit', dieFace: reveal.d20 ?? p.dieFace }));
    });
    toHit.forEach((_, i) => {
      t += STEP_MS;
      at(t, () => setStage((p) => ({ ...p, toHitShown: i + 1 })));
    });
    t += OUTCOME_MS;
    at(t, () => {
      setStage((p) => ({ ...p, phase: 'outcome' }));
      // Attacks thunk/whiff on hit/miss; a check ticks (fail whiffs) — a plain
      // check with no pass/fail (outcome 'none') still gets the neutral tick.
      if (isCheck) reveal.outcome === 'fail' ? playMiss() : playSkill();
      else if (reveal.outcome === 'crit') playCritical();
            else if (reveal.outcome === 'hit') playHit();
      else playMiss();
    });
    const hasDamage = (reveal.damage ?? 0) > 0 && allFaces.length + localMods.length > 0;
    const end = hasDamage ? scheduleDamage(t + DMG_GAP_MS) : t;
    if (!hasDamage) at(t, () => releaseImpact(rollFx.rollId));
    at(end + HOLD_MS, dismiss);
    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rollFx?.id, staticReveal]);

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
  const toHitShownNum = useTween(stage.phase === 'rolling' || stage.phase === 'landing' ? 0 : toHitTarget, staticReveal ? 0 : 260);
  const dmgShownNum = useTween(dmgTarget, staticReveal ? 0 : 260);

  // Skip on Escape (parity with click/tap-to-skip).
  useEffect(() => {
    if (!rollFx) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && dismiss();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [rollFx, dismiss]);

  if (!rollFx || !reveal) return null;

  const outcomeLabel =
    reveal.outcome === 'crit'
      ? 'CRITICAL HIT!'
      : reveal.outcome === 'fumble'
        ? 'FUMBLE!'
        : reveal.outcome === 'hit'
          ? 'HIT'
          : reveal.outcome === 'pass'
            ? 'PASS'
            : reveal.outcome === 'fail'
              ? 'FAIL'
              : 'MISS';
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

  return (
    // Click-through backdrop (pointer-events:none) so play isn't blocked.
    <div className="roll-reveal-backdrop">
      <div
        key={rollFx.id}
        className={`roll-reveal ${colourClass}`}
        data-roll-id={rollFx.rollId}
        data-reveal-kind={reveal.kind}
        data-phase={stage.phase}
        data-impact-ready={!!rollFx.impactReady}
        onClick={dismiss}
        title="Click to skip"
      >
        <div className="roll-reveal-who">
          {reveal.attacker}
          {reveal.target ? <span className="rr-arrow"> → {reveal.target}</span> : ''}
        </div>
        {/* Sub-headline for a check/dice roll: the check name or the expression. */}
        {reveal.title && <div className="rr-title">{reveal.title}</div>}

        {!isBurst && (
          <div className={`roll-reveal-tohit${comparison?.kind === 'd20' ? ' rr-tohit-compared' : ''}`}>
            {comparison?.kind === 'd20'
              ? <ComparedDice comparison={comparison} stopping={stage.phase === 'rolling' ? 0 : 1}
                locked={stage.phase === 'rolling' || stage.phase === 'landing' ? 0 : 1} tick={stage.dieFace}
                onSettled={(_, set) => landings.current.d20?.(set)} />
              : <DieShape sides={20} value={stage.dieFace || 0} big rolling={stage.phase === 'rolling'} onSettled={() => landings.current.d20?.(0)} />}
            <div className="rr-buildup">
              <div className="rr-total" key={toHitShownNum}>
                {toHitShownNum}
              </div>
              <div className="rr-chips">
                {toHit.slice(0, stage.toHitShown).map((s, i) => (
                  <span className="rr-chip" key={i}>
                    {s.value >= 0 ? '+' : ''}
                    {s.value} {s.label}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {showOutcome && <div className="roll-reveal-outcome">{outcomeLabel}</div>}
        {showOutcome && reveal.outcome === 'crit' && <div className="critical-flourish" aria-label="Critical hit celebration">
          <span aria-hidden="true">✦</span><strong>DEVASTATING STRIKE</strong><span aria-hidden="true">✦</span>
          <small>Double the damage dice</small>
        </div>}

        {showDamage && (
          <div className="roll-reveal-damage">
            <div className={isDice ? 'rr-roll-num' : 'rr-dmg-num'} key={dmgShownNum}>
              {dmgShownNum}
              {!isDice && <span className="rr-dmg-type"> {reveal.damageBreakdown?.mixedTypes ? 'mixed' : reveal.damageType ?? ''} dmg</span>}
            </div>
            {/* Every damage die, each tumbling until it settles on its face. */}
            {comparison?.kind === 'dice' ? <ComparedDice comparison={comparison} locked={stage.diceLocked} stopping={stage.diceStopping} tick={rollTick}
              onSettled={(index, set) => landings.current.damage?.(index, set)} /> : <div className="rr-dice-row">
              {faces.map((f, i) => {
                const locked = i < stage.diceStopping;
                return (
                  <DieShape
                    key={i}
                    sides={f.sides}
                    big={player && faces.length <= 3}
                    value={locked ? f.value : flicker(rollTick, i, f.sides)}
                    rolling={!locked}
                    crit={f.crit}
                    onSettled={() => landings.current.damage?.(i, 0)}
                  />
                );
              })}
            </div>}
            <div className="rr-chips">
              {mods.slice(0, stage.modsShown).map((m, i) => (
                <span className="rr-chip" key={`m${i}`}>
                  {m.value >= 0 ? '+' : ''}
                  {m.value} {m.label}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
