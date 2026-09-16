import { useId, useRef, useState, type KeyboardEvent } from 'react';
import type { Character } from '../../../shared/types';
import { abilityMod, proficiencyBonus, signed } from '../../../shared/skills';
import { effectiveStats, saveExtra } from '../../../shared/modifiers';
import { useStore } from '../state/socket';
import { AdvantageToggle } from './AdvantageToggle';
import { CharacterSkills } from './CharacterSkills';
import './compact-checks.css';

const ABILITIES = [
  ['STR', 'Strength'],
  ['DEX', 'Dexterity'],
  ['CON', 'Constitution'],
  ['INT', 'Intelligence'],
  ['WIS', 'Wisdom'],
  ['CHA', 'Charisma'],
] as const;
const CHECK_TABS = ['Skills', 'Stats'] as const;
type CheckTab = typeof CHECK_TABS[number];

/** Player presentation only: the same server check/save/skill actions as the sheet. */
export function CharacterChecks({
  character,
  onRolled,
  compact = false,
}: {
  character: Character;
  onRolled?: () => void;
  compact?: boolean;
}) {
  const rollSave = useStore((s) => s.rollSave);
  const rollCheck = useStore((s) => s.rollCheck);
  const consumeAdvantage = useStore((s) => s.consumeAdvantage);
  const [tab, setTab] = useState<CheckTab>('Skills');
  const [rollMenu, setRollMenu] = useState<string | null>(null);
  const tabsId = useId();
  const tabButtons = useRef<(HTMLButtonElement | null)[]>([]);
  const statButtons = useRef<Record<string, HTMLButtonElement | null>>({});
  const stats = effectiveStats(character).scores;
  const prof = new Set(
    character.saveProficiencies.map((s) => s.trim().toUpperCase()),
  );
  const roll = (ability: string, save: boolean) => {
    (save ? rollSave : rollCheck)({
      kind: 'pc',
      refId: character.id,
      ability,
      advantage: consumeAdvantage(character.id),
    });
    onRolled?.();
  };
  const selectTab = (name: CheckTab) => {
    setRollMenu(null);
    setTab(name);
  };
  const changeTabWithKeys = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const next = event.key === 'ArrowRight' ? (index + 1) % CHECK_TABS.length
      : event.key === 'ArrowLeft' ? (index + CHECK_TABS.length - 1) % CHECK_TABS.length
        : event.key === 'Home' ? 0
          : event.key === 'End' ? CHECK_TABS.length - 1 : -1;
    if (next < 0) return;
    event.preventDefault();
    selectTab(CHECK_TABS[next]);
    tabButtons.current[next]?.focus();
  };
  if (compact) {
    return (
      <section
        className="compact-checks"
        aria-label="Skills, ability checks and saving throws"
        onKeyDown={(event) => {
          if (event.key === 'Escape' && rollMenu) {
            event.preventDefault();
            event.stopPropagation();
            statButtons.current[rollMenu]?.focus();
            setRollMenu(null);
          }
        }}
      >
        <div className="compact-checks-toolbar">
          <span title="Proficiency bonus from your current character level">
            Proficiency <strong>{signed(proficiencyBonus(character.level))}</strong>
          </span>
          <AdvantageToggle entityId={character.id} className="compact-checks-advantage" />
        </div>
        <div className="compact-checks-tabs" role="tablist" aria-label="Check type">
          {CHECK_TABS.map((name, index) => (
            <button
              key={name}
              type="button"
              role="tab"
              id={`${tabsId}-${name}-tab`}
              aria-selected={tab === name}
              aria-controls={`${tabsId}-${name}-panel`}
              tabIndex={tab === name ? 0 : -1}
              ref={(element) => { tabButtons.current[index] = element; }}
              onClick={() => selectTab(name)}
              onKeyDown={(event) => changeTabWithKeys(event, index)}
            >
              {name}
            </button>
          ))}
        </div>
        <div
          role="tabpanel"
          id={`${tabsId}-Skills-panel`}
          aria-labelledby={`${tabsId}-Skills-tab`}
          hidden={tab !== 'Skills'}
          className="compact-checks-panel"
        >
          <CharacterSkills character={character} editable compact hideAdvantage onRolled={onRolled} />
          <p className="compact-checks-hint">Click a name to roll · Dots edit proficiency</p>
        </div>
        <div
          role="tabpanel"
          id={`${tabsId}-Stats-panel`}
          aria-labelledby={`${tabsId}-Stats-tab`}
          hidden={tab !== 'Stats'}
          className="compact-checks-panel"
        >
          <div className="compact-checks-abilities">
            {ABILITIES.map(([ability, label], index) => {
              const score = stats[ability];
              const proficient = prof.has(ability);
              const checkBonus = abilityMod(score);
              const saveBonus = checkBonus + (proficient ? proficiencyBonus(character.level) : 0)
                + saveExtra(character, ability).total;
              const open = rollMenu === ability;
              return (
                <div className="sb-ability-wrap compact-stat-wrap" key={ability}>
                  <button
                    type="button"
                    className={`compact-checks-ability${open ? ' on' : ''}`}
                    disabled={score === undefined}
                    aria-label={`${label} ${score ?? 'not set'}. Choose check or save`}
                    aria-expanded={open}
                    aria-controls={open ? `${tabsId}-${ability}-roll-menu` : undefined}
                    title={`${label} · Check ${signed(checkBonus)} · Save ${signed(saveBonus)}${proficient ? ' (proficient)' : ''}`}
                    ref={(element) => { statButtons.current[ability] = element; }}
                    onClick={() => setRollMenu(open ? null : ability)}
                  >
                    <span className={`compact-save-dot${proficient ? ' proficient' : ''}`} aria-hidden="true" />
                    <span className="compact-ability-name">{label}</span>
                    <span className="compact-ability-score">{ability} {score ?? '—'}</span>
                    <strong>{signed(checkBonus)}</strong>
                  </button>
                  {open && (
                    <>
                      {/* Same Stat/Save chooser and visual classes as the existing sheet. */}
                      <div className="sb-roll-menu-backdrop" aria-hidden="true" onClick={() => setRollMenu(null)} />
                      <div
                        className={`sb-roll-menu compact-stat-roll-menu${index >= 4 ? ' opens-up' : ''}`}
                        role="group"
                        aria-label={`${label} roll options`}
                        id={`${tabsId}-${ability}-roll-menu`}
                      >
                        <button
                          type="button"
                          className="btn tiny"
                          autoFocus
                          aria-label={`Roll ${label} ability check ${signed(checkBonus)}`}
                          title={`Plain ${ability} ability check (no proficiency)`}
                          onClick={() => {
                            roll(ability, false);
                            setRollMenu(null);
                            statButtons.current[ability]?.focus();
                          }}
                        >
                          🎲 Stat <strong>{signed(checkBonus)}</strong>
                        </button>
                        <button
                          type="button"
                          className="btn tiny"
                          aria-label={`Roll ${label} saving throw ${signed(saveBonus)}`}
                          title={`${ability} saving throw${proficient ? ' (proficient)' : ''}`}
                          onClick={() => {
                            roll(ability, true);
                            setRollMenu(null);
                            statButtons.current[ability]?.focus();
                          }}
                        >
                          🛡 Save <strong>{signed(saveBonus)}</strong>
                        </button>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
          <p className="compact-checks-hint">Click a stat for Stat / Save · Filled dot = save proficiency</p>
        </div>
      </section>
    );
  }
  return (
    <section aria-label="Ability checks and saving throws">
      <AdvantageToggle entityId={character.id} />
      <div className="ability-roll-grid">
        {['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'].map((ability) => {
          const score = stats[ability];
          const mod = abilityMod(score);
          const save =
            mod +
            (prof.has(ability) ? proficiencyBonus(character.level) : 0) +
            saveExtra(character, ability).total;
          return (
            <div className="ability-roll-cell" key={ability}>
              <strong>
                {ability} {score ?? '—'}
              </strong>
              <button
                className="btn tiny"
                disabled={score === undefined}
                onClick={() => roll(ability, false)}
              >
                Check {signed(mod)}
              </button>
              <button
                className="btn tiny"
                disabled={score === undefined}
                onClick={() => roll(ability, true)}
                title={
                  prof.has(ability) ? 'Proficient saving throw' : 'Saving throw'
                }
              >
                Save {signed(save)}
                {prof.has(ability) ? ' •' : ''}
              </button>
            </div>
          );
        })}
      </div>
      <CharacterSkills
        character={character}
        editable
        defaultOpen
        hideAdvantage
        onRolled={onRolled}
      />
    </section>
  );
}
