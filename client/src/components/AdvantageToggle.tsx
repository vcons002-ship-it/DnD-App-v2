import { useStore } from '../state/socket';

/**
 * Per-entity advantage/disadvantage toggle. Each character/creature has its OWN
 * armed adv/dis (keyed by id in the store) that applies to ITS next roll of any
 * kind — attack, skill, spell/ability attack, monster action, or dice — and is
 * consumed (cleared) when that roll fires. A player's dice-panel and skill-list
 * toggles share their character's id, so they are one switch.
 */
export function AdvantageToggle({
  entityId,
  className = 'adv-toggle',
}: {
  entityId: string;
  className?: string;
}) {
  const adv = useStore((s) => s.manualAdvantage[entityId]);
  const setAdv = useStore((s) => s.setManualAdvantage);
  return (
    <span className={className}>
      <button
        className={`btn tiny ${adv === 'adv' ? 'on' : ''}`}
        title="Advantage on this creature's next roll of any kind, then clears"
        onClick={() => setAdv(entityId, adv === 'adv' ? null : 'adv')}
      >
        Adv
      </button>
      <button
        className={`btn tiny ${adv === 'dis' ? 'on' : ''}`}
        title="Disadvantage on this creature's next roll of any kind, then clears"
        onClick={() => setAdv(entityId, adv === 'dis' ? null : 'dis')}
      >
        Dis
      </button>
    </span>
  );
}
