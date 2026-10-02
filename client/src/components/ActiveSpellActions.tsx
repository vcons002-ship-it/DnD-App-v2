import type {Character,Monster,TokenKind} from '../../../shared/types';
import {mirrorImageCount} from '../../../shared/linkedSpells';
import {spellActionBlock} from '../../../shared/spellBuffs';
import {useStore} from '../state/socket';

export function ActiveSpellActions({caster,kind,ownTurn,targetTokenId}:{caster:Character|Monster;kind:TokenKind;ownTurn:boolean;targetTokenId?:string}) {
  const repeat=useStore(s=>s.repeatSpell),drop=useStore(s=>s.dropHeatedItem),consume=useStore(s=>s.consumeAdvantage);
  const snapshot=useStore(s=>s.snapshot),inCombat=!!snapshot?.activeTurnTokenId;
  const turn=`${snapshot?.activeMapId}:${snapshot?.round??0}:${snapshot?.activeTurnTokenId}`;
  const count=mirrorImageCount(caster.conditions);
  return <section aria-label="Active spell actions">
    {count>0&&<p className="muted">Mirror Image · {count} duplicate{count===1?'':'s'} remaining</p>}
    {caster.conditions.filter(c=>c.combatEffect?.spellAction).map(c=>{
      const fx=c.combatEffect!,locked=/^(witch bolt|heat metal)$/i.test(fx.spell);
      const used=inCombat&&fx.lastUseTurn===turn;
      return <div className="combat-ability-row" key={c.id}>
        <button className="btn tiny attack-row" disabled={!!spellActionBlock(caster)||inCombat&&(!ownTurn||used)||(!locked&&!targetTokenId)||!!fx.itemDropped}
          onClick={()=>repeat({kind,refId:caster.id,conditionId:c.id,targetTokenId:locked?undefined:targetTokenId,advantage:/^(vampiric touch|flame blade|spiritual weapon)$/i.test(fx.spell)?consume(caster.id):undefined})}>
          {fx.spell} · {fx.spellAction}{used?' (used)':''}
        </button><small className="muted">{fx.itemDropped?'Heated item dropped':fx.summonTokenId?'Selected target within 5 ft of the weapon · drag up to 20 ft before attacking · no new slot':locked?'Original linked target · no new slot':'Selected target · no new slot'}</small>
      </div>;
    })}
    {caster.conditions.filter(c=>c.combatEffect?.spell.toLowerCase()==='heat metal'&&!c.isConcentration&&!c.combatEffect.spellAction).map(c=><div key={c.id} className="combat-ability-row">
      <button className="btn tiny" onClick={()=>drop({kind,refId:caster.id,conditionId:c.id})}>Drop heated item</button>
      <small className="muted">Held item only; worn armor must be removed normally.</small>
    </div>)}
  </section>;
}
