import type { Monster } from '../../../shared/types';

const ABILITIES = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'];
const mod = (score: number) => {
  const m = Math.floor((score - 10) / 2);
  return `${m >= 0 ? '+' : ''}${m}`;
};

/** DM-only full creature stat block (AC, abilities, actions, traits). */
export function StatBlock({ monster }: { monster: Monster }) {
  const hasStats = ABILITIES.some((a) => monster.stats[a] !== undefined);
  return (
    <div className="statblock">
      {monster.creatureType && (
        <div className="sb-type">{monster.creatureType}</div>
      )}
      <div className="sb-meta">
        {monster.armorClass > 0 && <span>AC {monster.armorClass}</span>}
        <span>
          HP {monster.curHp}/{monster.maxHp}
        </span>
        {monster.speed && <span>{monster.speed}</span>}
      </div>

      {hasStats && (
        <div className="sb-abilities">
          {ABILITIES.map((a) => (
            <div key={a} className="sb-ability">
              <div className="sb-ab-name">{a}</div>
              <div className="sb-ab-val">
                {monster.stats[a] ?? '—'}
                {monster.stats[a] !== undefined && (
                  <span className="muted"> ({mod(monster.stats[a])})</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {monster.resistances.length > 0 && (
        <div className="sb-line">
          <strong>Resist:</strong> {monster.resistances.join(', ')}
        </div>
      )}
      {monster.weaknesses.length > 0 && (
        <div className="sb-line">
          <strong>Vulnerable:</strong> {monster.weaknesses.join(', ')}
        </div>
      )}

      {monster.actions.length > 0 && (
        <div className="sb-section">
          <h4>Actions</h4>
          {monster.actions.map((a, i) => (
            <p key={i} className="sb-entry">
              <strong>{a.name}.</strong> {a.description}
            </p>
          ))}
        </div>
      )}
      {monster.abilities.length > 0 && (
        <div className="sb-section">
          <h4>Traits</h4>
          {monster.abilities.map((a, i) => (
            <p key={i} className="sb-entry">
              <strong>{a.name}.</strong> {a.description}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
