import type { Monster } from '../../../shared/types';
import { useStore } from '../state/socket';
import { StatBlock } from './StatBlock';
import { IconTools } from './IconTools';

/**
 * Pre-placement editor for a creature template (DM spawn list): adjust the full
 * stat block, AI-fill missing fields, and set the token image BEFORE placing.
 * Edits target the template, so every instance spawned afterwards inherits them.
 */
export function TemplateEditor({ monster }: { monster: Monster }) {
  const aiFillCreature = useStore((s) => s.aiFillCreature);
  const updateMonster = useStore((s) => s.updateMonster);
  const aiBusy = useStore((s) => s.aiBusy);

  return (
    <div className="template-editor">
      <h4>Token image</h4>
      <IconTools
        onApply={(icon) => updateMonster({ monsterId: monster.id, icon })}
      />
      <StatBlock
        creature={monster}
        subtitle={monster.creatureType}
        identity={[
          { key: 'creatureType', label: 'Type', value: monster.creatureType },
        ]}
        levelLabel="CR"
        monster
        aiBusy={aiBusy}
        onAiFill={() => aiFillCreature(monster.id)}
        onSave={(patch) => updateMonster({ monsterId: monster.id, ...patch })}
      />
      <p className="hint">Edits apply to every {monster.name} you place next.</p>
    </div>
  );
}
