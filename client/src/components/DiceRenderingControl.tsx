import {useDiceRendering,type DiceRenderingPreference} from '../lib/useDiceRendering';

export function DiceRenderingControl(){
 const {preference,mode,setPreference}=useDiceRendering();
 return <label className="dice-rendering-control">Dice
  <select className="btn tiny" aria-label="Dice rendering" value={preference} onChange={e=>setPreference(e.target.value as DiceRenderingPreference)}>
   <option value="auto">Automatic (3D with 2D fallback)</option>
   <option value="3d">3D dice</option><option value="2d">2D dice animations</option>
  </select>
  {mode==='2d'&&preference!=='2d'&&<small>Using 2D dice because 3D graphics are unavailable.</small>}
 </label>;
}
