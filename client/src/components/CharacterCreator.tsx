import { useEffect,useRef,useState,useId,type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { CORE_CLASSES_2024,type CoreClass } from '../../../shared/characterProgression';
import { CLASS_IDENTITY,CREATOR_SPECIES,CREATOR_ABILITIES,ORIGIN_FEATS,STANDARD_ARRAY,STARTER_KITS,creatorHeldWeapons,creatorPreview,creatorError,pointCost,suggestedScores,suggestedMagic,assignRolledScores,completeStatRoll,type CreatorStatDraft,type CreatorStatRollRequest,type CreatorChoices,type CreatorCatalog } from '../../../shared/characterCreation';
import {INSTRUMENTS,ARTISAN_TOOLS} from '../../../shared/startingEquipment2024';
import { SKILLS,abilityMod,type AbilityKey } from '../../../shared/skills';
import { useStore } from '../state/socket';
import './character-creator.css';
import {CreatorEquipmentPicker} from './CreatorEquipmentPicker';

const STEPS=['Identity','Abilities','Equipment & skills','Spells','Appearance','Ready to play'];
const sign=(n:number)=>n>=0?`+${n}`:String(n);
function initial():CreatorChoices {return {requestId:crypto.randomUUID(),name:'',species:'Human',className:'fighter',method:'array',scores:suggestedScores('fighter'),background:'Adventurer',boosts:{STR:2,CON:1},originFeat:'Tough',humanFeat:'Alert',backgroundSkills:['Insight','Survival'],skills:['Athletics','Perception'],extraSkills:['Persuasion'],kitId:'greatsword',features:{fightingStyle:['Great Weapon Fighting'],masteries:['Greatsword','Javelin','Longsword']},cantrips:[],spells:[],prepared:[]};}

/** Kept mounted while closed so accidental dismissal preserves the draft. */
export function CharacterCreator({onCreated}:{onCreated:(id:string)=>void}) {
  const [open,setOpen]=useState(false),[choices,setChoices]=useState<CreatorChoices>(initial),[step,setStep]=useState(0);
  const [catalog,setCatalog]=useState<CreatorCatalog|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(false),[search,setSearch]=useState('');
  const [rolling,setRolling]=useState(false),[statDraft,setStatDraft]=useState<CreatorStatDraft>(),pendingRoll=useRef<CreatorStatRollRequest|null>(null);
  const dialog=useRef<HTMLDialogElement>(null),content=useRef<HTMLDivElement>(null),headingId=useId();
  const create=useStore(s=>s.createGuidedCharacter),status=useStore(s=>s.status);
  const rollStats=useStore(s=>s.rollCreatorStats);
  useEffect(()=>{if(open&&!rolling)dialog.current?.showModal();else dialog.current?.close();},[open,rolling]);
  useEffect(()=>{content.current?.scrollTo({top:0});dialog.current?.querySelector('.creator-body')?.scrollTo({top:0});},[step]);
  useEffect(()=>{if(!open||catalog)return;const controller=new AbortController();setLoading(true);
    fetch('/api/character-creator/catalog',{signal:controller.signal}).then(r=>{if(!r.ok)throw new Error();return r.json();}).then(setCatalog).catch(e=>{if(e.name!=='AbortError')setError('The character options could not load. Close and reopen the creator to retry.');}).finally(()=>setLoading(false));
    return ()=>controller.abort();
  },[open,catalog]);
  const preview=creatorPreview(choices),cls=CLASS_IDENTITY[choices.className];
  const patch=(p:Partial<CreatorChoices>)=>{setChoices(c=>({...c,...p}));setError('');};
  const changeClass=(className:CoreClass)=>{
    const bg=choices.backgroundSkills,def=CLASS_IDENTITY[className],p=creatorPreview({...choices,className}).progression;
    const spells=catalog?.spells.filter(s=>s.classes?.includes(className))??[];
    const selected=suggestedMagic(className,spells,1,className==='wizard'?6:p.preparedSpells);
    const features:Record<string,string[]>={};
    for(const f of catalog?.choices[className]??[])if(!f.when&&f.key!=='expertise'){
      const names=f.options.map(o=>o.name);
      features[f.key]=f.key==='masteries'?[...new Set([...STARTER_KITS[className][0].weapons,...names])].filter(n=>names.includes(n)).slice(0,f.count):names.slice(0,f.count);
    }
    const skills=def.skills.filter(s=>!bg.includes(s)).slice(0,def.skillCount);
    if(className==='rogue')features.expertise=skills.slice(0,2);
    patch({className,scores:choices.method==='roll'&&choices.rolled?assignRolledScores(className,choices.rolled.scores):suggestedScores(className),method:choices.method==='roll'&&choices.rolled?'roll':'array',boosts:{[def.priority[0]]:2,[def.priority[1]]:1},kitId:STARTER_KITS[className][0].id,equipmentTool:undefined,purchases:[],wornArmor:undefined,equippedShield:undefined,tokenCrafting:choices.tokenCrafting?{...choices.tokenCrafting,heldWeapon:undefined}:undefined,skills,features,
      extraSkills:SKILLS.map(s=>s.name).filter(s=>![...bg,...skills].includes(s)).slice(0,extraCount),
      spells:selected,prepared:selected.slice(0,p.preparedSpells),cantrips:suggestedMagic(className,spells,0,p.cantrips)});
  };
  const extraCount=(choices.species==='Human'?1:0)+(choices.originFeat==='Skilled'||choices.humanFeat==='Skilled'&&choices.species==='Human'?3:0);
  const bonusCantrip=choices.features.order?.some(n=>['Thaumaturge','Magician'].includes(n))?1:0;
  const spellCount=choices.className==='wizard'?6:preview.progression.preparedSpells;
  const generateStats=async(index?:number)=>{
    pendingRoll.current??={rollId:index===undefined?crypto.randomUUID():statDraft?.id??crypto.randomUUID(),className:choices.className,name:choices.name,index};setError('');setRolling(true);
    const result=await rollStats(pendingRoll.current);
    if(result.ok){pendingRoll.current=null;setStatDraft(result.roll);const complete=completeStatRoll(result.roll);
      if(result.roll.kept)setError('You already rolled a new set. These stats stay until you use them on a character.');
      patch({method:'roll',rolled:complete,scores:Object.fromEntries(CREATOR_ABILITIES.map((a,i)=>[a,result.roll.scores[i]??choices.scores[a]])) as Record<AbilityKey,number>});
    }else setError(result.error);
    setRolling(false);
  };
  const selectMany=(list:string[],name:string,count:number)=>list.includes(name)?list.filter(s=>s!==name):list.length<count?[...list,name]:list;
  const go=(next:number)=>{if(next>step){const invalid=creatorError(choices,step,catalog??undefined);if(invalid){setError(invalid);return;}}
    setStep(next);setError('');setSearch('');content.current?.scrollTo({top:0});};
  const finish=async()=>{for(let s=0;s<5;s++){const invalid=creatorError(choices,s,catalog??undefined);if(invalid){setStep(s);setError(invalid);return;}}
    setBusy(true);setError('');const result=await create(choices);setBusy(false);
    if(result.ok){setOpen(false);onCreated(result.characterId);setChoices(initial());setStatDraft(undefined);pendingRoll.current=null;setStep(0);}else setError(result.error);
  };
  const skillsGroup=(label:string,list:string[],selected:string[],count:number,onChange:(next:string[])=>void)=><fieldset className="creator-fieldset"><legend>{label} <span>{selected.length} / {count}</span></legend>
    <div className="creator-chips">{list.map(name=><button type="button" key={name} aria-pressed={selected.includes(name)} disabled={!selected.includes(name)&&selected.length>=count} onClick={()=>onChange(selectMany(selected,name,count))}>{name}</button>)}</div></fieldset>;
  return <>
    <button className="creator-launch" onClick={()=>setOpen(true)}><span className="creator-launch-sigil" aria-hidden="true">✦</span><span><strong>Create a character</strong><small>A guided path from first idea to your first adventure</small></span><span aria-hidden="true">→</span></button>
    {createPortal(<dialog ref={dialog} className="character-creator" aria-labelledby={headingId} onCancel={e=>{e.preventDefault();if(!busy)setOpen(false);}}>
      <header className="creator-header"><div><p className="creator-eyebrow">A new adventure · Level 1</p><h2 id={headingId}>Bring your hero to life</h2></div><button className="btn" aria-label="Close character creator" disabled={busy} onClick={()=>setOpen(false)}>×</button></header>
      <nav className="creator-steps" aria-label="Character creation steps">{STEPS.map((name,i)=><button key={name} disabled={busy||i>step} aria-current={i===step?'step':undefined} onClick={()=>go(i)}><span>{i<step?'✓':i+1}</span>{name}</button>)}</nav>
      <div className="creator-body">
        <div className="creator-content" ref={content}>
          {step===0&&<><p className="creator-eyebrow">01 / Identity</p><h3>Who will you become?</h3><p className="creator-copy">Choose what calls to you. Your class shapes how you fight; your species brings its own traits.</p>
            <label className="creator-label">Character name<input autoFocus maxLength={60} placeholder="Your name will become a legend…" value={choices.name} onChange={e=>patch({name:e.target.value})}/></label>
            <fieldset className="creator-fieldset"><legend>Choose your race (species)</legend><div className="creator-chips">{CREATOR_SPECIES.map(s=><button key={s} aria-pressed={s===choices.species} onClick={()=>patch({species:s,extraSkills:[]})}>{s}</button>)}</div>
              {catalog&&<ul className="creator-traits">{catalog.traits[choices.species]?.map(t=><li key={t.name}><strong>{t.name}</strong> <span>{t.meta}</span></li>)}</ul>}
            </fieldset>
            <fieldset className="creator-fieldset"><legend>Choose your class</legend><div className="creator-class-grid">{CORE_CLASSES_2024.map(c=>{const d=CLASS_IDENTITY[c];return <button key={c} style={{'--class-color':d.color} as CSSProperties} className="creator-class-card" aria-pressed={c===choices.className} onClick={()=>changeClass(c)}><span className="creator-class-symbol" aria-hidden="true">{d.symbol}</span><strong>{d.title}</strong><small>{d.summary}</small></button>;})}</div></fieldset></>}
          {step===1&&<><p className="creator-eyebrow">02 / Abilities</p><h3>Find your strengths</h3><p className="creator-copy">Start with suggested scores, or shape them yourself. Background increases are included in the gold totals.</p>
            <div className="creator-segment"><button aria-pressed={choices.method==='array'} onClick={()=>patch({method:'array',scores:suggestedScores(choices.className)})}>Standard array</button><button aria-pressed={choices.method==='points'} onClick={()=>patch({method:'points',scores:Object.fromEntries(CREATOR_ABILITIES.map(a=>[a,8])) as Record<AbilityKey,number>})}>27-point buy</button><button aria-pressed={choices.method==='roll'} onClick={()=>patch({method:'roll',scores:choices.rolled?assignRolledScores(choices.className,choices.rolled.scores):choices.scores})}>Roll for stats</button></div>
            <p className="creator-copy">{choices.method==='points'?`${27-pointCost(choices.scores)} points remaining`:choices.method==='roll'?'Click each ability to roll 4d6 and drop the lowest. Roll all tosses all 24 dice together. You can swap the six scores afterward.':'15 · 14 · 13 · 12 · 10 · 8 — each score used once'}</p>
            {choices.method==='roll'&&<><div className="creator-segment"><button className="btn creator-next" disabled={status!=='connected'} onClick={()=>generateStats()}>{pendingRoll.current?'Recover stat roll':statDraft?'Roll all (new set)':'Roll all'}</button>
              {choices.rolled&&<button onClick={()=>patch({scores:assignRolledScores(choices.className,choices.rolled!.scores)})}>Suggest assignment</button>}
            </div><div className="creator-roll-results" aria-label="Rolled ability scores">{CREATOR_ABILITIES.map((a,i)=>{const g=statDraft?.groups[i];return <div key={a}><small>{a}</small>{g?<><div>{g.faces.map((f,j)=><span key={j} className={j===g.dropped?'dropped':''} aria-label={j===g.dropped?`${f}, dropped`:String(f)}>{f}</span>)}</div><strong>{g.total}</strong></>:<><strong>—</strong><button className="btn" disabled={status!=='connected'||!!pendingRoll.current} onClick={()=>generateStats(i)}>Roll {a}</button></>}</div>;})}</div>
            </>}
            <div className="creator-stat-grid">{CREATOR_ABILITIES.map(a=><label key={a} className="creator-stat"><strong>{a}</strong><select aria-label={`${a} base score`} disabled={choices.method==='roll'&&!choices.rolled} value={choices.scores[a]} onChange={e=>{const n=Number(e.target.value),scores={...choices.scores};if(choices.method!=='points'){const other=CREATOR_ABILITIES.find(b=>b!==a&&scores[b]===n);if(other)scores[other]=scores[a];}scores[a]=n;patch({scores});}}>{(choices.method==='array'?STANDARD_ARRAY:choices.method==='roll'?[...new Set(choices.rolled?.scores??Object.values(choices.scores))].sort((a,b)=>b-a):[8,9,10,11,12,13,14,15]).map(n=><option key={n} value={n}>{n}</option>)}</select><span className="creator-final-score">{preview.stats[a]}</span><small>{sign(abilityMod(preview.stats[a]))} modifier</small></label>)}</div>
            <label className="creator-label">Background<input value={choices.background} maxLength={60} onChange={e=>patch({background:e.target.value})}/></label><p className="creator-copy">Build a custom origin with your DM: two skills, one origin feat, and +2/+1 or three +1 ability increases.</p>
            <div className="creator-boosts">{CREATOR_ABILITIES.map(a=><label key={a}>{a}<select aria-label={`${a} background increase`} value={choices.boosts[a]??0} onChange={e=>patch({boosts:{...choices.boosts,[a]:Number(e.target.value)}})}>{[0,1,2].map(n=><option key={n} value={n}>+{n}</option>)}</select></label>)}</div>
            <label className="creator-label">Origin feat<select value={choices.originFeat} onChange={e=>patch({originFeat:e.target.value,extraSkills:[]})}>{ORIGIN_FEATS.map(n=><option key={n}>{n}</option>)}</select></label>
            {choices.species==='Human'&&<label className="creator-label">Human bonus origin feat<select value={choices.humanFeat} onChange={e=>patch({humanFeat:e.target.value,extraSkills:[]})}>{ORIGIN_FEATS.map(n=><option key={n}>{n}</option>)}</select></label>}
          </>}
          {step===2&&<><p className="creator-eyebrow">03 / Equipment & skills</p><h3>Ready for the road</h3><p className="creator-copy">Pick a starter loadout, then choose what you do best. Your weapons use your live ability scores as you level.</p>
            <fieldset className="creator-fieldset"><legend>Starting loadout</legend><p className="creator-copy">2024 class equipment packages, including quantities and remaining gold. Your custom background adds its 50-GP alternative.</p><div className="creator-loadouts">{STARTER_KITS[choices.className].map(k=><button key={k.id} aria-pressed={choices.kitId===k.id} onClick={()=>patch({kitId:k.id,purchases:[],wornArmor:undefined,equippedShield:undefined,tokenCrafting:choices.tokenCrafting?{...choices.tokenCrafting,heldWeapon:undefined}:undefined})}><strong>{k.name}</strong><span>{k.description}</span></button>)}</div></fieldset>
            {['bard','monk'].includes(choices.className)&&choices.kitId!=='gold'&&<label className="creator-label">{choices.className==='bard'?'Starting musical instrument':'Starting tool or instrument'}<select value={choices.equipmentTool??(choices.className==='bard'?'Lute':ARTISAN_TOOLS[3])} onChange={e=>patch({equipmentTool:e.target.value})}>{(choices.className==='bard'?INSTRUMENTS:[...ARTISAN_TOOLS,...INSTRUMENTS]).map(n=><option key={n}>{n}</option>)}</select></label>}
            <CreatorEquipmentPicker choices={choices} onChange={patch}/>
            {skillsGroup('Background skills',SKILLS.map(s=>s.name),choices.backgroundSkills,2,backgroundSkills=>patch({backgroundSkills,skills:choices.skills.filter(s=>!backgroundSkills.includes(s)),extraSkills:[],features:{...choices.features,expertise:[]}}))}
            {skillsGroup(`${cls.title} skills`,cls.skills.filter(s=>!choices.backgroundSkills.includes(s)),choices.skills,cls.skillCount,skills=>patch({skills,extraSkills:choices.extraSkills.filter(s=>!skills.includes(s)),features:{...choices.features,expertise:[]}}))}
            {extraCount>0&&skillsGroup('Additional skills',SKILLS.map(s=>s.name).filter(s=>![...choices.backgroundSkills,...choices.skills].includes(s)),choices.extraSkills,extraCount,extraSkills=>patch({extraSkills}))}
            {(catalog?.choices[choices.className]??[]).filter(f=>f.key!=='orderCantrip'&&(!f.when||choices.features[f.when.key]?.includes(f.when.option))).map(f=><div key={f.key}>{skillsGroup(f.label,f.key==='expertise'?[...choices.backgroundSkills,...choices.skills,...choices.extraSkills]:f.options.map(o=>o.name),choices.features[f.key]??[],f.count,names=>patch({features:{...choices.features,[f.key]:names}}))}<p className="creator-copy">{f.options.filter(o=>choices.features[f.key]?.includes(o.name)).map(o=>o.description).join(' ')}</p></div>)}
            <p className="creator-copy">Saving-throw proficiencies: {cls.saves.join(' & ')}.</p>
          </>}
          {step===3&&<><p className="creator-eyebrow">04 / Spells</p><h3>{spellCount?'Choose your first magic':'Your power is in your training'}</h3><p className="creator-copy">{spellCount?`Choose your ${spellCount} first-level ${cls.title} spells${preview.progression.cantrips+bonusCantrip?` and ${preview.progression.cantrips+bonusCantrip} cantrips`:''}. Suggested choices are selected; you can swap them here. Your spellbook, prepared spells and starting slots are created automatically.`:'This class has no spellcasting at level one. Your class abilities will be ready on your sheet.'}</p>
            {spellCount>0&&<label className="creator-label">Search spells<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Name or effect…"/></label>}
            {[{level:0,label:'Cantrips',count:preview.progression.cantrips+bonusCantrip,selected:choices.cantrips},{level:1,label:choices.className==='wizard'?'Spellbook spells':'First-level spells',count:spellCount,selected:choices.spells}].filter(g=>g.count>0).map(g=><fieldset className="creator-fieldset" key={g.level}><legend>{g.label} <span>{g.selected.length} / {g.count}</span></legend><div className="creator-spells">{catalog?.spells.filter(s=>s.classes?.includes(choices.className)&&s.level===g.level&&`${s.name} ${s.description}`.toLowerCase().includes(search.toLowerCase())).map(s=><button key={s.name} aria-pressed={g.selected.includes(s.name)} disabled={!g.selected.includes(s.name)&&g.selected.length>=g.count} onClick={()=>{const names=selectMany(g.selected,s.name,g.count);patch(g.level===0?{cantrips:names}:{spells:names,prepared:choices.className==='wizard'?names.slice(0,preview.progression.preparedSpells):names});}}><strong>{s.name}</strong><small>{s.school} · {s.meta}</small><span>{s.description}</span></button>)}</div></fieldset>)}
            {choices.className==='wizard'&&skillsGroup('Prepared today',choices.spells,choices.prepared,preview.progression.preparedSpells,prepared=>patch({prepared}))}
            {choices.className==='ranger'&&<p className="creator-note">Hunter’s Mark is added as an always-prepared spell.</p>}
          </>}
          {step===4&&<><p className="creator-eyebrow">05 / Appearance</p><h3>A hero you can picture</h3><p className="creator-copy">Describe your hero’s build, face, hair, clothing, colors, and any distinctive details. We’ll include their {choices.species} heritage, {cls.title} class, and selected equipment.</p>
            <label className="creator-label">Your hero’s appearance<textarea maxLength={600} rows={6} value={choices.tokenCrafting?.appearance??''} onChange={e=>patch({tokenCrafting:{...choices.tokenCrafting,enabled:choices.tokenCrafting?.enabled??false,appearance:e.target.value}})} placeholder="A tall orc with dark green skin, warm brown eyes, braided black hair, weathered chainmail, and a deep red sash…"/></label>
            <label className="creator-label">Weapon held by your token<select aria-label="Weapon held by your token" value={choices.tokenCrafting?.heldWeapon??''} onChange={e=>patch({tokenCrafting:{enabled:choices.tokenCrafting?.enabled??false,appearance:choices.tokenCrafting?.appearance??'',heldWeapon:e.target.value}})}><option value="">Choose a weapon or Unarmed...</option>{creatorHeldWeapons(choices).map(n=><option key={n}>{n}</option>)}</select></label><p className="creator-copy">Uses the weapons chosen in Equipment & skills. Other weapons are stowed. This controls the art; you can still use all your equipped weapons in combat.</p>
            <label className="creator-craft-toggle"><input type="checkbox" checked={choices.tokenCrafting?.enabled??false} onChange={e=>patch({tokenCrafting:{...choices.tokenCrafting,enabled:e.target.checked,appearance:choices.tokenCrafting?.appearance??''}})}/><span><strong>Craft token art & a 3D miniature</strong><small>Generation runs in the background. You can start playing immediately; your miniature appears when ready.</small></span></label>
            <p className="creator-note">Uses the configured Gemini image generator for four matching views, then the existing 2D-to-3D workflow. Equipment stays simple and consistent. You can check progress or retry from your character sheet. Prefer your own model? Create the character, then upload a GLB under Personal token & miniature on the sheet.</p>
          </>}
          {step===5&&<><p className="creator-eyebrow">06 / Ready to play</p><h3>{choices.name}, your story begins</h3><p className="creator-copy">Review your level-one sheet. Creating it selects this character for you; place your token when you are ready.</p>
            <div className="creator-vitals"><div><strong>{preview.hp}</strong><span>Hit points</span></div><div><strong>{preview.ac}</strong><span>Armor class</span></div><div><strong>+2</strong><span>Proficiency</span></div></div>
            <dl className="creator-review"><dt>Identity</dt><dd>{choices.species} {cls.title} · {choices.background}</dd><dt>Weapons</dt><dd>{preview.equipment.weapons.join(', ')||'Unarmed'}</dd><dt>Inventory</dt><dd>{preview.equipment.items.map(i=>`${i.name}${i.qty>1?` ×${i.qty}`:''}`).join(', ')||'No purchased equipment'}</dd><dt>Worn armor</dt><dd>{preview.equipment.wornArmor?.name??'None'}{preview.equipment.shield?' + Shield':''}</dd><dt>Gold left</dt><dd>{preview.gold} GP</dd><dt>Skills</dt><dd>{[...choices.backgroundSkills,...choices.skills,...choices.extraSkills].join(', ')}</dd><dt>Origin feats</dt><dd>{[choices.originFeat,...(choices.species==='Human'?[choices.humanFeat]:[])].join(', ')}</dd><dt>Features</dt><dd>{preview.progression.features.join(', ')}{Object.values(choices.features).flat().length>0&&` · ${Object.values(choices.features).flat().join(', ')}`}</dd><dt>Magic</dt><dd>{[...choices.cantrips,...choices.spells,...(choices.className==='ranger'?["Hunter's Mark"]:[])].join(', ')||'No spells at this level'}</dd></dl>
            <p className="creator-note">Species traits are included. Choose any ancestry or lineage details with your DM on the character sheet. Level-ups use the existing 2024 guide.</p>
            {choices.tokenCrafting?.appearance&&<p className="creator-copy"><strong>Appearance:</strong> {choices.tokenCrafting.appearance}</p>}
            {choices.tokenCrafting?.enabled&&<p className="creator-note">Your personal token will hold {choices.tokenCrafting.heldWeapon}. Its art and 3D miniature will be crafted after you create the character.</p>}
          </>}
        </div>
        <aside className="creator-preview" aria-label="Character preview" style={{'--class-color':cls.color} as CSSProperties}><div className="creator-emblem" aria-hidden="true">{cls.symbol}</div><p className="creator-eyebrow">Your hero</p><h3>{choices.name.trim()||'An unwritten legend'}</h3><p>{choices.species} {cls.title}</p><span className="creator-level">LEVEL ONE</span><div className="creator-vitals"><div><strong>{preview.hp}</strong><span>Hit points</span></div><div><strong>{preview.ac}</strong><span>Armor class</span></div><div><strong>+2</strong><span>Proficiency</span></div></div><div className="creator-mini-stats">{CREATOR_ABILITIES.map(a=><div key={a}><small>{a}</small><strong>{preview.stats[a]}</strong></div>)}</div><p className="creator-preview-story">{cls.summary}</p><small>Hit die: d{preview.hitDie} · Speed: {preview.speed} ft</small></aside>
      </div>
      <footer className="creator-footer"><div aria-live="polite">{error?<p className="creator-error" role="alert">{error}</p>:<span>{loading?'Loading character options…':'Your draft stays here if you close this window.'}</span>}</div><div><button className="btn" disabled={busy} onClick={()=>step?go(step-1):setOpen(false)}>{step?'Back':'Close'}</button>{step<5?<button className="btn creator-next" disabled={busy||loading||!catalog} onClick={()=>go(step+1)}>Next →</button>:<button className="btn creator-next" disabled={busy||status!=='connected'} onClick={finish}>{busy?'Creating…':choices.tokenCrafting?.enabled?'Create & craft token':'Create & play'}</button>}</div></footer>
    </dialog>,document.body)}
  </>;
}
