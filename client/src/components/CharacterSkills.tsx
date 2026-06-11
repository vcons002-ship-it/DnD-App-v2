import type { Character } from '../../../shared/types';
import {
  SKILLS,
  proficiencyBonus,
  skillBonus,
  signed,
} from '../../../shared/skills';
import { effectiveStats, skillExtra } from '../../../shared/modifiers';
import { useStore } from '../state/socket';
import { AdvantageToggle } from './AdvantageToggle';

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
  const consumeAdvantage = useStore((s) => s.consumeAdvantage);
  const prof = new Set(character.proficientSkills);
  const pb = proficiencyBonus(character.level);
  // Effective scores (feat/equipped-item mods) so the shown bonus matches the
  // server-rolled total.
  const stats = effectiveStats(character).scores;

  const toggle = (name: string) => {
    if (!editable) return;
    const next = new Set(prof);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    updateCharacter({ characterId: character.id, proficientSkills: [...next] });
  };

  const roll = (name: string) =>
    rollSkill({
      characterId: character.id,
      skill: name,
      advantage: consumeAdvantage(character.id),
    });

  return (
    <details className="skills collapse-section">
      <summary className="collapse-head">
        Skills <span className="muted">Proficiency {signed(pb)}</span>
      </summary>
      {editable && (
        <div className="skills-head">
          <AdvantageToggle entityId={character.id} className="skill-adv" />
        </div>
      )}
      <div className="skill-list">
        {SKILLS.map((s) => {
          const isProf = prof.has(s.name);
          const bonus =
            skillBonus(stats, s.ability, character.level, isProf) +
            skillExtra(character, s.name).total;
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
    </details>
  );
}
