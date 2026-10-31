import {useDmUiScale} from '../lib/useDmUiScale';
import {EnvironmentQualityControl} from './MapEnvironmentControls';
import {DiceRenderingControl} from './DiceRenderingControl';
import {HardwareBenchmarkPanel} from './LegacyModeControl';
import {TokenAppearanceControl} from './TokenAppearanceControl';
import {ServerRenderingAdvice,ServerRenderingOwnerControls} from './ServerRenderingControl';
export function DmInterfaceControls(){
 const {scale,setScale}=useDmUiScale();
 return <section aria-label="DM interface settings"><h4>Interface</h4>
  <label className="settings-field" htmlFor="dm-ui-scale">UI scale <output>{Math.round(scale*100)}%</output>
   <input id="dm-ui-scale" type="range" min={70} max={140} step={5} value={Math.round(scale*100)} onChange={e=>setScale(Number(e.target.value)/100)} />
  </label>
  <button className="btn tiny" onClick={()=>setScale(1)}>Reset UI scale</button>
  <p className="muted">Sizes DM panels and controls in this browser. Map zoom and token sizes stay the same.</p>
  <h4>Graphics</h4>
  <EnvironmentQualityControl/>
  <TokenAppearanceControl/>
  <DiceRenderingControl/>
  <ServerRenderingAdvice/>
  <ServerRenderingOwnerControls/>
  <HardwareBenchmarkPanel compact/>
 </section>;
}
