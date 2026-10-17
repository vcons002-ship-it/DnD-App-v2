import {useState} from 'react';
import {CREATOR_EQUIPMENT,equipmentPrice,type CreatorEquipmentItem} from '../../../shared/equipmentCatalog2024';
import {creatorEquipment,creatorEquipmentAllowed,type CreatorChoices} from '../../../shared/characterCreation';
import {STARTING_PACK_CONTENTS} from '../../../shared/startingEquipment2024';
function equipmentDetail(i:CreatorEquipmentItem){
  if(i.description)return i.description;
  if(i.category!=='armor')return i.category;
  return `AC ${i.acBase}${i.dexCap?` + DEX${i.dexCap===2?' (max 2)':''}`:''}${i.strengthMin?` · STR ${i.strengthMin}`:''}${i.stealthDisadvantage?' · Stealth disadvantage':''}`;
}

export function CreatorEquipmentPicker({choices,onChange}:{choices:CreatorChoices;onChange:(p:Partial<CreatorChoices>)=>void}){
  const [search,setSearch]=useState(''),[category,setCategory]=useState('weapon');
  const e=creatorEquipment(choices),purchases=choices.purchases??[];
  const adjust=(id:string,delta:number)=>{
    const existing=purchases.find(p=>p.id===id),qty=(existing?.qty??0)+delta;
    const next=purchases.filter(p=>p.id!==id);if(qty>0)next.push({id,qty});
    const item=CREATOR_EQUIPMENT.find(i=>i.id===id)!;
    const patch:Partial<CreatorChoices>={purchases:next,tokenCrafting:choices.tokenCrafting?{...choices.tokenCrafting,heldWeapon:undefined}:undefined};
    if(delta>0&&item.category==='armor'&&!e.wornArmor)patch.wornArmor=id;
    if(qty===0&&choices.wornArmor===id)patch.wornArmor=undefined;
    if(qty===0&&item.category==='shield'&&!e.kit.shield)patch.equippedShield=false;
    onChange(patch);
  };
  const available=CREATOR_EQUIPMENT.filter(i=>creatorEquipmentAllowed(choices,i)&&(search.trim()?`${i.name} ${i.description??''}`.toLowerCase().includes(search.toLowerCase()):i.category===category));
  return <><fieldset className="creator-fieldset creator-inventory"><legend>Your starting inventory</legend>
    <p className="creator-copy">Everything listed here will be in your inventory. Class and background equipment is already included; buying is optional.</p>
    <dl className="creator-review"><dt>Class gold</dt><dd>{e.kit.gold} GP</dd><dt>Background</dt><dd>{choices.backgroundEquipment==='package'?`${choices.background} equipment + ${e.backgroundGold} GP`:'50 GP instead of background equipment'}</dd><dt>Purchases</dt><dd>−{equipmentPrice(e.spentCp)}</dd><dt>Gold left</dt><dd><strong>{equipmentPrice(e.budgetCp-e.spentCp)}</strong></dd></dl>
    <ul aria-label="Starting inventory contents">{e.items.map(i=><li key={i.name}><strong>{i.qty} × {i.name}</strong><small>{[e.classItems.some(k=>k.name===i.name)?'Class loadout':'',e.backgroundItems.some(k=>k.name===i.name)?'Background package':'',purchases.some(p=>CREATOR_EQUIPMENT.find(item=>item.id===p.id)?.name===i.name)?'Purchased':''].filter(Boolean).join(' + ')}{i.name===e.wornArmor?.name?' · Worn':i.name==='Shield'&&e.shield?' · Equipped':''}</small>{STARTING_PACK_CONTENTS[i.name]&&<details><summary>What’s in {i.name}?</summary><p>{STARTING_PACK_CONTENTS[i.name]}</p><small>Stored as one pack, with these contents in its inventory notes.</small></details>}</li>)}</ul>
    {e.items.length===0&&<p className="creator-note">No equipment yet. You chose starting gold; buy your weapons, armor and supplies below.</p>}
  </fieldset><fieldset className="creator-fieldset creator-shopping"><legend>Buy starting equipment (optional)</legend>
    <p className="creator-copy">Add equipment using your remaining starting gold. Weapon and armor choices match your class training. Your weapons, inventory, armor class and remaining gold are added when you create the character.</p>
    <p className={`creator-budget${e.gold<0?' creator-error':''}`} role="status"><strong>{equipmentPrice(e.budgetCp-e.spentCp)} remaining</strong><span>{equipmentPrice(e.spentCp)} spent of {equipmentPrice(e.budgetCp)}</span></p>
    <label className="creator-label">Search equipment<input value={search} onChange={event=>setSearch(event.target.value)} placeholder="Maul, chain mail, holy symbol…"/></label>
    {!search&&<div className="creator-chips" aria-label="Equipment categories">{[['weapon','Weapons'],['armor','Armor'],['shield','Shields'],['pack','Packs'],['focus','Spellcasting focuses'],['ammunition','Ammunition'],['gear','Adventuring gear'],['tool','Tools & instruments']].map(([value,label])=><button key={value} aria-pressed={category===value} onClick={()=>setCategory(value)}>{label}</button>)}</div>}
    <div className="creator-shop-results">{available.slice(0,16).map(i=>{const count=purchases.find(p=>p.id===i.id)?.qty??0;return <div className="creator-shop-item" key={i.id}><div><strong>{i.name}{i.quantity>1?` (×${i.quantity})`:''}</strong><small>{equipmentDetail(i)}</small></div><span>{equipmentPrice(i.costCp)}</span><button className="btn" aria-label={`Buy ${i.name}`} disabled={i.costCp>e.budgetCp-e.spentCp||count>=99||!count&&purchases.length>=64} onClick={()=>adjust(i.id,1)}>+ Add</button></div>;})}{available.length>16&&<p className="creator-copy">Search to narrow {available.length} matching items.</p>}{available.length===0&&<p className="creator-copy">No equipment matches that search.</p>}</div>
    {purchases.length>0&&<div className="creator-cart"><h4>Purchased equipment</h4>{purchases.map(p=>{const i=CREATOR_EQUIPMENT.find(i=>i.id===p.id)!;return <div key={p.id}><span>{i.name} ×{p.qty*i.quantity}</span><small>{equipmentPrice(i.costCp*p.qty)}</small><button className="btn" aria-label={`Remove one ${i.name}`} onClick={()=>adjust(p.id,-1)}>−</button><span aria-label={`${i.name} purchase quantity`}>{p.qty}</span><button className="btn" aria-label={`Buy another ${i.name}`} disabled={i.costCp>e.budgetCp-e.spentCp||p.qty>=99} onClick={()=>adjust(p.id,1)}>+</button></div>;})}</div>}
    <label className="creator-label">Worn armor<select value={e.wornArmor?.id??'none'} onChange={event=>onChange({wornArmor:event.target.value})}><option value="none">No armor</option>{e.armors.map(i=><option value={i.id} key={i.id}>{i.name}</option>)}</select></label>
    {e.items.some(i=>i.name==='Shield')&&<label className="creator-craft-toggle"><input type="checkbox" checked={e.shield} onChange={event=>onChange({equippedShield:event.target.checked})}/><span>Equip shield (+2 AC). Stow it when using a two-handed weapon.</span></label>}
    {e.wornArmor?.strengthMin&&choices.scores.STR+(choices.boosts.STR??0)<e.wornArmor.strengthMin?<p className="creator-note">This armor requires STR {e.wornArmor.strengthMin}. Your starting speed is reduced by 10 ft.</p>:null}
  </fieldset></>;
}
