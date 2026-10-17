import {useEffect,useState} from 'react';
import {formatCharacterHeight,SPECIES_HEIGHTS,validCharacterHeight} from '../../../shared/characterHeight';
import './character-height.css';
export function CharacterHeightControl({value,species,onChange,disabled=false}:{value:number;species:string;onChange:(inches:number)=>void;disabled?:boolean}){
  const [feet,setFeet]=useState(String(Math.floor(value/12))),[inches,setInches]=useState(String(value%12));
  useEffect(()=>{setFeet(String(Math.floor(value/12)));setInches(String(value%12));},[value]);
  const edit=(f:string,i:string)=>{setFeet(f);setInches(i);if(f===''||i==='')return;const total=Number(f)*12+Number(i);if(Number.isInteger(Number(f))&&Number.isInteger(Number(i))&&Number(i)>=0&&Number(i)<12&&validCharacterHeight(total))onChange(total);};
  const restore=()=>{setFeet(String(Math.floor(value/12)));setInches(String(value%12));};
  return <fieldset className="character-height-control" disabled={disabled}><legend>Character height</legend><div>
    <button type="button" className="btn" aria-label="Decrease height by one inch" disabled={value<=6} onClick={()=>onChange(value-1)}>↓</button>
    <label>Feet<input type="number" inputMode="numeric" min={0} max={20} step={1} aria-label="Height feet" value={feet} onChange={e=>edit(e.target.value,inches)} onBlur={restore}/></label>
    <label>Inches<input type="number" inputMode="numeric" min={0} max={11} step={1} aria-label="Height inches" value={inches} onChange={e=>edit(feet,e.target.value)} onBlur={restore}/></label>
    <button type="button" className="btn" aria-label="Increase height by one inch" disabled={value>=240} onClick={()=>onChange(value+1)}>↑</button>
  </div><small>{SPECIES_HEIGHTS[species]?.hint??'Choose your character’s height'}. Suggested only; you can choose another height.</small><small>{formatCharacterHeight(value)} · Used for appearance and model fitting. Combat space stays unchanged.</small></fieldset>;
}
