import {useEffect,useState} from 'react';

/** Sliders stage locally, then send one authoritative update on release/keyboard commit. */
export function SettingSlider({label,value,min,max,step=1,suffix='',onCommit}:{label:string;value:number;min:number;max:number;step?:number;suffix?:string;onCommit:(value:number)=>void}){
  const [draft,setDraft]=useState(value);
  useEffect(()=>setDraft(value),[value]);
  const commit=()=>{if(draft!==value)onCommit(draft);};
  return <label className="environment-slider"><span>{label}<output>{Number(draft.toFixed(2))}{suffix}</output></span>
    <input aria-label={label} type="range" min={min} max={max} step={step} value={draft} onChange={e=>setDraft(Number(e.target.value))}
      onPointerUp={commit} onKeyUp={commit} onBlur={commit}/>
  </label>;
}

