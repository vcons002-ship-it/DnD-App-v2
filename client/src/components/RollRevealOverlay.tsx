import { memo, useEffect, useRef, useState } from 'react';
import { useStore } from '../state/socket';
import { playHit, playMiss } from '../lib/sfx';

// Pacing (ms). Tweak to taste — attacks run ~2–2.6s, darts ~0.9s.
const ROLL_MS = 420; // d20 shuffle before it locks
const STEP_MS = 300; // each bonus / die chip flying in
const OUTCOME_MS = 340; // beat before the HIT/MISS stamp
const DMG_GAP_MS = 360; // beat before damage rolls
const HOLD_MS = 800; // linger on the final numbers
const DART_ROLL_MS = 280;
const DART_HOLD_MS = 560;

type Stage = {
  phase: 'rolling' | 'tohit' | 'outcome' | 'damage';
  dieFace: number; // the big d20 number (cycles while 'rolling', then locks)
  toHitShown: number; // how many to-hit bonus chips are revealed
  diceShown: number; // how many damage dice are revealed
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

/**
 * A staged attack-roll reveal everyone sees when an attack resolves:
 *   1. the d20 tumbles and lands on its natural face;
 *   2. each bonus (ability mod, proficiency, …) flies in and the to-hit total
 *      counts UP;
 *   3. a HIT / MISS / CRIT / FUMBLE stamp lands;
 *   4. on a hit, the damage dice roll and each modifier counts the total up.
 * A Magic Missile dart is a quick single damage burst (fires once per assigned
 * dart). Non-blocking (the map stays interactive); click / tap / Esc skips it.
 * Mechanics already applied server-side — this is purely cosmetic.
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
    diceShown: 0,
    modsShown: 0,
  });

  // Drive the timeline. Re-runs per roll (keyed on the FX id); all timers clear on
  // unmount / replacement so a rapid follow-up roll never leaves stale steps.
  useEffect(() => {
    if (!rollFx || !reveal) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    let cycle: ReturnType<typeof setInterval> | undefined;
    const at = (ms: number, fn: () => void) => timers.push(setTimeout(fn, ms));
    const cleanup = () => {
      timers.forEach(clearTimeout);
      if (cycle) clearInterval(cycle);
    };

    const dice = reveal.damageDice ?? [];
    const mods = reveal.damageMods ?? [];

    if (isBurst) {
      setStage({ phase: 'damage', dieFace: 0, toHitShown: 0, diceShown: 0, modsShown: 0 });
      // Impact lands with the damage dice (in sync, not at server-roll time).
      at(DART_ROLL_MS, () => {
        setStage((p) => ({ ...p, diceShown: dice.length, modsShown: mods.length }));
        playHit();
      });
      at(DART_ROLL_MS + DART_HOLD_MS, dismiss);
      return cleanup;
    }

    const toHit = reveal.toHit ?? [];
    setStage({ phase: 'rolling', dieFace: 1, toHitShown: 0, diceShown: 0, modsShown: 0 });
    // Tumble the die while "rolling".
    cycle = setInterval(
      () => setStage((p) => ({ ...p, dieFace: 1 + Math.floor(Math.random() * 20) })),
      70,
    );
    let t = ROLL_MS;
    at(t, () => {
      if (cycle) clearInterval(cycle);
      setStage((p) => ({ ...p, phase: 'tohit', dieFace: reveal.d20 ?? p.dieFace }));
    });
    toHit.forEach((_, i) => {
      t += STEP_MS;
      at(t, () => setStage((p) => ({ ...p, toHitShown: i + 1 })));
    });
    t += OUTCOME_MS;
    at(t, () => {
      setStage((p) => ({ ...p, phase: 'outcome' }));
      // Hit/miss cue lands WITH the stamp, in sync with the animation.
      if (reveal.outcome === 'hit' || reveal.outcome === 'crit') playHit();
      else playMiss();
    });
    const hasDamage = (reveal.damage ?? 0) > 0 && dice.length + mods.length > 0;
    if (hasDamage) {
      t += DMG_GAP_MS;
      at(t, () => setStage((p) => ({ ...p, phase: 'damage' })));
      dice.forEach((_, i) => {
        t += STEP_MS;
        at(t, () => setStage((p) => ({ ...p, diceShown: i + 1 })));
      });
      mods.forEach((_, i) => {
        t += STEP_MS;
        at(t, () => setStage((p) => ({ ...p, modsShown: i + 1 })));
      });
    }
    t += HOLD_MS;
    at(t, dismiss);
    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rollFx?.id]);

  // Running totals (tweened so the numbers visibly climb).
  const toHit = reveal?.toHit ?? [];
  const dice = reveal?.damageDice ?? [];
  const mods = reveal?.damageMods ?? [];
  const toHitTarget =
    (reveal?.d20 ?? 0) + toHit.slice(0, stage.toHitShown).reduce((s, x) => s + x.value, 0);
  const dmgTarget =
    dice.slice(0, stage.diceShown).reduce((s, x) => s + x.value, 0) +
    mods.slice(0, stage.modsShown).reduce((s, x) => s + x.value, 0);
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
  // A damage-only burst (cast AoE roll / Magic Missile dart) shows no HIT/MISS stamp.
  const showOutcome = !isBurst && (stage.phase === 'outcome' || stage.phase === 'damage');

  return (
    // Click-through backdrop (pointer-events:none) so play isn't blocked.
    <div className="roll-reveal-backdrop">
      <div
        key={rollFx.id}
        className={`roll-reveal roll-reveal-${reveal.outcome}`}
        onClick={dismiss}
        title="Click to skip"
      >
        <div className="roll-reveal-who">
          {reveal.attacker}
          {reveal.target ? <span className="rr-arrow"> → {reveal.target}</span> : ''}
        </div>

        {!isBurst && (
          <div className="roll-reveal-tohit">
            <div className={`roll-reveal-die${stage.phase === 'rolling' ? ' rolling' : ''}`}>
              {stage.dieFace || '–'}
            </div>
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

        {(isBurst || stage.phase === 'damage') && (reveal.damage ?? 0) > 0 && (
          <div className="roll-reveal-damage">
            <div className="rr-dmg-num" key={dmgShownNum}>
              {dmgShownNum}
              <span className="rr-dmg-type"> {reveal.damageType ?? ''} dmg</span>
            </div>
            <div className="rr-chips">
              {dice.slice(0, stage.diceShown).map((d, i) => (
                <span className="rr-chip rr-dice" key={`d${i}`}>
                  {d.label}
                  {d.faces?.length ? ` [${d.faces.join(',')}]` : ''} = {d.value}
                </span>
              ))}
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
