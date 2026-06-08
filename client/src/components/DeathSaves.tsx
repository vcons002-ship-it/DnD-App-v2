import type { Character } from '../../../shared/types';
import { useStore } from '../state/socket';

/**
 * 5e death-save tracker, shown only while a PC is at 0 HP. Three success / three
 * failure pips plus a roll button for the owner/DM (server-resolved: 10+ success,
 * nat 20 revives at 1 HP, nat 1 = two failures, 3✓ stable, 3✗ dead).
 */
export function DeathSaves({
  character,
  editable,
}: {
  character: Character;
  editable: boolean;
}) {
  const rollDeathSave = useStore((s) => s.rollDeathSave);
  if (character.curHp > 0) return null;
  const { successes, failures } = character.deathSaves;
  const dead = failures >= 3;

  const pips = (n: number, cls: string) =>
    [0, 1, 2].map((i) => (
      <span key={i} className={`death-pip ${cls} ${i < n ? 'on' : ''}`} />
    ));

  return (
    <div className={`death-saves ${dead ? 'dead' : ''}`}>
      <div className="death-head">
        <strong>{dead ? '💀 Dead' : 'Death Saves'}</strong>
        {editable && !dead && (
          <button
            className="btn tiny"
            title="Roll a death saving throw"
            onClick={() => rollDeathSave(character.id)}
          >
            🎲 Roll
          </button>
        )}
      </div>
      <div className="death-row">
        <span className="death-label muted">Successes</span>
        <span className="death-pips">{pips(successes, 'ok')}</span>
      </div>
      <div className="death-row">
        <span className="death-label muted">Failures</span>
        <span className="death-pips">{pips(failures, 'bad')}</span>
      </div>
    </div>
  );
}
