import {useEffect,useState,type ReactNode} from 'react';
import {useEnvironmentQuality,readStandardGraphicsQuality} from '../lib/useEnvironmentQuality';
import {ServerRenderingControl} from './ServerRenderingControl';

/** Available before joining, before any optional scene can start loading. */
export function LegacyModeControl(){
 const {quality,setQuality}=useEnvironmentQuality();
 return <><label className="legacy-mode-control"><input type="checkbox" checked={quality==='legacy'} onChange={e=>setQuality(e.target.checked?'legacy':readStandardGraphicsQuality())}/>Legacy mode <small>For older CPUs and integrated graphics. Only changes this browser.</small></label><ServerRenderingControl/></>;
}
export function RenderingModeClass(){
 const {budget}=useEnvironmentQuality();
 useEffect(()=>{document.documentElement.dataset.renderMode=budget.legacy?'legacy':'standard';},[budget.legacy]);
 return null;
}

export const RENDERING_STARTUP_KEY='dnd.rendering-started';
export function RenderingStartupGate({children}:{children:ReactNode}){
 const {quality,setQuality}=useEnvironmentQuality();
 const [ready,setReady]=useState(()=>{try{return sessionStorage.getItem(RENDERING_STARTUP_KEY)==='1';}catch{return false;}});
 const start=(legacy:boolean)=>{
   setQuality(legacy?'legacy':quality==='legacy'?readStandardGraphicsQuality():quality);
   try{sessionStorage.setItem(RENDERING_STARTUP_KEY,'1');}catch{}
   setReady(true);
 };
 if(ready)return <>{children}</>;
 return <main className="rendering-startup" aria-label="Choose rendering mode">
   <h1>Choose how to run this browser</h1>
   <p>Choose before loading a campaign. DMs and players can use different modes at the same table.</p>
   <ServerRenderingControl/>
   <div className="rendering-startup-options">
     <section><h2>Legacy mode</h2><p>For older CPUs and integrated graphics. Flat tokens, lightweight maps and static dice results. Movement and basic visibility animate together with server assistance.</p>
       <p>Includes wall and light editing, fog, targeting and all game rules.</p>
       <button className="btn big" onClick={()=>start(true)}>Start in legacy mode</button>
     </section>
     <section><h2>3D / standard mode</h2><p>3D figures, detailed lighting, animated effects and dice. Graphics quality can be adjusted for this computer.</p>
       <p>Existing token and graphics preferences are retained.</p>
       <button className="btn big" onClick={()=>start(false)}>Start in 3D mode</button>
     </section>
   </div>
   <small>Saved preference: {quality==='legacy'?'Legacy':'3D / standard'}. You can change modes from the map toolbar or graphics settings.</small>
 </main>;
}
