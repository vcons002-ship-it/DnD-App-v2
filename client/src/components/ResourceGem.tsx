import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import type { ResourceSigilKind } from '../../../shared/resourceSigils';
import { ResourceGemArt } from './ResourceGemArt';

export type ResourceGemMotion = { reduced: boolean; hidden: boolean };
type Reaction = { effect: 'idle' | 'spend' | 'restore'; sequence: number };

/** A cosmetic observer of one visible socket in the existing aggregate counter.
 * A socket is not a separately owned resource: clicks still set aggregate used.
 * Capacity edits/mounts never imply spending or restoring an ability. */
export function ResourceGem({
  active, capacity, ordinal, kind, spellLevel, extra, motion, style, label, title, onClick,
}: {
  active: boolean;
  capacity: number;
  ordinal: number;
  kind: ResourceSigilKind;
  spellLevel?: number;
  extra: boolean;
  motion: ResourceGemMotion;
  style?: CSSProperties;
  label: string;
  title: string;
  onClick: () => void;
}) {
  const previous = useRef({ active, capacity });
  const [reaction, setReaction] = useState<Reaction>({ effect: 'idle', sequence: 0 });

  useLayoutEffect(() => {
    const before = previous.current;
    previous.current = { active, capacity };
    if (motion.reduced || motion.hidden || before.capacity !== capacity || before.active === active) {
      setReaction((current) => current.effect === 'idle' ? current : { ...current, effect: 'idle' });
      return;
    }
    setReaction((current) => ({ effect: active ? 'restore' : 'spend', sequence: current.sequence + 1 }));
    const timer = window.setTimeout(() => {
      setReaction((current) => ({ ...current, effect: 'idle' }));
    }, active ? 1100 : 950);
    return () => window.clearTimeout(timer);
  }, [active, capacity, motion.reduced, motion.hidden]);

  const effect = motion.reduced || motion.hidden ? 'idle' : reaction.effect;
  // Presentation metadata only: slot level, never character level or pip index.
  const level = kind === 'spell' && typeof spellLevel === 'number' && Number.isInteger(spellLevel) && spellLevel >= 1 && spellLevel <= 9
    ? spellLevel : undefined;
  return (
    <button
      type="button"
      className={`resource-jewel resource-gem${active ? ' lit' : ''}${extra ? ' extra' : ''}`}
      style={style}
      aria-label={label}
      title={title}
      data-gem-effect={effect}
      data-gem-kind={kind}
      data-gem-spell-level={level}
      data-gem-paused={motion.hidden ? 'true' : 'false'}
      data-gem-motion={motion.reduced ? 'reduced' : motion.hidden ? 'paused' : 'animated'}
      onClick={onClick}
    >
      <ResourceGemArt kind={kind} ordinal={ordinal} spellLevel={level} extra={extra} effect={effect} reactionKey={reaction.sequence} />
    </button>
  );
}
