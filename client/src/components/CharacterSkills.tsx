import type { Character } from '../../../shared/types';
import {
  SKILLS,
  proficiencyBonus,
  skillBonus,
  signed,
} from '../../../shared/skills';
import { useStore } from '../state/socket';

/**
 * D&D 5e skill list. Each skill shows its proficiency tag and stat-based total
 * (ability mod + proficiency bonus when proficient). For the owner/DM the dot
 * toggles proficiency and the row rolls the check server-side (d20 + that total,
 * with the section's adv/dis selection) into the shared log. Read-only for
 * everyone else.
 */
export function CharacterSkills({
  character,
  editable,
}: {
  character: Character;
  editable: boolean;
}) {
  const updateCharacter = useStore((s) => s.updateCharacter);
  const rollSkill = useStore((s) => s.rollSkill);
  const adv = useStore((s) => s.manualAdvantage);
  const setAdv = useStore((s) => s.setManualAdvantage);
  const prof = new Set(character.proficientSkills);
  const pb = proficiencyBonus(character.level);

  const toggle = (name: string) => {
    if (!editable) return;
    const next = new Set(prof);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    updateCharacter({ characterId: character.id, proficientSkills: [...next] });
  };

  const roll = (name: string) =>
    rollSkill({ characterId: character.id, skill: name, advantage: adv ?? undefined });

  return (
    <div className="skills">
      <div className="skills-head">
        <h4>Skills</h4>
        <span className="muted">Proficiency {signed(pb)}</span>
        {editable && (
          <span className="skill-adv">
            <button
              className={`btn tiny ${adv === 'adv' ? 'on' : ''}`}
              title="Advantage on the next roll, then clears"
              onClick={() => setAdv(adv === 'adv' ? null : 'adv')}
            >
              Adv
            </button>
            <button
              className={`btn tiny ${adv === 'dis' ? 'on' : ''}`}
              title="Disadvantage on the next roll, then clears"
              onClick={() => setAdv(adv === 'dis' ? null : 'dis')}
            >
              Dis
            </button>
          </span>
        )}
      </div>
      <div className="skill-list">
        {SKILLS.map((s) => {
          const isProf = prof.has(s.name);
          const bonus = skillBonus(character.stats, s.ability, character.level, isProf);
          return (
            <div key={s.name} className={`skill-row ${isProf ? 'prof' : ''}`}>
              <button
                type="button"
                className="skill-prof"
                disabled={!editable}
                onClick={() => toggle(s.name)}
                aria-pressed={isProf}
                title={
                  editable
                    ? isProf
                      ? 'Proficient — click to remove'
                      : 'Click to mark proficient'
                    : isProf
                      ? 'Proficient'
                      : undefined
                }
              >
                <span className="skill-dot" />
              </button>
              <button
                type="button"
                className="skill-roll"
                disabled={!editable}
                onClick={() => roll(s.name)}
                title={editable ? `Roll ${s.name} (d20 ${signed(bonus)})` : undefined}
              >
                <span className="skill-name">{s.name}</span>
                <span className="skill-abil muted">{s.ability}</span>
                <span className="skill-bonus">{signed(bonus)}</span>
                {editable && <span className="skill-die" aria-hidden="true">🎲</span>}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
