import { memo, useEffect, useRef, useState } from 'react';
import { useStore } from '../state/socket';
import { playHit, playMiss } from '../lib/sfx';

// Pacing (ms). Tweak to taste.
const ROLL_MS = 420; // d20 shuffle before it locks
const STEP_MS = 300; // each to-hit / modifier chip flying in
const OUTCOME_MS = 340; // beat before the HIT/MISS stamp
const DMG_GAP_MS = 300; // beat before the damage dice start rolling
const HOLD_MS = 1600; // linger on the final numbers after damage concludes
const DART_HOLD_MS = 1200; // linger for a damage-only burst (Fireball cast / MM dart)
const CYCLE_MS = 70; // how fast tumbling dice flip numbers

type Stage = {
  phase: 'rolling' | 'tohit' | 'outcome' | 'damage';
  dieFace: number; // the big d20 number (cycles while 'rolling', then locks)
  toHitShown: number; // how many to-hit bonus chips are revealed
  diceLocked: number; // how many INDIVIDUAL damage dice have settled
  modsShown: number; // how many damage-mod chips are revealed
};

/** Ease a displayed number toward `target` (cubic-out) so totals visibly climb. */
function useTween(target: number, ms = 260): number {
  const [val, setVal] = useState(target);
  const from = useRef(target);
  useEffect(() => {
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

// Die silhouettes we can draw (clip-path polygons in CSS); anything else (d100…)
// falls back to a d10.
const DIE_SIDES = [4, 6, 8, 10, 12, 20];
/** Parse the die size from a dice label ("2d6" → 6, "8d6" → 6); a crit step's
 *  label ("CRIT") has none, so callers pass the weapon's base size as fallback. */
function dieSides(label: string, fallback: number): number {
  const m = /d(\d+)/i.exec(label);
  const n = m ? Number(m[1]) : fallback;
  return DIE_SIDES.includes(n) ? n : 10;
}

/** Flatten the damage dice steps into one die per rolled face (with its size). */
function flattenDice(
  steps: { label: string; value: number; faces?: number[] }[] | undefined,
  baseSides: number,
): { value: number; sides: number; crit: boolean }[] {
  if (!steps) return [];
  return steps.flatMap((d) => {
    const sides = dieSides(d.label, baseSides);
    const crit = (d.label || '').toUpperCase() === 'CRIT';
    return (d.faces ?? [d.value]).map((f) => ({ value: f, sides, crit }));
  });
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
}: {
  sides: number;
  value: number;
  big?: boolean;
  rolling?: boolean;
  crit?: boolean;
}) {
  return (
    <span
      className={`die die-d${sides}${big ? ' die-big' : ''}${rolling ? ' rolling' : ''}${
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
  const rollFx = useStore((s) => s.rollFx);
  const dismiss = useStore((s) => s.dismissRollFx);
  const reveal = rollFx?.reveal;
  const isBurst = reveal?.kind === 'damage';

  const [stage, setStage] = useState<Stage>({
    phase: 'rolling',
    dieFace: 0,
    toHitShown: 0,
    diceLocked: 0,
    modsShown: 0,
  });
  // Bumped by an interval while dice are tumbling, to flicker their numbers.
  const [rollTick, setRollTick] = useState(0);

  const dice = reveal?.damageDice ?? [];
  const mods = reveal?.damageMods ?? [];
  const toHit = reveal?.toHit ?? [];
  const baseSides = dieSides(dice[0]?.label ?? '', 6);
  const faces = flattenDice(dice, baseSides);

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
    };
    const stopCycles = () => {
      intervals.forEach(clearInterval);
      intervals.length = 0;
    };

    const allFaces = flattenDice(reveal.damageDice, dieSides(reveal.damageDice?.[0]?.label ?? '', 6));
    const localMods = reveal.damageMods ?? [];
    // Each die lands in quick succession; total dice-rolling time is bounded so a
    // 14d6 Fireball doesn't drag (faster per-die when there are many).
    const perDie = allFaces.length
      ? Math.max(55, Math.min(150, Math.round(700 / allFaces.length)))
      : 0;

    // Roll the damage dice one by one (all visible + tumbling, settling in order),
    // then reveal the flat modifiers; `start` is when the damage phase begins.
    const scheduleDamage = (start: number, onImpact?: () => void) => {
      let t = start;
      at(t, () => {
        setStage((p) => ({ ...p, phase: 'damage', diceLocked: 0, modsShown: 0 }));
        intervals.push(setInterval(() => setRollTick((x) => x + 1), CYCLE_MS));
        onImpact?.();
      });
      allFaces.forEach((_, i) => {
        t += perDie;
        at(t, () => setStage((p) => ({ ...p, diceLocked: i + 1 })));
      });
      at(t, stopCycles); // all dice settled → stop flickering
      localMods.forEach((_, i) => {
        t += STEP_MS;
        at(t, () => setStage((p) => ({ ...p, modsShown: i + 1 })));
      });
      return t;
    };

    if (isBurst) {
      setStage({ phase: 'damage', dieFace: 0, toHitShown: 0, diceLocked: 0, modsShown: 0 });
      const end = scheduleDamage(0, playHit); // impact lands as the dice start rolling
      at(end + DART_HOLD_MS, dismiss);
      return cleanup;
    }

    setStage({ phase: 'rolling', dieFace: 1, toHitShown: 0, diceLocked: 0, modsShown: 0 });
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
      if (reveal.outcome === 'hit' || reveal.outcome === 'crit') playHit();
      else playMiss();
    });
    const hasDamage = (reveal.damage ?? 0) > 0 && allFaces.length + localMods.length > 0;
    const end = hasDamage ? scheduleDamage(t + DMG_GAP_MS) : t;
    at(end + HOLD_MS, dismiss);
    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rollFx?.id]);

  // Running totals (tweened so the numbers visibly climb as dice settle).
  const toHitTarget =
    (reveal?.d20 ?? 0) + toHit.slice(0, stage.toHitShown).reduce((s, x) => s + x.value, 0);
  const dmgTarget =
    faces.slice(0, stage.diceLocked).reduce((s, f) => s + f.value, 0) +
    mods.slice(0, stage.modsShown).reduce((s, m) => s + m.value, 0);
  const toHitShownNum = useTween(stage.phase === 'rolling' ? 0 : toHitTarget);
  const dmgShownNum = useTween(dmgTarget);

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
          : 'MISS';
  const showOutcome = !isBurst && (stage.phase === 'outcome' || stage.phase === 'damage');
  // Hold the colour back until the result reveals (grey while rolling/building up).
  const colourClass = showOutcome ? `roll-reveal-${reveal.outcome}` : 'roll-reveal-pending';
  const showDamage = (isBurst || stage.phase === 'damage') && (reveal.damage ?? 0) > 0;

  return (
    // Click-through backdrop (pointer-events:none) so play isn't blocked.
    <div className="roll-reveal-backdrop">
      <div
        key={rollFx.id}
        className={`roll-reveal ${colourClass}`}
        onClick={dismiss}
        title="Click to skip"
      >
        <div className="roll-reveal-who">
          {reveal.attacker}
          {reveal.target ? <span className="rr-arrow"> → {reveal.target}</span> : ''}
        </div>

        {!isBurst && (
          <div className="roll-reveal-tohit">
            <DieShape sides={20} value={stage.dieFace || 0} big rolling={stage.phase === 'rolling'} />
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

        {showDamage && (
          <div className="roll-reveal-damage">
            <div className="rr-dmg-num" key={dmgShownNum}>
              {dmgShownNum}
              <span className="rr-dmg-type"> {reveal.damageType ?? ''} dmg</span>
            </div>
            {/* Every damage die, each tumbling until it settles on its face. */}
            <div className="rr-dice-row">
              {faces.map((f, i) => {
                const locked = i < stage.diceLocked;
                return (
                  <DieShape
                    key={i}
                    sides={f.sides}
                    value={locked ? f.value : flicker(rollTick, i, f.sides)}
                    rolling={!locked}
                    crit={f.crit}
                  />
                );
              })}
            </div>
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
});
