import React, {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {MiniatureLayer,type MiniatureLayerHandle,type MiniatureToken} from '../canvas/MiniatureLayer';
import type {EnvironmentPreviewSettings} from '../canvas/battlefieldEnvironment';
import {MINIATURES} from '../lib/miniatures';
import {groundYScale,projectGround,unprojectGround,screenToMap,type BattlefieldView} from '../canvas/miniatureProjection';
import {facingAfterMove} from '../../../shared/tokenFacing';
import {DEFAULT_MAP_ENVIRONMENT} from '../../../shared/mapEnvironment';
import {MAP_ENVIRONMENT_PRESETS,environmentPresetPatch,matchingEnvironmentPreset} from '../../../shared/mapEnvironmentPresets';
import {PlayerVisionOverlay,type PlayerVisionHandle} from '../canvas/PlayerVisionOverlay';
import {visionContains,visionLit,type PlayerVision,type VisionLight} from '../../../shared/playerVision';
import './preview.css';

const varietyStudy=new URLSearchParams(location.search).has('variety');
const stormStudy=new URLSearchParams(location.search).has('storm');
const visionStudy=new URLSearchParams(location.search).has('vision');
const dungeonStudy=visionStudy||new URLSearchParams(location.search).has('dungeon');
const mapWidth=dungeonStudy?1402:1216,mapHeight=dungeonStudy?1122:832;
const pixelsPerFoot=dungeonStudy?5:64/5;
const torchStudy=dungeonStudy||new URLSearchParams(location.search).has('torches');
const atmosphereStudy=varietyStudy||stormStudy||torchStudy||new URLSearchParams(location.search).has('atmosphere');
const testLights:NonNullable<EnvironmentPreviewSettings['lights']>=[
  {id:'brazier-west',x:480,y:520,radiusFt:17,heightFt:5,color:'warm',intensity:1,flicker:true,visibleTorch:true},
  {id:'lantern-east',x:750,y:485,radiusFt:16,heightFt:6,color:'warm',intensity:1,flicker:true,visibleTorch:true},
  {id:'arcane-north',x:610,y:285,radiusFt:12,heightFt:4,color:'cool',intensity:.9,flicker:false,visibleTorch:true},
];
const dungeonLights:NonNullable<EnvironmentPreviewSettings['lights']>=[
  {id:'store-lantern',x:430,y:370,radiusFt:13,heightFt:.55,color:'warm',intensity:.8,flicker:true,visibleTorch:true,fixture:'lantern'},
  {id:'hall-lantern',x:820,y:490,radiusFt:14,heightFt:.55,color:'warm',intensity:.85,flicker:true,visibleTorch:true,fixture:'lantern'},
  {id:'stair-lantern',x:905,y:775,radiusFt:12,heightFt:.55,color:'warm',intensity:.8,flicker:true,visibleTorch:true,fixture:'lantern'},
];
const sceneLights=dungeonStudy?dungeonLights:testLights;
const manyLights=Array.from({length:12},(_,i)=>({id:`torch-${i}`,x:320+(i%4)*180,y:200+Math.floor(i/4)*210,radiusFt:12,heightFt:5,color:'warm' as const,intensity:.85,flicker:true,visibleTorch:true}));
const asset=(url:string)=>new URL('.'+url,location.href).href;
const miniature=(id:string)=>{
  const source=MINIATURES[id];
  return {...source,url:asset(source.url),baseTextureUrl:source.baseTextureUrl?asset(source.baseTextureUrl):undefined,fxUrl:source.fxUrl?asset(source.fxUrl):undefined};
};
const courtyardTokens:MiniatureToken[]=[
  {id:'druk',x:470,y:460,diameter:61,hidden:false,facing:Math.PI*.92,outline:'#70ae77',definition:miniature('druk')},
  {id:'varis',x:580,y:495,diameter:54,hidden:false,facing:Math.PI,outline:'#70ae77',definition:miniature('varis')},
  {id:'vanec',x:720,y:450,diameter:53,hidden:false,facing:Math.PI*1.13,outline:'#70ae77',definition:miniature('vanec')},
  {id:'fanatic',x:630,y:350,diameter:48,hidden:false,facing:0,outline:'#c96654',definition:miniature('cultist-fanatic')},
  {id:'goblin-a',x:425,y:390,diameter:42,hidden:false,facing:.3,outline:'#c96654',definition:miniature('goblin')},
  {id:'goblin-b',x:585,y:285,diameter:42,hidden:false,facing:-.2,outline:'#c96654',definition:miniature('goblin-helmet')},
  {id:'wolf',x:810,y:386,diameter:43,hidden:false,facing:Math.PI*.3,outline:'#c96654',definition:miniature('wolf')},
];
const dungeonPositions=[{x:520,y:530},{x:465,y:530},{x:410,y:530},(visionStudy?{x:850,y:490}:{x:740,y:700}),{x:470,y:315},{x:1180,y:710},{x:1100,y:285}];
const originalTokens=dungeonStudy?courtyardTokens.map((token,i)=>({...token,...dungeonPositions[i],diameter:token.diameter*5/12.8,facing:Math.PI/2,carriedLantern:i<3})):courtyardTokens;
type Camera={tilt:number;rotation:number;view:BattlefieldView};
const presetSettings=(id:string)=>{const {mistHeightFt,...settings}=environmentPresetPatch(id)!;return {...settings,mistHeight:(mistHeightFt??2)*pixelsPerFoot};};
const initialSettings:EnvironmentPreviewSettings={
  enabled:true,mapUrl:new URL(dungeonStudy?'./dungeon.png':'./courtyard.png',location.href).href,mapWidth,mapHeight,
  shadows:true,mist:true,scenery:!atmosphereStudy,shadowDirectionDegrees:55,shadowLength:1.05,shadowOpacity:.8,mistOpacity:visionStudy?.22:dungeonStudy?.08:torchStudy?.7:atmosphereStudy?.22:.5,
  pixelsPerFoot,lighting:dungeonStudy?'dungeon':torchStudy?'night':'day',lightLevel:1,heavyDarkness:false,weather:'none',weatherIntensity:.75,windDirectionDegrees:20,windStrength:dungeonStudy?.15:.4,lights:torchStudy?sceneLights:[],
  mistCoverage:'map',mistHeight:(dungeonStudy?1.5:torchStudy?10:2)*pixelsPerFoot,mistShadows:true,mistQuality:'auto',mistInteraction:true,
  props:[{type:'pillar',x:392,y:432,size:42,height:95},{type:'pillar',x:775,y:492,size:45,height:115},{type:'rock',x:840,y:430,size:48,height:27},{type:'rock',x:867,y:443,size:24,height:15}],
  mistPatches:[{x:610,y:285,width:145,depth:235,height:25},{x:676,y:442,width:290,depth:105,height:26}],
  ...((stormStudy||varietyStudy)?presetSettings('clear-day'):{}),
};

function Preview(){
  const stage=useRef<HTMLDivElement>(null),layer=useRef<MiniatureLayerHandle>(null);
  const [size,setSize]=useState({width:1000,height:680});
  const [settings,setSettings]=useState(initialSettings);
  const [tokens,setTokens]=useState(originalTokens);
  const tokenSnapshot=useRef(tokens);tokenSnapshot.current=tokens;
  const [ready,setReady]=useState(0);
  const [viewer,setViewer]=useState('druk');
  const [touchRotate,setTouchRotate]=useState(false);
  const [walking,setWalking]=useState(false);
  const visionLayer=useRef<PlayerVisionHandle>(null);
  const livePositions=useRef(new Map<string,{x:number;y:number}>());
  const visionState=useRef<PlayerVision|undefined>(undefined);
  const lastLights=useRef(0);
  const [,refreshVision]=useState(0);
  const personalVision=visionStudy&&viewer!=='dm'&&settings.enabled&&(settings.lighting==='dungeon'||settings.lighting==='night');
  const vision:PlayerVision|undefined=personalVision?{rangeFt:60,radius:60*pixelsPerFoot,heavy:!!settings.heavyDarkness,
    origins:tokens.filter(t=>t.id===viewer).map(t=>({...t,...livePositions.current.get(t.id)})),
    lights:[...(settings.lights??[]).map(l=>({id:l.id,x:l.x,y:l.y,radius:l.radiusFt*pixelsPerFoot,height:l.heightFt*pixelsPerFoot,strength:l.intensity})),
      ...tokens.filter(t=>t.carriedLantern).map(t=>({...t,...livePositions.current.get(t.id),radius:20*pixelsPerFoot,height:2.8*pixelsPerFoot,strength:.85}))]}:undefined;
  visionState.current=vision;
  const visibleAt=useCallback((_id:string,x:number,y:number)=>visionContains(visionState.current,x,y),[]);
  const onVisionLights=useCallback((lights:VisionLight[])=>{
    const now=performance.now();if(now-lastLights.current<100)return;lastLights.current=now;
    visionLayer.current?.lights(lights);
  },[]);
  const [camera,setCamera]=useState<Camera>({tilt:45,rotation:0,view:{x:0,y:0,scale:1}});
  const current=useRef(camera);
  const animation=useRef(0),orbitFrame=useRef(0),movingFrame=useRef(0);
  const [orbit,setOrbit]=useState(false),[calibrating,setCalibrating]=useState(false);
  const [guide,setGuide]=useState<{x1:number;y1:number;x2:number;y2:number}|null>(null);
  const [notice,setNotice]=useState('Drag to pan · right-drag to rotate · scroll to zoom');
  const pointer=useRef<{id:number;x:number;y:number;camera:Camera;kind:'pan'|'rotate'|'shadow'}|null>(null);
  const onReady=useCallback((ids:ReadonlySet<string>)=>setReady(ids.size),[]);
  const fitted=useCallback((tilt=45,rotation=0,close=false):Camera=>{
    let scale=Math.min(size.width/(mapWidth*1.12),size.height/(mapHeight*groundYScale(tilt)*1.35))*(close?(dungeonStudy?2.8:2.05):1);
    if(!close){
      // Perspective enlarges the near corners: fit their projected positions.
      let low=0,high=scale;
      const padding=Math.min(size.width,size.height)*.045;
      for(let i=0;i<24;i++){
        const candidate=(low+high)/2;
        const fits=[[0,0],[mapWidth,0],[0,mapHeight],[mapWidth,mapHeight]].every(([x,y])=>{
          const p=projectGround(size.width/2+(x-mapWidth/2)*candidate,size.height/2+(y-mapHeight/2-9)*candidate*groundYScale(tilt),size.width,size.height,tilt,rotation);
          return p.x>=padding&&p.x<=size.width-padding&&p.y>=padding&&p.y<=size.height-padding;
        });
        if(fits)low=candidate;else high=candidate;
      }
      scale=low;
    }
    const party=tokenSnapshot.current.slice(0,3).map(t=>livePositions.current.get(t.id)??t);
    const center=close&&dungeonStudy?{x:party.reduce((n,t)=>n+t.x,0)/3,y:party.reduce((n,t)=>n+t.y,0)/3}:{x:mapWidth/2,y:mapHeight/2+9};
    return {tilt,rotation,view:{x:size.width/2-center.x*scale,y:size.height/2-center.y*scale*groundYScale(tilt),scale}};
  },[size]);
  useEffect(()=>{
    const observer=new ResizeObserver(entries=>{const box=entries[0].contentRect;setSize({width:Math.round(box.width),height:Math.round(box.height)});});
    observer.observe(stage.current!);return()=>observer.disconnect();
  },[]);
  useEffect(()=>{const next=fitted(45,0,visionStudy||size.width<600);setCamera(next);current.current=next;},[fitted,size.width]);
  const apply=useCallback((next:Camera)=>{current.current=next;layer.current?.setProjection(next.tilt,next.rotation,next.view);visionLayer.current?.camera({tilt:next.tilt,rotation:next.rotation,view:next.view});if(stage.current)stage.current.dataset.viewRotation=String(next.rotation);},[]);
  const stop=useCallback(()=>{cancelAnimationFrame(animation.current);cancelAnimationFrame(orbitFrame.current);setOrbit(false);},[]);
  const transition=useCallback((next:Camera)=>{
    stop();const from=current.current,start=performance.now();
    const tick=(now:number)=>{const t=Math.min(1,(now-start)/650),e=t*t*(3-2*t);
      apply({tilt:from.tilt+(next.tilt-from.tilt)*e,rotation:from.rotation+(next.rotation-from.rotation)*e,view:{x:from.view.x+(next.view.x-from.view.x)*e,y:from.view.y+(next.view.y-from.view.y)*e,scale:from.view.scale+(next.view.scale-from.view.scale)*e}});
      if(t<1)animation.current=requestAnimationFrame(tick);else setCamera(next);
    };animation.current=requestAnimationFrame(tick);
  },[apply,stop]);
  useEffect(()=>{
    if(!orbit)return;
    let last=performance.now();
    const tick=(now:number)=>{const dt=Math.min(.05,(now-last)/1000);last=now;
      apply({...current.current,rotation:current.current.rotation+dt*13});orbitFrame.current=requestAnimationFrame(tick);
    };orbitFrame.current=requestAnimationFrame(tick);
    return()=>cancelAnimationFrame(orbitFrame.current);
  },[orbit,apply]);
  useEffect(()=>()=>{cancelAnimationFrame(animation.current);cancelAnimationFrame(orbitFrame.current);cancelAnimationFrame(movingFrame.current);},[]);
  const local=(event:React.PointerEvent)=>{const r=stage.current!.getBoundingClientRect();return{x:event.clientX-r.left,y:event.clientY-r.top};};
  const ground=(x:number,y:number,c:Camera)=>{const p=unprojectGround(x,y,size.width,size.height,c.tilt,c.rotation);return screenToMap(p.x,p.y,c.view,c.tilt);};
  const down=(event:React.PointerEvent<HTMLDivElement>)=>{
    if(event.button!==0&&event.button!==2)return;stop();const p=local(event);
    pointer.current={id:event.pointerId,x:p.x,y:p.y,camera:current.current,kind:calibrating?'shadow':event.button===2||touchRotate?'rotate':'pan'};
    if(calibrating)setGuide({x1:p.x,y1:p.y,x2:p.x,y2:p.y});
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const move=(event:React.PointerEvent<HTMLDivElement>)=>{
    const drag=pointer.current;if(!drag||drag.id!==event.pointerId)return;const p=local(event),c=drag.camera;
    if(drag.kind==='shadow'){setGuide({x1:drag.x,y1:drag.y,x2:p.x,y2:p.y});return;}
    if(drag.kind==='rotate'){apply({...c,rotation:c.rotation+(p.x-drag.x)*.22});return;}
    const a=ground(drag.x,drag.y,c),b=ground(p.x,p.y,c);
    apply({...c,view:{...c.view,x:c.view.x+(b.x-a.x)*c.view.scale,y:c.view.y+(b.y-a.y)*c.view.scale*groundYScale(c.tilt)}});
  };
  const up=(event:React.PointerEvent<HTMLDivElement>)=>{
    const drag=pointer.current;if(!drag||drag.id!==event.pointerId)return;
    if(drag.kind==='shadow'){
      const p=local(event),a=ground(drag.x,drag.y,drag.camera),b=ground(p.x,p.y,drag.camera);
      if(Math.hypot(b.x-a.x,b.y-a.y)>5){const angle=(Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI+360)%360;
        setSettings(s=>({...s,enabled:true,shadows:true,shadowDirectionDegrees:angle}));setNotice(`Shadow direction matched: ${Math.round(angle)}° in map coordinates.`);
      }else setNotice('Drag a longer line along a painted shadow.');
      setCalibrating(false);setGuide(null);
    }
    pointer.current=null;setCamera({...current.current});
    if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const zoom=(factor:number)=>{const c=current.current,scale=Math.max(.15,Math.min(3,c.view.scale*factor));
    transition({...c,view:{scale,x:size.width/2-(size.width/2-c.view.x)*scale/c.view.scale,y:size.height/2-(size.height/2-c.view.y)*scale/c.view.scale}});
  };
  const change=<K extends keyof EnvironmentPreviewSettings>(key:K,value:EnvironmentPreviewSettings[K])=>{stop();setCamera({...current.current});setSettings(s=>({...s,[key]:value}));if(key==='shadowDirectionDegrees')setNotice('Shadow direction stays fixed to the map while the camera rotates.');};
  const moveDruk=()=>{
    cancelAnimationFrame(movingFrame.current);const token=tokens.find(t=>t.id==='druk')!;
    const destination=token.x>600?{x:470,y:460}:{x:690,y:420},start=performance.now();
    setNotice('Watch the mist part behind Druk, then drift back into his path.');
    const tick=(now:number)=>{const t=Math.min(1,(now-start)/4200),e=t*t*(3-2*t);
      layer.current?.moveToken(token.id,token.x+(destination.x-token.x)*e,token.y+(destination.y-token.y)*e,t===1);
      if(t<1)movingFrame.current=requestAnimationFrame(tick);
      else setTokens(list=>list.map(item=>item.id===token.id?{...item,...destination,facing:facingAfterMove(token.x,token.y,destination.x,destination.y,token.facing)}:item));
    };movingFrame.current=requestAnimationFrame(tick);
  };
  const moveParty=()=>{
    if(dungeonStudy){
      stop();cancelAnimationFrame(movingFrame.current);setWalking(true);
      const party=tokens.filter(t=>['druk','varis','vanec'].includes(t.id));
      const returning=party[0].x>850,start=performance.now(),travel=550;
      // Follow the L-shaped corridor, keeping every base on its floor.
      const point=(distance:number)=>distance<=380?{x:520+distance,y:530}:{x:900,y:530+distance-380};
      const cameraStart=current.current;let lastVisionRefresh=0;
      const tick=(now:number)=>{
        const t=Math.min(1,(now-start)/8500),e=t*t*(3-2*t),distance=travel*(returning?1-e:e);
        party.forEach((token,i)=>{const p=point(distance-i*55),heading=distance-i*55<380?(returning?-Math.PI/2:Math.PI/2):(returning?Math.PI:0);layer.current?.moveToken(token.id,p.x,p.y,t===1,heading);livePositions.current.set(token.id,p);visionLayer.current?.move(token.id,p.x,p.y);if(visionState.current){const o=visionState.current.origins.find(o=>o.id===token.id);if(o){o.x=p.x;o.y=p.y;}}});
        if(visionStudy&&now-lastVisionRefresh>100){lastVisionRefresh=now;refreshVision(v=>v+1);}
        const center=point(distance-55),scale=cameraStart.view.scale;
        apply({...cameraStart,view:{scale,x:size.width/2-center.x*scale,y:size.height*.57-center.y*scale*groundYScale(cameraStart.tilt)}});
        if(t<1)movingFrame.current=requestAnimationFrame(tick);
        else{setWalking(false);setCamera({...current.current});setTokens(list=>list.map(token=>{const i=party.findIndex(p=>p.id===token.id);if(i<0)return token;const p=point(distance-i*55);return {...token,...p,facing:returning?-Math.PI/2:0};}));}
      };
      setNotice('Hip lanterns follow the party through the dungeon. Light floor mist curls behind them.');
      movingFrame.current=requestAnimationFrame(tick);return;
    }
    cancelAnimationFrame(movingFrame.current);const start=performance.now(),party=tokens.filter(t=>['druk','varis','vanec'].includes(t.id));
    const destinations=party.map(t=>(stormStudy||varietyStudy)?{x:t.x+(party[0].x>600?-160:160),y:t.y+(party[0].x>600?55:-55)}:{x:t.x>650?t.x-230:t.x+230,y:t.y>440?t.y-70:t.y+70});
    setNotice('Hip lanterns move and turn with their owners as the party crosses the mist.');
    const tick=(now:number)=>{const t=Math.min(1,(now-start)/6400),e=t*t*(3-2*t);
      party.forEach((token,i)=>layer.current?.moveToken(token.id,token.x+(destinations[i].x-token.x)*e,token.y+(destinations[i].y-token.y)*e,t===1));
      if(t<1)movingFrame.current=requestAnimationFrame(tick);
      else setTokens(list=>list.map(token=>{const i=party.findIndex(p=>p.id===token.id);return i<0?token:{...token,...destinations[i],facing:facingAfterMove(token.x,token.y,destinations[i].x,destinations[i].y,token.facing)};}));
    };movingFrame.current=requestAnimationFrame(tick);
  };
  const settingsProps=useMemo(()=>({...settings,...(personalVision?{
    darkvisionTerrain:[{url:settings.mapUrl,x:0,y:0,w:mapWidth,h:mapHeight}],darkvisionGrid:{size:5*pixelsPerFoot,x:0,y:0},
  }:{})}),[settings,personalVision]);
  const renderedTokens=tokens.map(t=>({...t,outline:visionLit(vision,(livePositions.current.get(t.id)??t).x,(livePositions.current.get(t.id)??t).y)?t.outline:undefined}));
  return <div className="environment-app">
    <header><div><p className="eyebrow">BATTLEFIELD STUDY · 01</p><h1>{dungeonStudy?'The castle basement':varietyStudy?'Six new atmospheres':stormStudy?'Storm over the courtyard':'The ruined courtyard'}</h1><p className="subtitle">{varietyStudy?'Leaves, fireflies, ash, sand & snow':stormStudy?'Rain, wet stone & cloud lightning':dungeonStudy?'Hip lanterns, light floor mist & dungeon darkness':atmosphereStudy?'Weather, changing light & drifting mist':'Matched shadows, drifting mist & raised stone'}</p></div><span className="study-badge">Interactive test</span></header>
    {visionStudy&&<section className="vision-controls" aria-label="Darkvision controls">
      <label>View as <select aria-label="View as" value={viewer} onChange={e=>setViewer(e.target.value)}><option value="druk">Druk</option><option value="varis">Varis</option><option value="vanec">Vanec</option><option value="dm">DM - full map</option></select></label>
      <button aria-pressed={!settings.heavyDarkness} onClick={()=>setSettings(s=>({...s,enabled:true,lighting:'dungeon',heavyDarkness:false}))}>Regular darkness</button>
      <button aria-pressed={!!settings.heavyDarkness} onClick={()=>setSettings(s=>({...s,enabled:true,lighting:'dungeon',heavyDarkness:true}))}>Heavy darkness</button>
      <button onClick={()=>setTokens(list=>list.map(t=>({...t,carriedLantern:false})))}>Lanterns off</button>
      <button onClick={()=>setTokens(list=>list.map(t=>({...t,carriedLantern:['druk','varis','vanec'].includes(t.id)})))}>Lanterns on</button>
      <button aria-pressed={!!settings.lights?.length} onClick={()=>change('lights',settings.lights?.length?[]:sceneLights)}>Placed lights</button>
      <button onClick={moveParty} disabled={ready<7||walking}>{walking?'Party moving...':'Move party'}</button>
      <button onClick={()=>{setSettings(s=>({...s,enabled:true,mist:true,mistOpacity:.5,mistHeight:3*pixelsPerFoot,mistInteraction:true,mistQuality:'auto',mistCoverage:'map'}));transition(fitted(current.current.tilt,current.current.rotation,true));}}>Mist movement test</button>
      <p>Darkvision: 60 ft. The enemy by the hall lantern is beyond it. Toggle Placed lights to compare. Changes stay in this preview.</p>
    </section>}
    <nav className="camera-bar" aria-label="Camera controls">
      <button aria-label="45° view" onClick={()=>transition(fitted(45,current.current.rotation,true))}>45° view</button>
      <button aria-label="Overhead view" onClick={()=>transition(fitted(0,current.current.rotation,true))}>Overhead</button>
      <button aria-label="Rotate view" aria-pressed={orbit} onClick={()=>{if(orbit){stop();setCamera({...current.current});}else{cancelAnimationFrame(animation.current);setOrbit(true);}}}>{orbit?'Stop rotation':'Rotate'}</button>
      <button aria-label="Close-up" onClick={()=>transition(fitted(current.current.tilt,current.current.rotation,true))}>Close-up</button>
      <button aria-label="Reset view" onClick={()=>transition(fitted())}>Full map</button>
      <button aria-label="Zoom in" onClick={()=>zoom(1.2)}>+</button><button aria-label="Zoom out" onClick={()=>zoom(1/1.2)}>−</button>
      {dungeonStudy&&<button onClick={()=>{const party=tokens.slice(0,3),x=party.reduce((n,t)=>n+t.x,0)/3,y=party.reduce((n,t)=>n+t.y,0)/3,scale=3;transition({tilt:45,rotation:0,view:{scale,x:size.width/2-x*scale,y:size.height*.57-y*scale*groundYScale(45)}});}}>Party view</button>}
      {dungeonStudy&&!visionStudy&&<button aria-pressed={!!settings.heavyDarkness} onClick={()=>change('heavyDarkness',!settings.heavyDarkness)}>Heavy darkness</button>}
      {!visionStudy&&(torchStudy||stormStudy||varietyStudy)&&<>
        <button onClick={()=>transition(fitted(45,dungeonStudy?0:180,true))}>Front view</button>
        <button onClick={()=>{const t=tokens.find(t=>t.id==='druk')!,scale=dungeonStudy?6:2.6;transition({tilt:45,rotation:180,view:{scale,x:size.width/2-t.x*scale,y:size.height*.62-t.y*scale*groundYScale(45)}});}}>Lantern close-up</button>
        <button onClick={moveParty} disabled={ready<7}>Move party</button>
        <button onClick={()=>change('lights',[])}>Lanterns only</button>
        <button onClick={()=>change('lights',sceneLights)}>{dungeonStudy?'Three lanterns':'Three torches'}</button>
        {!dungeonStudy&&<button onClick={()=>change('lights',manyLights)}>Twelve torches</button>}
      </>}
      {visionStudy&&<button aria-pressed={touchRotate} onClick={()=>setTouchRotate(v=>!v)}>{touchRotate?'Drag: rotate':'Drag: pan'}</button>}
      {!dungeonStudy&&<button onClick={moveDruk} disabled={ready<7}>Move Druk</button>}
      {atmosphereStudy&&!torchStudy&&!stormStudy&&!varietyStudy&&(['Day','Dusk','Rain','Snow','Night','Dungeon'] as const).map(preset=><button key={preset} onClick={()=>{
        setSettings(s=>({...s,enabled:true,scenery:false,lighting:preset==='Rain'?'dusk':preset==='Snow'?'day':preset.toLowerCase() as 'day'|'dusk'|'night'|'dungeon',
          weather:preset==='Rain'?'rain':preset==='Snow'?'snow':'none',lights:preset==='Night'||preset==='Dungeon'?testLights:[],mistOpacity:.22}));
      }}>{preset}</button>)}
    </nav>
    <div className="workspace">
      <div className={'stage'+(calibrating?' calibrating':'')} ref={stage} data-testid="environment-stage" onContextMenu={e=>e.preventDefault()}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={()=>{pointer.current=null;setGuide(null);setCamera({...current.current});}}
        onWheel={e=>{e.preventDefault();zoom(e.deltaY<0?1.07:1/1.07);}}>
        <MiniatureLayer ref={layer} tokens={renderedTokens} isVisibleAt={visibleAt} onVisionLights={onVisionLights} view={current.current.view} tiltDegrees={current.current.tilt} rotationDegrees={current.current.rotation} width={size.width} height={size.height} onReady={onReady} environmentPreview={settingsProps}/>
        {vision&&<PlayerVisionOverlay ref={visionLayer} vision={vision} view={current.current.view} tilt={current.current.tilt} rotation={current.current.rotation} width={size.width} height={size.height}/>}
        {ready<7&&<div className="loading">Loading original miniatures · {ready}/7<span>First load downloads the full models. Keep this page open while they load.</span></div>}
        {guide&&<svg className="shadow-guide" aria-hidden="true"><defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8" fill="#ffe3a0"/></marker></defs><line x1={guide.x1} y1={guide.y1} x2={guide.x2} y2={guide.y2} stroke="#ffe3a0" strokeWidth="3" markerEnd="url(#arrow)"/></svg>}
        <div className="stage-note">{calibrating?'Drag from an object toward the tip of its painted shadow.':notice}</div>
      </div>
      <aside aria-label="Environment controls">
        <h2>Environment</h2>
        <label className="quality">Preset <select aria-label="Environment preset" value={matchingEnvironmentPreset({...DEFAULT_MAP_ENVIRONMENT,...settings,mistHeightFt:(settings.mistHeight??2*pixelsPerFoot)/pixelsPerFoot})} onChange={e=>{stop();setCamera({...current.current});setSettings(s=>({...s,...presetSettings(e.target.value)}));}}>
          <option value="" disabled>Custom settings</option>{MAP_ENVIRONMENT_PRESETS.map(p=><option key={p.id} value={p.id}>{p.label}</option>)}
        </select></label>
        <p className="help">Presets keep your placed lights, shadow direction and wind direction.</p>
        {(torchStudy||stormStudy||varietyStudy)&&<>
          <h3>Hip lanterns</h3>
          {['druk','varis','vanec'].map(id=><label className="switch" key={id}><input type="checkbox" checked={!!tokens.find(t=>t.id===id)?.carriedLantern} onChange={e=>setTokens(list=>list.map(t=>t.id===id?{...t,carriedLantern:e.target.checked}:t))}/>{id[0].toUpperCase()+id.slice(1)} lantern</label>)}
          <label className="switch"><input type="checkbox" checked={!!settings.lights?.some(l=>l.visibleTorch)} onChange={e=>change('lights',settings.lights?.map(l=>({...l,visibleTorch:e.target.checked})))}/>{dungeonStudy?'Visible placed lanterns':'Visible placed torches'}</label>
          <p className="help">{(stormStudy||varietyStudy)?'Carried lanterns keep their warmth through changing weather and atmosphere.':dungeonStudy?"Light floor mist, 1.5 feet high. Three floor lanterns and the party's hip lanterns illuminate the dungeon.":'Night with 10 ft mist at maximum strength. Small lanterns hang at the hip and illuminate nearby figures and mist.'}</p>
        </>}

        <label className="switch master"><input type="checkbox" checked={settings.enabled} onChange={e=>change('enabled',e.target.checked)}/>Show effects</label>
        <p className="help">Switch off to compare with the original lighting.</p>
        {atmosphereStudy&&<>
          <label className="quality">Lighting <select aria-label="Lighting preset" value={settings.lighting} onChange={e=>change('lighting',e.target.value as EnvironmentPreviewSettings['lighting'])}>{['day','dusk','night','dungeon'].map(v=><option key={v}>{v}</option>)}</select></label>
          <label className="quality">Scene tint <input aria-label="Scene tint" type="color" value={settings.sceneTint??'#ffffff'} onChange={e=>{change('sceneTint',e.target.value);if(!settings.sceneTintStrength)change('sceneTintStrength',.25);}}/></label>
          <label className="range">Scene tint strength <output>{Math.round((settings.sceneTintStrength??0)*100)}%</output><input aria-label="Scene tint strength" type="range" min="0" max="1" step=".01" value={settings.sceneTintStrength??0} onChange={e=>change('sceneTintStrength',+e.target.value)}/></label>
          <button onClick={()=>{change('sceneTint','#ffffff');change('sceneTintStrength',0);}}>Reset scene tint</button>
          <label className="switch"><input aria-label="Heavy darkness setting" type="checkbox" checked={!!settings.heavyDarkness} onChange={e=>change('heavyDarkness',e.target.checked)}/>Heavy darkness</label>
          <p className="help">Dim ambient light while keeping lantern light at full strength.</p>
          <label className="quality">Weather <select aria-label="Weather" value={settings.weather} onChange={e=>change('weather',e.target.value as EnvironmentPreviewSettings['weather'])}>{['none','rain','snow'].map(v=><option key={v}>{v}</option>)}</select></label>
          <label className="range">Weather strength <input aria-label="Weather strength" type="range" min="0" max="1" step=".05" value={settings.weatherIntensity} onChange={e=>change('weatherIntensity',+e.target.value)}/></label>
          <label className="switch"><input aria-label="Lightning flashes" type="checkbox" checked={!!settings.lightning} onChange={e=>change('lightning',e.target.checked)}/>Lightning flashes</label>
          <label className="quality">Particles <select aria-label="Atmosphere particles" value={settings.particles??'none'} onChange={e=>change('particles',e.target.value as EnvironmentPreviewSettings['particles'])}>
            <option value="none">None</option><option value="leaves">Autumn leaves</option><option value="fireflies">Fireflies</option><option value="embers">Ash and embers</option><option value="dust">Windblown dust</option>
          </select></label>
          <label className="range">Particle density <input aria-label="Particle density" type="range" min="0" max="1" step=".05" value={settings.particleIntensity??.5} onChange={e=>change('particleIntensity',+e.target.value)}/></label>
          <label className="range">Wet ground <input aria-label="Wet ground" type="range" min="0" max="1" step=".05" value={settings.groundWetness??0} onChange={e=>change('groundWetness',+e.target.value)}/></label>
          <label className="range">Wind direction <input aria-label="Wind direction" type="range" min="0" max="359" value={settings.windDirectionDegrees} onChange={e=>change('windDirectionDegrees',+e.target.value)}/></label>
          <label className="range">Wind strength <output>{Math.round((settings.windStrength??.4)*100)}%</output><input aria-label="Wind strength" type="range" min="0" max="3" step=".05" value={settings.windStrength} onChange={e=>change('windStrength',+e.target.value)}/></label>
          <label className="switch"><input type="checkbox" checked={!!settings.lights?.length} onChange={e=>change('lights',e.target.checked?sceneLights:[])}/>Three local lights</label>
          <p className="help">Warm pools illuminate the original map and the figures. Lighting is visual; fog still controls visibility.</p>
        </>}
        <label className="switch"><input type="checkbox" checked={settings.mist} onChange={e=>change('mist',e.target.checked)}/>Drifting mist</label>
        <label className="quality">Atmosphere quality <select aria-label="Atmosphere quality" value={settings.mistQuality} onChange={e=>change('mistQuality',e.target.value as EnvironmentPreviewSettings['mistQuality'])}><option value="auto">Auto</option><option value="high">High</option><option value="low">Low</option><option value="off">Off</option></select></label>
        <label className="switch"><input type="checkbox" checked={settings.mistInteraction!==false} onChange={e=>change('mistInteraction',e.target.checked)}/>React to movement</label>
        <p className="help">Move Druk to leave a fading wake. Auto lowers mist detail on small screens or large drawing buffers; figures stay sharp.</p>
        <label className="switch"><input type="checkbox" checked={settings.mistCoverage==='map'} onChange={e=>change('mistCoverage',e.target.checked?'map':'patches')}/>Whole-map mist</label>
        <label className="switch"><input type="checkbox" checked={settings.mistShadows!==false} onChange={e=>change('mistShadows',e.target.checked)}/>Mist shadows</label>
        <label className="quality">Mist color <select aria-label="Mist color" value={settings.mistColor??'natural'} onChange={e=>change('mistColor',e.target.value as EnvironmentPreviewSettings['mistColor'])}>
          <option value="natural">Natural</option><option value="cool">Cool blue</option><option value="green">Eerie green</option><option value="ash">Ash grey</option><option value="sand">Warm sand</option>
        </select></label>
        <label className="range">Mist strength <output>{Math.round((settings.mistOpacity??.5)*100)}%</output><input aria-label="Mist strength" type="range" min="0" max=".7" step=".01" value={settings.mistOpacity} onChange={e=>change('mistOpacity',+e.target.value)}/></label>
        <label className="range">Mist height <output>{((settings.mistHeight??25.6)/pixelsPerFoot).toFixed(1)} ft</output><input aria-label="Mist height" type="range" min=".5" max="10" step=".5" value={(settings.mistHeight??25.6)/pixelsPerFoot} onChange={e=>change('mistHeight',+e.target.value*pixelsPerFoot)}/></label>
        <p className="help">Height sets how far the mist reaches above the ground. Switch whole-map coverage off to compare the original patches.</p>
        <label className="switch"><input type="checkbox" checked={settings.shadows} onChange={e=>change('shadows',e.target.checked)}/>Token shadows</label>
        <label className="range">Shadow direction <output>{Math.round(settings.shadowDirectionDegrees)}°</output><input aria-label="Shadow direction" type="range" min="0" max="359" value={settings.shadowDirectionDegrees} onChange={e=>change('shadowDirectionDegrees',+e.target.value)}/></label>
        <button className={calibrating?'active':''} onClick={()=>{stop();setCamera({...current.current});setCalibrating(v=>!v);}}>Match a painted shadow</button>
        <label className="range">Shadow length <output>{settings.shadowLength.toFixed(2)}×</output><input aria-label="Shadow length" type="range" min=".25" max="2" step=".05" value={settings.shadowLength} onChange={e=>change('shadowLength',+e.target.value)}/></label>
        {!atmosphereStudy&&<label className="switch"><input type="checkbox" checked={settings.scenery} onChange={e=>change('scenery',e.target.checked)}/>Raised scenery</label>}
        <p className="help">Light and weather stay in map coordinates while you rotate.</p>
        <p className="help">The original map image is preserved. This isolated preview does not change your campaign. Player views use the current personal darkness rules.</p>
        <div className="legend"><span className="ally">●</span> Druk · Varis · Vanec<br/><span className="enemy">●</span> Fanatic · goblins · wolf</div>
        <p className="diagnostics">{ready}/7 miniatures loaded</p>
      </aside>
    </div>
    <footer>Lighting study only · camera and effects stay in this preview · map artwork and character models are the existing approved assets</footer>
  </div>;
}

createRoot(document.getElementById('root')!).render(<Preview/>);
