import type { StateSnapshot } from '../../../shared/types';
import { useStore } from '../state/socket';
import { ConditionPicker } from './ConditionPicker';

type Props = {
  snapshot: StateSnapshot;
  claimedId: string | null;
  onClaim: (characterId: string) => void;
};

export function PlayerPanel({ snapshot, claimedId, onClaim }: Props) {
  const applyDamage = useStore((s) => s.applyDamage);
  const mine = snapshot.characters.find((c) => c.id === claimedId) ?? null;

  return (
    <div className="panel">
      {!mine && (
        <div className="panel-section">
          <h3>Choose your character</h3>
          {snapshot.characters.map((c) => (
            <button
              key={c.id}
              className="spawn-row"
              disabled={!!c.claimedBy}
              onClick={() => onClaim(c.id)}
            >
              {c.name} <span className="muted">{c.race} {c.className}</span>
              {c.claimedBy && <span className="badge">taken</span>}
            </button>
          ))}
        </div>
      )}

      {mine && (
        <div className="panel-section">
          <h3>{mine.name}</h3>
          <div className="muted">
            {mine.race} · {mine.className}
          </div>
          <div className="hp-line">
            HP: {mine.curHp} / {mine.maxHp}
          </div>
          <div className="dmg-row">
            <button className="btn red" onClick={() => applyDamage('pc', mine.id, 1)}>
              −1
            </button>
            <button className="btn red" onClick={() => applyDamage('pc', mine.id, 5)}>
              −5
            </button>
            <button className="btn green" onClick={() => applyDamage('pc', mine.id, -1)}>
              +1
            </button>
            <button className="btn green" onClick={() => applyDamage('pc', mine.id, -5)}>
              +5
            </button>
          </div>
          <h4>Conditions</h4>
          <ConditionPicker kind="pc" refId={mine.id} conditions={mine.conditions} />
        </div>
      )}

      <div className="panel-section">
        <h3>Party</h3>
        {snapshot.characters
          .filter((c) => c.id !== claimedId)
          .map((c) => (
            <div key={c.id} className="init-row">
              <span className="init-name">{c.name}</span>
              <span className="muted">
                {c.curHp}/{c.maxHp}
              </span>
            </div>
          ))}
      </div>
    </div>
  );
}
