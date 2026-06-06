import { useState } from 'react';
import type { Character } from '../../../shared/types';
import { useStore } from '../state/socket';
import { StatBlock } from './StatBlock';
import { CharacterSkills } from './CharacterSkills';
import { CharacterResources } from './CharacterResources';
import { CharacterSpells } from './CharacterSpells';
import { CharacterItems } from './CharacterItems';
import { SheetImportExport } from './SheetImportExport';
import { LibraryCharacterDialog } from './LibraryCharacterDialog';

/**
 * A character's full sheet: the shared tagged stat block (editable + AI fill when
 * allowed) plus the 5e skills list. Used for the player's own character, party
 * members (read-only), and the DM/owner view in the selected-token panel.
 */
export function CharacterSheet({
  character,
  editable,
}: {
  character: Character;
  editable: boolean;
}) {
  const updateCharacter = useStore((s) => s.updateCharacter);
  const aiFillCharacter = useStore((s) => s.aiFillCharacter);
  const aiBusy = useStore((s) => s.aiBusy);
  const [saving, setSaving] = useState(false);

  return (
    <>
      <StatBlock
        creature={character}
        subtitle={`${character.race} · ${character.className}`}
        identity={
          editable
            ? [
                { key: 'race', label: 'Race', value: character.race },
                { key: 'className', label: 'Class', value: character.className },
              ]
            : undefined
        }
        levelLabel="Level"
        aiBusy={aiBusy}
        masteries={character.sheetAbilities}
        onAiFill={editable ? () => aiFillCharacter(character.id) : undefined}
        onSave={
          editable
            ? (patch) => updateCharacter({ characterId: character.id, ...patch })
            : undefined
        }
      />
      <CharacterResources character={character} editable={editable} />
      <CharacterSpells character={character} editable={editable} />
      <CharacterItems character={character} editable={editable} />
      <CharacterSkills character={character} editable={editable} />
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
    </>
  );
}
