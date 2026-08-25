import { useStore } from '../state/socket';

/**
 * Per-entity advantage/disadvantage toggle. Each character/creature has its OWN
 * armed adv/dis (keyed by id in the store) that applies to ITS next roll of any
 * kind — attack, skill, spell/ability attack, monster action, or dice — and is
 * consumed (cleared) when that roll fires. A player's dice-panel and skill-list
 * toggles share their character's id, so they are one switch.
 *
 * `size="lg"` is the play-time variant: big, labelled ⬆ ADV / ⬇ DIS buttons with
 * a loud armed state, for the surfaces you hit mid-combat (the Combat section,
 * the dice panel). Inline rows (a skill line) keep the compact default.
 */
export function AdvantageToggle({
  entityId,
  className = 'adv-toggle',
  size,
}: {
  entityId: string;
  className?: string;
  size?: 'lg';
}) {
  const adv = useStore((s) => s.manualAdvantage[entityId]);
  const setAdv = useStore((s) => s.setManualAdvantage);
  const big = size === 'lg';
  const btn = big ? 'btn adv-btn' : 'btn tiny';
  return (
    <span className={`${className}${big ? ' lg' : ''}`}>
      <button
        className={`${btn} adv-up-btn ${adv === 'adv' ? 'on' : ''}`}
        title="Advantage on this creature's next roll of any kind, then clears"
        onClick={() => setAdv(entityId, adv === 'adv' ? null : 'adv')}
      >
        {big ? '⬆ ADV' : 'Adv'}
      </button>
      <button
        className={`${btn} adv-down-btn ${adv === 'dis' ? 'on' : ''}`}
        title="Disadvantage on this creature's next roll of any kind, then clears"
        onClick={() => setAdv(entityId, adv === 'dis' ? null : 'dis')}
      >
        {big ? '⬇ DIS' : 'Dis'}
      </button>
    </span>
  );
}
