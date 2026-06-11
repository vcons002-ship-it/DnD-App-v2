import type { Character } from '../../../shared/types';
import { useStore } from '../state/socket';
import { ModifierEditor } from './ModifierEditor';
import { featUsage } from '../../../shared/feats';

/**
 * Permanent character modifiers (ASI, Resilient, racial bonuses) + the
 * level-based feat/ASI usage counter. Magic-item effects live on the items;
 * this is for the character's own build choices. Marking a modifier "ASI/feat"
 * makes it count against the cap, and the cap HARD-blocks adding more.
 */
export function CharacterModifiers({
  character,
  editable,
}: {
  character: Character;
  editable: boolean;
}) {
  const updateCharacter = useStore((s) => s.updateCharacter);
  const mods = character.modifiers ?? [];
  if (mods.length === 0 && !editable) return null;
  const u = featUsage(character);
  return (
    <div className="char-modifiers">
      <h4>Modifiers &amp; Feats</h4>
      <div className={`feat-cap${u.used > u.cap ? ' over' : ''}`}>
        Feats &amp; ASIs {u.used}/{u.cap}
        <span className="muted"> · level {character.level || 1}</span>
      </div>
      <ModifierEditor
        modifiers={mods}
        onChange={(m) => updateCharacter({ characterId: character.id, modifiers: m })}
        editable={editable}
        allowSlot
        canAddSlot={u.used < u.cap}
      />
    </div>
  );
}
