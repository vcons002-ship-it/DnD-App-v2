import { useState, type ReactNode } from 'react';
import type { Character, Token } from '../../../shared/types';
import { useStore } from '../state/socket';
import { StatBlock, ActionsTraitsView } from './StatBlock';
import { CharacterSkills } from './CharacterSkills';
import { CharacterModifiers } from './CharacterModifiers';
import { CharacterResources } from './CharacterResources';
import { CarriedLanternControl } from './CarriedLanternControl';
import { CharacterSpells } from './CharacterSpells';
import { CharacterItems } from './CharacterItems';
import { DeathSaves } from './DeathSaves';
import { SheetImportExport } from './SheetImportExport';
import { LibraryCharacterDialog } from './LibraryCharacterDialog';
import { MiniatureSizeControl } from './MiniatureSizeControl';
import { CharacterLevelUp } from './CharacterLevelUp';
import { resolveMiniature } from '../lib/miniatures';
import { CLASS_OPTIONS, classTitle, isListedClassName, legacySingleClass, multiclassClassSummary } from '../../../shared/multiclass';

/**
 * A character's full sheet: the shared tagged stat block (editable + AI fill when
 * allowed) plus the 5e skills list. Used for the player's own character, party
 * members (read-only), and the DM/owner view in the selected-token panel.
 */
export function CharacterSheet({
  character,
  editable,
  abilitiesElsewhere = false,
  resourceManagementControl,
  resourceDisplayControl,
  miniatureToken,
}: {
  character: Character;
  editable: boolean;
  /** Omit the Spells & Abilities + Actions blocks — the selected-token panel
   *  renders them as their own section (mirroring the creature layout). */
  abilitiesElsewhere?: boolean;
  resourceManagementControl?: ReactNode;
  resourceDisplayControl?: (resourceName: string) => ReactNode;
  /** Current map placement; null shows placement help, omitted hides the control. */
  miniatureToken?: Token | null;
}) {
  const updateCharacter = useStore((s) => s.updateCharacter);
  const aiFillCharacter = useStore((s) => s.aiFillCharacter);
  const rollSave = useStore((s) => s.rollSave);
  const rollCheck = useStore((s) => s.rollCheck);
  const consumeAdvantage = useStore((s) => s.consumeAdvantage);
  const aiBusy = useStore((s) => s.aiBusy);
  const role = useStore((s) => s.snapshot?.role);
  const placedToken = useStore((s) => s.snapshot?.tokens.find(t => t.kind === 'pc' && t.refId === character.id));
  const [saving, setSaving] = useState(false);
  const classSummary = multiclassClassSummary(character) ?? `${character.className}${character.subclass ? ` (${character.subclass})` : ''}`;
  const multiclass = (character.leveling?.classes?.length ?? 0) > 1;
  // A sheet saved before the class list may hold free text ("Rogue (Thief)").
  // Nothing rewrites it; the sheet asks for a pick instead.
  const offList = !multiclass && !isListedClassName(character.className);

  return (
    <div className="char-sheet">
      {editable && miniatureToken !== undefined && resolveMiniature(character.name, 'pc') &&
        <MiniatureSizeControl token={miniatureToken} />}
      <CharacterLevelUp character={character} editable={editable} />
      {editable && offList && (
        <p className="class-offlist" role="status">
          Class “{character.className}” isn’t one of the 12 classes. Edit the sheet and pick one from the list
          {legacySingleClass(character.className) ? ` (it reads as ${classTitle(legacySingleClass(character.className)!)})` : ' — a multiclass split is set by the DM with Edit class levels'} so
          features, rests and level-ups use it.
        </p>
      )}
      <StatBlock
        creature={character}
        subtitle={`${character.race} · ${classSummary}`}
        identity={
          editable
            ? [
                { key: 'race', label: 'Race', value: character.race },
                {
                  key: 'className', label: 'Class', value: character.className, options: CLASS_OPTIONS,
                  // A multiclass split is the DM's Class levels setting, not this field.
                  ...(multiclass ? { disabled: true, hint: 'Multiclass — the DM changes it with Edit class levels.' } : {}),
                },
                { key: 'subclass', label: 'Subclass', value: character.subclass, ...(multiclass ? { disabled: true } : {}) },
              ]
            : undefined
        }
        levelLabel="Level"
        levelEditable={role === 'dm'}
        aiBusy={aiBusy}
        masteries={character.sheetAbilities}
        deferActionsTraits
        onRollSave={
          editable
            ? (ability) =>
                rollSave({
                  kind: 'pc',
                  refId: character.id,
                  ability,
                  advantage: consumeAdvantage(character.id),
                })
            : undefined
        }
        onRollCheck={
          editable
            ? (ability) =>
                rollCheck({
                  kind: 'pc',
                  refId: character.id,
                  ability,
                  advantage: consumeAdvantage(character.id),
                })
            : undefined
        }
        onAiFill={editable ? () => aiFillCharacter(character.id) : undefined}
        onSave={
          editable
            ? (patch) => updateCharacter({ characterId: character.id, ...patch })
            : undefined
        }
      />
      {/* Traits/feats live with the character info box (stats + weapons),
          collapsed — above Resources/Skills/Inventory. The Feats & ASIs editor
          (numeric build choices) lives in here too. */}
      {(character.abilities.length > 0 ||
        (character.modifiers?.length ?? 0) > 0 ||
        editable) && (
        <details className="sheet-actions-traits">
          <summary>Traits &amp; Feats</summary>
          <ActionsTraitsView
            actions={character.actions}
            abilities={character.abilities}
            editable={editable}
            showActions={false}
            onSave={
              editable
                ? (patch) => updateCharacter({ characterId: character.id, ...patch })
                : undefined
            }
          />
          <CharacterModifiers character={character} editable={editable} />
        </details>
      )}
      <DeathSaves character={character} editable={editable} />
      {editable && role === 'player' && (miniatureToken ?? placedToken) && (
        <details className="sheet-exploration">
          <summary>Exploration</summary>
          <CarriedLanternControl token={miniatureToken ?? placedToken} />
        </details>
      )}
      <CharacterResources character={character} editable={editable} managementControl={resourceManagementControl} displayControl={resourceDisplayControl} />
      {!abilitiesElsewhere && (
        <>
          <CharacterSpells character={character} editable={editable} />
          {/* Actions live with the spells/abilities (created + shown here). */}
          {(character.actions.length > 0 || editable) && (
            <ActionsTraitsView
              actions={character.actions}
              abilities={character.abilities}
              editable={editable}
              showTraits={false}
              heading="Actions"
              className="sheet-actions"
              onSave={
                editable
                  ? (patch) => updateCharacter({ characterId: character.id, ...patch })
                  : undefined
              }
            />
          )}
        </>
      )}
      <CharacterSkills character={character} editable={editable} />
      {/* Inventory sits at the bottom of the sheet, below Skills. */}
      <CharacterItems character={character} editable={editable} />
      {editable && (
        <>
          <SheetImportExport character={character} />
          <button
            className="btn tiny save-library"
            onClick={() => setSaving(true)}
            title="Save this character to the cross-session library"
          >
            💾 Save to library
          </button>
        </>
      )}
      {saving && (
        <LibraryCharacterDialog character={character} onClose={() => setSaving(false)} />
      )}
    </div>
  );
}
