import { useEffect } from 'react';
import { useStore } from '../state/socket';

/**
 * A brief, non-blocking attack-roll reveal: a big d20 with the natural face, the
 * HIT / MISS / CRIT / FUMBLE outcome, who attacked whom, and any damage. Everyone
 * who received the roll sees it for ~1.5 s (the store auto-dismisses it). It's
 * purely cosmetic — the mechanics already applied server-side — so the backdrop is
 * click-through (the map stays interactive); only the card captures a click, which
 * skips the reveal early. Toggle off per-user in Settings.
 */
export function RollRevealOverlay() {
  const rollFx = useStore((s) => s.rollFx);
  const dismiss = useStore((s) => s.dismissRollFx);

  // Skip on Escape too (keyboard parity with click/tap-to-skip).
  useEffect(() => {
    if (!rollFx) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && dismiss();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [rollFx, dismiss]);

  if (!rollFx) return null;
  const { reveal } = rollFx;
  const label =
    reveal.outcome === 'crit'
      ? 'CRITICAL HIT!'
      : reveal.outcome === 'fumble'
        ? 'FUMBLE!'
        : reveal.outcome === 'hit'
          ? 'HIT'
          : 'MISS';

  return (
    // Click-through backdrop (pointer-events:none in CSS) so play isn't blocked.
    <div className="roll-reveal-backdrop">
      <div
        key={rollFx.id}
        className={`roll-reveal roll-reveal-${reveal.outcome}`}
        onClick={dismiss}
        title="Click to skip"
      >
        <div className="roll-reveal-die">{reveal.d20}</div>
        <div className="roll-reveal-body">
          <div className="roll-reveal-outcome">{label}</div>
          <div className="roll-reveal-who">
            {reveal.attacker}
            {reveal.target ? ` → ${reveal.target}` : ''}
          </div>
          {reveal.damage ? (
            <div className="roll-reveal-dmg">
              {reveal.damage} {reveal.damageType ?? ''} damage
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
