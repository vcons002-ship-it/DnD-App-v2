import {useEffect, useState} from 'react';
import type {MapState} from '../../../shared/types';
import {DEFAULT_MAP_ENVIRONMENT, type MapEnvironment, type EnvironmentQuality} from '../../../shared/mapEnvironment';
import {useStore} from '../state/socket';
import {useEnvironmentQuality} from '../lib/useEnvironmentQuality';
import {useEnvironmentEditor} from '../lib/useEnvironmentEditor';

export function EnvironmentQualityControl(){
  const {quality,setQuality}=useEnvironmentQuality();
  return <label className="environment-quality">Environment quality
    <select aria-label="Environment quality" value={quality} onChange={e=>setQuality(e.target.value as EnvironmentQuality)}>
      <option value="auto">Auto</option><option value="high">High</option><option value="low">Low</option><option value="off">Off</option>
    </select>
    <small>Only changes this browser. Low reduces mist detail and weather particles; Off hides environmental effects.</small>
  </label>;
}

/** Sliders stage locally, then send one authoritative update on release/keyboard commit. */
function SettingSlider({label,value,min,max,step=1,suffix='',onCommit}:{label:string;value:number;min:number;max:number;step?:number;suffix?:string;onCommit:(value:number)=>void}){
  const [draft,setDraft]=useState(value);
  useEffect(()=>setDraft(value),[value]);
  const commit=()=>{if(draft!==value)onCommit(draft);};
  return <label className="environment-slider"><span>{label}<output>{Number(draft.toFixed(2))}{suffix}</output></span>
    <input aria-label={label} type="range" min={min} max={max} step={step} value={draft} onChange={e=>setDraft(Number(e.target.value))}
      onPointerUp={commit} onKeyUp={commit} onBlur={commit}/>
  </label>;
}

export function MapEnvironmentControls({map}:{map:MapState}){
  const settings=map.environment??DEFAULT_MAP_ENVIRONMENT;
  const save=useStore(s=>s.setMapEnvironment);
  const {placement,place}=useEnvironmentEditor();
  const update=(patch:Partial<MapEnvironment>)=>save(map.id,patch);
  const toggle=(key:'enabled'|'shadows'|'mist'|'mistShadows'|'mistInteraction',label:string)=><label className="environment-toggle">
    <input type="checkbox" checked={settings[key]} onChange={e=>update({[key]:e.target.checked})}/>{label}
  </label>;
  return <details className="map-environment-controls" key={map.id}>
    <summary>Environment <span className="muted">{settings.enabled?'On':'Off'}</span></summary>
    <p className="muted">{map.name} · saved for everyone on this map</p>
    {toggle('enabled','Enable environment')}
    {settings.enabled&&<>
      <fieldset><legend>Lighting</legend>
        <label>Time / setting <select aria-label="Lighting preset" value={settings.lighting} onChange={e=>update({lighting:e.target.value as MapEnvironment['lighting']})}>
          <option value="day">Day</option><option value="dusk">Dusk</option><option value="night">Night</option><option value="dungeon">Dungeon</option>
        </select></label>
        <SettingSlider label="Ambient light" value={settings.lightLevel*100} min={10} max={100} suffix="%" onCommit={v=>update({lightLevel:v/100})}/>
        <small>Lighting is visual; fog controls visibility. Painted walls do not block these lights.</small>
        <div className="environment-light-list">{settings.lights.map((light,index)=>{
          const edit=(patch:Partial<typeof light>)=>update({lights:settings.lights.map(l=>l.id===light.id?{...l,...patch}:l)});
          return <details key={light.id}><summary>Light {index+1} · {light.color}</summary>
            <label>Color <select aria-label={`Light ${index+1} color`} value={light.color} onChange={e=>edit({color:e.target.value as typeof light.color})}><option value="warm">Warm</option><option value="cool">Cool</option><option value="green">Eerie green</option></select></label>
            <SettingSlider label={`Light ${index+1} radius`} value={light.radiusFt} min={3} max={60} suffix=" ft" onCommit={v=>edit({radiusFt:v})}/>
            <SettingSlider label={`Light ${index+1} height`} value={light.heightFt} min={.5} max={30} step={.5} suffix=" ft" onCommit={v=>edit({heightFt:v})}/>
            <SettingSlider label={`Light ${index+1} strength`} value={light.intensity*100} min={10} max={200} suffix="%" onCommit={v=>edit({intensity:v/100})}/>
            <label className="environment-toggle"><input type="checkbox" checked={light.flicker} onChange={e=>edit({flicker:e.target.checked})}/>Gentle flicker</label>
            <button onClick={()=>place({mapId:map.id,lightId:light.id})}>Move light {index+1}</button>
            <button onClick={()=>{update({lights:settings.lights.filter(l=>l.id!==light.id)});place(null);}}>Remove light {index+1}</button>
          </details>;
        })}</div>
        {placement?.mapId===map.id?<button onClick={()=>place(null)}>Cancel light placement</button>:<button disabled={settings.lights.length>=8} onClick={()=>place({mapId:map.id})}>Place light on map</button>}
      </fieldset>
      <fieldset><legend>Weather</legend>
        <label>Weather <select aria-label="Weather" value={settings.weather} onChange={e=>update({weather:e.target.value as MapEnvironment['weather']})}><option value="none">None</option><option value="rain">Rain</option><option value="snow">Snow</option></select></label>
        {settings.weather!=='none'&&<SettingSlider label="Weather strength" value={settings.weatherIntensity*100} min={0} max={100} suffix="%" onCommit={v=>update({weatherIntensity:v/100})}/>}
        <SettingSlider label="Wind direction" value={settings.windDirectionDegrees} min={0} max={359} suffix="°" onCommit={v=>update({windDirectionDegrees:v})}/>
        <SettingSlider label="Wind strength" value={settings.windStrength*100} min={0} max={100} suffix="%" onCommit={v=>update({windStrength:v/100})}/>
      </fieldset>
      <fieldset><legend>Shadows</legend>
        {toggle('shadows','Token shadows')}
        {settings.shadows&&<>
          <SettingSlider label="Shadow direction" value={settings.shadowDirectionDegrees} min={0} max={359} suffix="°" onCommit={v=>update({shadowDirectionDegrees:v})}/>
          <small>Direction the shadow points on the map: 0° right, 90° down. Match a shadow already painted into the art.</small>
          <SettingSlider label="Shadow length" value={settings.shadowLength} min={.1} max={4} step={.05} suffix="×" onCommit={v=>update({shadowLength:v})}/>
          <SettingSlider label="Shadow darkness" value={settings.shadowOpacity*100} min={0} max={100} suffix="%" onCommit={v=>update({shadowOpacity:v/100})}/>
        </>}
      </fieldset>
      <fieldset><legend>Mist</legend>
        {toggle('mist','Drifting mist')}
        {settings.mist&&<>
          <SettingSlider label="Mist density" value={settings.mistOpacity*100} min={0} max={70} suffix="%" onCommit={v=>update({mistOpacity:v/100})}/>
          <SettingSlider label="Mist height" value={settings.mistHeightFt} min={.5} max={10} step={.5} suffix=" ft" onCommit={v=>update({mistHeightFt:v})}/>
          {toggle('mistShadows','Subtle mist shading')}{toggle('mistInteraction','React to moving figures')}
        </>}
      </fieldset>
    </>}
    <EnvironmentQualityControl/>
  </details>;
}
