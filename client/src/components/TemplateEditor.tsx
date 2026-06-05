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

  return (
    <div className="template-editor">
      <button
        className="btn tiny ai-fill"
        onClick={() => aiFillCreature(monster.id)}
        title="Use AI to fill only the empty fields (stats, weapons, actions…)"
      >
        ✨ Fill missing details with AI
      </button>
      <h4>Token image</h4>
      <IconTools
        onApply={(icon) => updateMonster({ monsterId: monster.id, icon })}
      />
      <StatBlock monster={monster} />
      <p className="hint">
        Edits apply to every {monster.name} you place next.
      </p>
    </div>
  );
}
