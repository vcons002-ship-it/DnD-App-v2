import { useEffect,useRef,useState,useId,type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { CORE_CLASSES_2024,type CoreClass } from '../../../shared/characterProgression';
import { CLASS_IDENTITY,CREATOR_SPECIES,CREATOR_ABILITIES,ORIGIN_FEATS,STANDARD_ARRAY,STARTER_KITS,creatorPreview,creatorError,pointCost,suggestedScores,suggestedMagic,type CreatorChoices,type CreatorCatalog } from '../../../shared/characterCreation';
import { SKILLS,abilityMod,type AbilityKey } from '../../../shared/skills';
import { useStore } from '../state/socket';
import './character-creator.css';

const STEPS=['Identity','Abilities','Equipment & skills','Spells','Ready to play'];
const sign=(n:number)=>n>=0?`+${n}`:String(n);
function initial():CreatorChoices {return {requestId:crypto.randomUUID(),name:'',species:'Human',className:'fighter',method:'array',scores:suggestedScores('fighter'),background:'Adventurer',boosts:{STR:2,CON:1},originFeat:'Tough',humanFeat:'Alert',backgroundSkills:['Insight','Survival'],skills:['Athletics','Perception'],extraSkills:['Persuasion'],kitId:'greatsword',features:{fightingStyle:['Great Weapon Fighting'],masteries:['Greatsword','Javelin','Longsword']},cantrips:[],spells:[],prepared:[]};}

/** Kept mounted while closed so accidental dismissal preserves the draft. */
export function CharacterCreator({onCreated}:{onCreated:(id:string)=>void}) {
  const [open,setOpen]=useState(false),[choices,setChoices]=useState<CreatorChoices>(initial),[step,setStep]=useState(0);
  const [catalog,setCatalog]=useState<CreatorCatalog|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(false),[search,setSearch]=useState('');
  const dialog=useRef<HTMLDialogElement>(null),content=useRef<HTMLDivElement>(null),headingId=useId();
  const create=useStore(s=>s.createGuidedCharacter),status=useStore(s=>s.status);
  useEffect(()=>{if(open)dialog.current?.showModal();else dialog.current?.close();},[open]);
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
    patch({className,scores:suggestedScores(className),method:'array',boosts:{[def.priority[0]]:2,[def.priority[1]]:1},kitId:STARTER_KITS[className][0].id,skills,features,
      extraSkills:SKILLS.map(s=>s.name).filter(s=>![...bg,...skills].includes(s)).slice(0,extraCount),
      spells:selected,prepared:selected.slice(0,p.preparedSpells),cantrips:suggestedMagic(className,spells,0,p.cantrips)});
  };
  const extraCount=(choices.species==='Human'?1:0)+(choices.originFeat==='Skilled'||choices.humanFeat==='Skilled'&&choices.species==='Human'?3:0);
  const bonusCantrip=choices.features.order?.some(n=>['Thaumaturge','Magician'].includes(n))?1:0;
  const spellCount=choices.className==='wizard'?6:preview.progression.preparedSpells;
  const selectMany=(list:string[],name:string,count:number)=>list.includes(name)?list.filter(s=>s!==name):list.length<count?[...list,name]:list;
  const go=(next:number)=>{if(next>step){const invalid=creatorError(choices,step,catalog??undefined);if(invalid){setError(invalid);return;}}
    setStep(next);setError('');setSearch('');content.current?.scrollTo({top:0});};
  const finish=async()=>{for(let s=0;s<4;s++){const invalid=creatorError(choices,s,catalog??undefined);if(invalid){setStep(s);setError(invalid);return;}}
    setBusy(true);setError('');const result=await create(choices);setBusy(false);
    if(result.ok){setOpen(false);onCreated(result.characterId);setChoices(initial());setStep(0);}else setError(result.error);
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
            <fieldset className="creator-fieldset"><legend>Choose your class</legend><div className="creator-class-grid">{CORE_CLASSES_2024.map(c=>{const d=CLASS_IDENTITY[c];return <button key={c} style={{'--class-color':d.color} as CSSProperties} className="creator-class-card" aria-pressed={c===choices.className} onClick={()=>changeClass(c)}><span className="creator-class-symbol" aria-hidden="true">{d.symbol}</span><strong>{d.title}</strong><small>{d.summary}</small></button>;})}</div></fieldset>
            <fieldset className="creator-fieldset"><legend>Choose your species</legend><div className="creator-chips">{CREATOR_SPECIES.map(s=><button key={s} aria-pressed={s===choices.species} onClick={()=>patch({species:s,extraSkills:[]})}>{s}</button>)}</div>
              {catalog&&<ul className="creator-traits">{catalog.traits[choices.species]?.map(t=><li key={t.name}><strong>{t.name}</strong> <span>{t.meta}</span></li>)}</ul>}
            </fieldset></>}
          {step===1&&<><p className="creator-eyebrow">02 / Abilities</p><h3>Find your strengths</h3><p className="creator-copy">Start with suggested scores, or shape them yourself. Background increases are included in the gold totals.</p>
            <div className="creator-segment"><button aria-pressed={choices.method==='array'} onClick={()=>patch({method:'array',scores:suggestedScores(choices.className)})}>Standard array</button><button aria-pressed={choices.method==='points'} onClick={()=>patch({method:'points',scores:Object.fromEntries(CREATOR_ABILITIES.map(a=>[a,8])) as Record<AbilityKey,number>})}>27-point buy</button></div>
            <p className="creator-copy">{choices.method==='points'?`${27-pointCost(choices.scores)} points remaining`:'15 · 14 · 13 · 12 · 10 · 8 — each score used once'}</p>
            <div className="creator-stat-grid">{CREATOR_ABILITIES.map(a=><label key={a} className="creator-stat"><strong>{a}</strong><select aria-label={`${a} base score`} value={choices.scores[a]} onChange={e=>{const n=Number(e.target.value),scores={...choices.scores};if(choices.method==='array'){const other=CREATOR_ABILITIES.find(b=>scores[b]===n);if(other)scores[other]=scores[a];}scores[a]=n;patch({scores});}}>{(choices.method==='array'?STANDARD_ARRAY:[8,9,10,11,12,13,14,15]).map(n=><option key={n} value={n}>{n}</option>)}</select><span className="creator-final-score">{preview.stats[a]}</span><small>{sign(abilityMod(preview.stats[a]))} modifier</small></label>)}</div>
            <label className="creator-label">Background<input value={choices.background} maxLength={60} onChange={e=>patch({background:e.target.value})}/></label><p className="creator-copy">Build a custom origin with your DM: two skills, one origin feat, and +2/+1 or three +1 ability increases.</p>
            <div className="creator-boosts">{CREATOR_ABILITIES.map(a=><label key={a}>{a}<select aria-label={`${a} background increase`} value={choices.boosts[a]??0} onChange={e=>patch({boosts:{...choices.boosts,[a]:Number(e.target.value)}})}>{[0,1,2].map(n=><option key={n} value={n}>+{n}</option>)}</select></label>)}</div>
            <label className="creator-label">Origin feat<select value={choices.originFeat} onChange={e=>patch({originFeat:e.target.value,extraSkills:[]})}>{ORIGIN_FEATS.map(n=><option key={n}>{n}</option>)}</select></label>
            {choices.species==='Human'&&<label className="creator-label">Human bonus origin feat<select value={choices.humanFeat} onChange={e=>patch({humanFeat:e.target.value,extraSkills:[]})}>{ORIGIN_FEATS.map(n=><option key={n}>{n}</option>)}</select></label>}
          </>}
          {step===2&&<><p className="creator-eyebrow">03 / Equipment & skills</p><h3>Ready for the road</h3><p className="creator-copy">Pick a starter loadout, then choose what you do best. Your weapons use your live ability scores as you level.</p>
            <fieldset className="creator-fieldset"><legend>Starting loadout</legend><p className="creator-copy">Curated starter kits — your DM can adjust equipment on the sheet.</p><div className="creator-loadouts">{STARTER_KITS[choices.className].map(k=><button key={k.id} aria-pressed={choices.kitId===k.id} onClick={()=>patch({kitId:k.id})}><strong>{k.name}</strong><span>{k.description}</span></button>)}</div></fieldset>
            {skillsGroup('Background skills',SKILLS.map(s=>s.name),choices.backgroundSkills,2,backgroundSkills=>patch({backgroundSkills,skills:choices.skills.filter(s=>!backgroundSkills.includes(s)),extraSkills:[],features:{...choices.features,expertise:[]}}))}
            {skillsGroup(`${cls.title} skills`,cls.skills.filter(s=>!choices.backgroundSkills.includes(s)),choices.skills,cls.skillCount,skills=>patch({skills,extraSkills:choices.extraSkills.filter(s=>!skills.includes(s)),features:{...choices.features,expertise:[]}}))}
            {extraCount>0&&skillsGroup('Additional skills',SKILLS.map(s=>s.name).filter(s=>![...choices.backgroundSkills,...choices.skills].includes(s)),choices.extraSkills,extraCount,extraSkills=>patch({extraSkills}))}
            {(catalog?.choices[choices.className]??[]).filter(f=>f.key!=='orderCantrip'&&(!f.when||choices.features[f.when.key]?.includes(f.when.option))).map(f=><div key={f.key}>{skillsGroup(f.label,f.key==='expertise'?[...choices.backgroundSkills,...choices.skills,...choices.extraSkills]:f.options.map(o=>o.name),choices.features[f.key]??[],f.count,names=>patch({features:{...choices.features,[f.key]:names}}))}<p className="creator-copy">{f.options.filter(o=>choices.features[f.key]?.includes(o.name)).map(o=>o.description).join(' ')}</p></div>)}
            <p className="creator-copy">Saving-throw proficiencies: {cls.saves.join(' & ')}.</p>
          </>}
          {step===3&&<><p className="creator-eyebrow">04 / Spells</p><h3>{spellCount?'Choose your first magic':'Your power is in your training'}</h3><p className="creator-copy">{spellCount?'Suggested spells are selected. Swap any to make them yours. Your class spell slots will be ready to use.':'This class has no spellcasting at level one. Your class abilities will be ready on your sheet.'}</p>
            {spellCount>0&&<label className="creator-label">Search spells<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Name or effect…"/></label>}
            {[{level:0,label:'Cantrips',count:preview.progression.cantrips+bonusCantrip,selected:choices.cantrips},{level:1,label:choices.className==='wizard'?'Spellbook spells':'First-level spells',count:spellCount,selected:choices.spells}].filter(g=>g.count>0).map(g=><fieldset className="creator-fieldset" key={g.level}><legend>{g.label} <span>{g.selected.length} / {g.count}</span></legend><div className="creator-spells">{catalog?.spells.filter(s=>s.classes?.includes(choices.className)&&s.level===g.level&&`${s.name} ${s.description}`.toLowerCase().includes(search.toLowerCase())).map(s=><button key={s.name} aria-pressed={g.selected.includes(s.name)} disabled={!g.selected.includes(s.name)&&g.selected.length>=g.count} onClick={()=>{const names=selectMany(g.selected,s.name,g.count);patch(g.level===0?{cantrips:names}:{spells:names,prepared:choices.className==='wizard'?names.slice(0,preview.progression.preparedSpells):names});}}><strong>{s.name}</strong><small>{s.school} · {s.meta}</small><span>{s.description}</span></button>)}</div></fieldset>)}
            {choices.className==='wizard'&&skillsGroup('Prepared today',choices.spells,choices.prepared,preview.progression.preparedSpells,prepared=>patch({prepared}))}
            {choices.className==='ranger'&&<p className="creator-note">Hunter’s Mark is added as an always-prepared spell.</p>}
          </>}
          {step===4&&<><p className="creator-eyebrow">05 / Ready to play</p><h3>{choices.name}, your story begins</h3><p className="creator-copy">Review your level-one sheet. Creating it selects this character for you; place your token when you are ready.</p>
            <div className="creator-vitals"><div><strong>{preview.hp}</strong><span>Hit points</span></div><div><strong>{preview.ac}</strong><span>Armor class</span></div><div><strong>+2</strong><span>Proficiency</span></div></div>
            <dl className="creator-review"><dt>Identity</dt><dd>{choices.species} {cls.title} · {choices.background}</dd><dt>Weapons</dt><dd>{preview.kit.weapons.join(', ')}</dd><dt>Skills</dt><dd>{[...choices.backgroundSkills,...choices.skills,...choices.extraSkills].join(', ')}</dd><dt>Origin feats</dt><dd>{[choices.originFeat,...(choices.species==='Human'?[choices.humanFeat]:[])].join(', ')}</dd><dt>Features</dt><dd>{preview.progression.features.join(', ')}{Object.values(choices.features).flat().length>0&&` · ${Object.values(choices.features).flat().join(', ')}`}</dd><dt>Magic</dt><dd>{[...choices.cantrips,...choices.spells,...(choices.className==='ranger'?["Hunter's Mark"]:[])].join(', ')||'No spells at this level'}</dd></dl>
            <p className="creator-note">Species traits are included. Choose any ancestry or lineage details with your DM on the character sheet. Level-ups use the existing 2024 guide.</p>
          </>}
        </div>
        <aside className="creator-preview" aria-label="Character preview" style={{'--class-color':cls.color} as CSSProperties}><div className="creator-emblem" aria-hidden="true">{cls.symbol}</div><p className="creator-eyebrow">Your hero</p><h3>{choices.name.trim()||'An unwritten legend'}</h3><p>{choices.species} {cls.title}</p><span className="creator-level">LEVEL ONE</span><div className="creator-vitals"><div><strong>{preview.hp}</strong><span>Hit points</span></div><div><strong>{preview.ac}</strong><span>Armor class</span></div><div><strong>+2</strong><span>Proficiency</span></div></div><div className="creator-mini-stats">{CREATOR_ABILITIES.map(a=><div key={a}><small>{a}</small><strong>{preview.stats[a]}</strong></div>)}</div><p className="creator-preview-story">{cls.summary}</p><small>Hit die: d{preview.hitDie} · Speed: 30 ft</small></aside>
      </div>
      <footer className="creator-footer"><div aria-live="polite">{error?<p className="creator-error" role="alert">{error}</p>:<span>{loading?'Loading character options…':'Your draft stays here if you close this window.'}</span>}</div><div><button className="btn" disabled={busy} onClick={()=>step?go(step-1):setOpen(false)}>{step?'Back':'Close'}</button>{step<4?<button className="btn creator-next" disabled={busy||loading||!catalog} onClick={()=>go(step+1)}>Next →</button>:<button className="btn creator-next" disabled={busy||status!=='connected'} onClick={finish}>{busy?'Creating…':'Create & play'}</button>}</div></footer>
    </dialog>,document.body)}
  </>;
}
