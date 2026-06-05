import type { Character } from '../../../shared/types';
import { useStore } from '../state/socket';
import { StatBlock } from './StatBlock';
import { CharacterSkills } from './CharacterSkills';
import { CharacterResources } from './CharacterResources';
import { CharacterItems } from './CharacterItems';

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
        onAiFill={editable ? () => aiFillCharacter(character.id) : undefined}
        onSave={
          editable
            ? (patch) => updateCharacter({ characterId: character.id, ...patch })
            : undefined
        }
      />
      <CharacterResources character={character} editable={editable} />
      <CharacterItems character={character} editable={editable} />
      <CharacterSkills character={character} editable={editable} />
    </>
  );
}
