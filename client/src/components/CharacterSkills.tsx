import type { Character } from '../../../shared/types';
import {
  SKILLS,
  proficiencyBonus,
  skillBonus,
  signed,
} from '../../../shared/skills';
import { useStore } from '../state/socket';

/**
 * D&D 5e skill list with a proficiency tag, the character's proficiency bonus,
 * and each skill's stat-based total (ability mod + prof bonus when proficient).
 * Editable (toggle proficiency) for the owner/DM; read-only for everyone else.
 */
export function CharacterSkills({
  character,
  editable,
}: {
  character: Character;
  editable: boolean;
}) {
  const updateCharacter = useStore((s) => s.updateCharacter);
  const prof = new Set(character.proficientSkills);
  const pb = proficiencyBonus(character.level);

  const toggle = (name: string) => {
    if (!editable) return;
    const next = new Set(prof);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    updateCharacter({ characterId: character.id, proficientSkills: [...next] });
  };

  return (
    <div className="skills">
      <div className="skills-head">
        <h4>Skills</h4>
        <span className="muted">Proficiency {signed(pb)}</span>
      </div>
      <div className="skill-list">
        {SKILLS.map((s) => {
          const isProf = prof.has(s.name);
          const bonus = skillBonus(character.stats, s.ability, character.level, isProf);
          return (
            <button
              key={s.name}
              type="button"
              className={`skill-row ${isProf ? 'prof' : ''}`}
              disabled={!editable}
              onClick={() => toggle(s.name)}
              title={editable ? 'Toggle proficiency' : undefined}
            >
              <span className="skill-dot" />
              <span className="skill-name">{s.name}</span>
              <span className="skill-abil muted">{s.ability}</span>
              <span className="skill-bonus">{signed(bonus)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
