import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import './temporary-hp-shield.css';

type WardReaction = {
  effect: 'idle' | 'hit' | 'breaking';
  sequence: number;
  strength: number;
};

/** Cosmetic observer of the saved buffer, including manual decreases. No damage
 * is inferred or applied here. Stay mounted at zero so the last absorbed hit
 * can briefly dissipate; there is no remaining shield after that reaction. */
export function TemporaryHpShield({ amount }: { amount: number }) {
  const buffer = Number.isFinite(amount) ? Math.max(0, amount) : 0;
  const previous = useRef(buffer);
  const timer = useRef<number | undefined>(undefined);
  const [paused, setPaused] = useState(() => document.hidden);
  const [reaction, setReaction] = useState<WardReaction>({ effect: 'idle', sequence: 0, strength: 0 });

  // Resolve a final hit before paint: zero HP must not briefly hide the shell
  // and then resurrect it for its dissipating pulse on the next frame.
  useLayoutEffect(() => {
    const before = previous.current;
    previous.current = buffer;
    window.clearTimeout(timer.current);
    if (buffer >= before || before <= 0 || document.hidden || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setReaction((current) => current.effect === 'idle' ? current : { ...current, effect: 'idle', strength: 0 });
      return;
    }
    setReaction((current) => ({
      effect: buffer === 0 ? 'breaking' : 'hit',
      sequence: current.sequence + 1,
      strength: Math.min(1, (before - buffer) / before),
    }));
    timer.current = window.setTimeout(() => {
      setReaction((current) => ({ ...current, effect: 'idle', strength: 0 }));
    }, buffer === 0 ? 650 : 800);
    return () => window.clearTimeout(timer.current);
  }, [buffer]);

  useEffect(() => {
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    const cancel = () => {
      setPaused(document.hidden);
      if (!document.hidden && !motion.matches) return;
      window.clearTimeout(timer.current);
      setReaction((current) => current.effect === 'idle' ? current : { ...current, effect: 'idle', strength: 0 });
    };
    motion.addEventListener('change', cancel);
    document.addEventListener('visibilitychange', cancel);
    return () => {
      window.clearTimeout(timer.current);
      motion.removeEventListener('change', cancel);
      document.removeEventListener('visibilitychange', cancel);
    };
  }, []);

  if (buffer === 0 && reaction.effect !== 'breaking') return null;
  return (
    <span
      key={reaction.sequence}
      className="orb-temp-shield"
      data-shield-effect={reaction.effect}
      data-shield-paused={paused ? 'true' : 'false'}
      style={{ '--ward-hit-strength': reaction.strength } as CSSProperties}
      aria-hidden="true"
    >
      <span className="orb-ward-flow flow-back" />
      <span className="orb-ward-flow flow-front" />
      <span className="orb-ward-spark" />
      {reaction.effect !== 'idle' && (
        <span className="orb-ward-impact">
          <span className="orb-ward-impact-flare" />
          <span className="orb-ward-impact-ring ring-first" />
          <span className="orb-ward-impact-ring ring-second" />
          <span className="orb-ward-impact-edge" />
        </span>
      )}
    </span>
  );
}
