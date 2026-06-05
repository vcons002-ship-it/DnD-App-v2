import type { StateSnapshot } from '../../../shared/types';
import { useStore } from '../state/socket';
import { ConditionPicker } from './ConditionPicker';
import { NewCharacterForm } from './NewCharacterForm';
import { CharacterSheet } from './CharacterSheet';

type Props = {
  snapshot: StateSnapshot;
  claimedId: string | null;
  placing: boolean;
  isPlaced: boolean;
  onClaim: (characterId: string) => void;
  onRelease: () => void;
  onPlaceToken: () => void;
};

export function PlayerPanel({
  snapshot,
  claimedId,
  placing,
  isPlaced,
  onClaim,
  onRelease,
  onPlaceToken,
}: Props) {
  const applyDamage = useStore((s) => s.applyDamage);
  const mine = snapshot.characters.find((c) => c.id === claimedId) ?? null;

  return (
    <div className="panel">
      {!mine && (
        <div className="panel-section">
          <h3>Choose your character</h3>
          <p className="hint">Tap a character below to play as them.</p>
          {snapshot.characters.map((c) => (
            <button
              key={c.id}
              className="spawn-row claim-row"
              disabled={!!c.claimedBy}
              onClick={() => onClaim(c.id)}
              title={c.claimedBy ? 'Already taken by another player' : 'Play as this character'}
            >
              <span>
                {c.name} <span className="muted">{c.race} {c.className}</span>
              </span>
              {c.claimedBy ? (
                <span className="badge">taken</span>
              ) : (
                <span className="badge claim-cta">Play</span>
              )}
            </button>
          ))}
          {snapshot.characters.length === 0 && (
            <p className="muted">No characters in this session yet.</p>
          )}
          <div className="new-char-wrap">
            <NewCharacterForm />
          </div>
        </div>
      )}

      {mine && (
        <div className="panel-section">
          <div className="claimed-head">
            <h3>{mine.name}</h3>
            <button
              className="btn tiny"
              onClick={onRelease}
              title="Release this character and pick a different one"
            >
              Change
            </button>
          </div>
          <div className="muted">
            {mine.race} · {mine.className} <span className="badge">you</span>
          </div>
          <div className="hp-line">
            HP: {mine.curHp} / {mine.maxHp}
          </div>
          {isPlaced ? (
            <p className="hint">Your token is on the map.</p>
          ) : (
            <button
              className={`btn ${placing ? 'on' : ''}`}
              onClick={onPlaceToken}
            >
              {placing ? 'Click the map to place…' : '📍 Place my token'}
            </button>
          )}
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
          <CharacterSheet character={mine} editable />
        </div>
      )}

      <div className="panel-section">
        <h3>Party</h3>
        {snapshot.characters
          .filter((c) => c.id !== claimedId)
          .map((c) => (
            <details key={c.id} className="party-member">
              <summary className="init-row">
                <span className="init-name">{c.name}</span>
                <span className="muted">
                  {c.curHp}/{c.maxHp}
                </span>
              </summary>
              <CharacterSheet character={c} editable={false} />
            </details>
          ))}
        {snapshot.characters.filter((c) => c.id !== claimedId).length === 0 && (
          <p className="muted">No other party members.</p>
        )}
      </div>
    </div>
  );
}
