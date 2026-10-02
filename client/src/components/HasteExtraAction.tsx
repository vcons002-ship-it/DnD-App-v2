import { useState } from 'react';
import type { Character, Monster, TokenKind } from '../../../shared/types';
import { activeHasteCondition, effectiveSpeed, hasHasteLethargy, spellActionBlock } from '../../../shared/spellBuffs';
import { useStore } from '../state/socket';
import './haste-extra-action.css';

/** Haste supplies one restricted action, independent of the table's normal
 * action bookkeeping. A weapon attack is consumed by the server on acceptance. */
export function HasteExtraAction({ caster, kind, ownTurn, attackArmed, onArmAttack }: {
  caster: Character | Monster;
  kind: TokenKind;
  ownTurn: boolean;
  attackArmed: boolean;
  onArmAttack: (armed: boolean) => void;
}) {
  const useHasteAction = useStore(s => s.useHasteAction);
  const [action, setAction] = useState<'attack' | 'dash' | 'disengage' | 'hide' | 'utilize'>('attack');
  if (hasHasteLethargy(caster)) return <div className="haste-action haste-recovery" role="status">
    <strong>Haste lethargy</strong><span>Incapacitated · Speed 0 ft.</span>
    <small>Recover at the end of your next turn.</small>
  </div>;
  const haste = activeHasteCondition(caster);
  if (!haste) return null;
  const used = haste.combatEffect?.hasteActionUsed;
  const blocked = spellActionBlock(caster);
  return <section className={`haste-action${attackArmed ? ' haste-action-armed' : ''}`} aria-label="Haste benefits">
    <div className="haste-benefits"><strong>Haste</strong><span>+2 AC · {effectiveSpeed(caster)} · DEX save advantage</span></div>
    <div className="haste-action-controls">
      <span>Extra action</span>
      {used ? <strong className="haste-action-used" role="status">Used: {used}</strong> : <>
        <select aria-label="Haste extra action" value={action} disabled={!ownTurn || attackArmed || !!blocked} onChange={event => setAction(event.target.value as typeof action)}>
          <option value="attack">Attack (one weapon attack)</option><option value="dash">Dash</option>
          <option value="disengage">Disengage</option><option value="hide">Hide</option><option value="utilize">Utilize</option>
        </select>
        <button className={`btn tiny${attackArmed ? ' on' : ''}`} disabled={!ownTurn || !!blocked || (action === 'attack' && !caster.weapons.length)}
          onClick={() => action === 'attack' ? onArmAttack(!attackArmed) : useHasteAction({ kind, refId: caster.id, action })}>
          {action === 'attack' ? attackArmed ? 'Cancel extra attack' : 'Ready extra attack' : `Use ${action}`}
        </button>
      </>}
    </div>
    <small>{blocked ? `${blocked}: you cannot take actions.` : used === 'dash' ? 'Dash adds another move up to your current speed this turn.'
      : used === 'disengage' ? 'Movement this turn does not provoke opportunity attacks.'
        : used === 'hide' || used === 'utilize' ? 'The action is recorded. Resolve its check or interaction as needed.'
          : used ? 'Available again on your next turn.'
            : !ownTurn ? 'Available on your turn.'
              : attackArmed ? 'Choose one weapon below. Haste cannot cast a spell or grant a full Multiattack.'
                : 'One extra action per turn; your normal action is tracked separately.'}</small>
  </section>;
}
