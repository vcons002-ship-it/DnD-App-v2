import {useEffect} from 'react';
import {useStore} from '../state/socket';
import {useServerRendering,setServerRendering} from '../lib/useServerRendering';
import type {RenderingOverride} from '../../../shared/serverRendering';
export function ServerRenderingControl(){
 const preference=useServerRendering(),snapshot=useStore(s=>s.snapshot),socket=useStore(s=>s.socket),socketId=socket?.id;
 const state=snapshot?.serverRendering;
 useEffect(()=>{if(socketId)socket?.emit('client:serverRendering',preference);},[preference,socketId,socket]);
 return <label className="server-rendering-control"><input type="checkbox" aria-label="Server managed rendering" checked={state?.forcedBy?state.enabled:preference} disabled={!!state?.forcedBy} onChange={e=>setServerRendering(e.target.checked)}/>Server managed rendering
   <small>{state?.forcedBy?`Owner has forced this ${state.enabled?'on':'off'} for ${state.forcedBy==='board'?'this board':'this player'}.`:'Uses the server for visibility, movement previews and cached token artwork. Saved for this browser; available in every graphics mode.'}</small>
 </label>;
}
export function ServerRenderingOwnerControls(){
 const snapshot=useStore(s=>s.snapshot),socket=useStore(s=>s.socket);
 if(snapshot?.role!=='dm'||!snapshot.map||!snapshot.serverRendering)return null;
 const state=snapshot.serverRendering;
 const options=<><option value="inherit">Player choice (default on)</option><option value="on">Force on</option><option value="off">Force off</option></>;
 return <details className="server-rendering-owner"><summary>Server rendering controls</summary><div className="server-rendering-owner-panel">
  <p>Owner settings are saved with this campaign. A forced board setting takes precedence over player overrides. Player status reflects the active board.</p>
  <label>This board <select aria-label="Board server rendering" value={state.board} onChange={e=>socket?.emit('rendering:policy',{mapId:snapshot.map!.id,value:e.target.value as RenderingOverride})}>{options}</select></label>
  {state.players?.map(p=><label key={p.id}>{p.name} <select aria-label={`Server rendering for ${p.name}`} value={p.override} onChange={e=>socket?.emit('rendering:policy',{playerId:p.id,value:e.target.value as RenderingOverride})}>{options}</select><small>{p.enabled?'Server managed':'Local rendering'}{p.boardForced?' · board override active':''}</small></label>)}
  {!state.players?.length&&<small>Connected players appear here after joining.</small>}
 </div></details>;
}
