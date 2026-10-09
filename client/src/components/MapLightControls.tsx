import type {MapState} from '../../../shared/types';
import {DEFAULT_MAP_ENVIRONMENT,mapLightColorHex,sanitizeMapLightColor,type MapLightColor,type MapEnvironment} from '../../../shared/mapEnvironment';
import {useStore} from '../state/socket';
import {useEnvironmentEditor} from '../lib/useEnvironmentEditor';
import {SettingSlider} from './MapSettingSlider';

function LightColorControl({label,caption='Color',color,onChange}:{label:string;caption?:string;color:MapLightColor;onChange:(color:MapLightColor)=>void}){
  return <label className="environment-light-color">{caption}
    <input type="color" aria-label={`${label} picker`} value={mapLightColorHex(color)} onChange={e=>onChange(sanitizeMapLightColor(e.target.value))}/>
    <select aria-label={label} value={color.startsWith('#')?'custom':color} onChange={e=>onChange(sanitizeMapLightColor(e.target.value))}>
      <option value="warm">Warm</option><option value="cool">Cool</option><option value="green">Eerie green</option><option value="custom" disabled>Custom</option>
    </select>
  </label>;
}

export function MapLightControls({map,onPlace}:{map:MapState;onPlace:(lightId?:string)=>void}){
  const settings=map.environment??DEFAULT_MAP_ENVIRONMENT;
  const save=useStore(s=>s.setMapEnvironment);
  const {placement,place}=useEnvironmentEditor();
  const update=(patch:Partial<MapEnvironment>)=>save(map.id,patch);
  return <div className="map-light-controls">
        <LightColorControl label="New light color" caption="New light color" color={settings.newLightColor??'warm'} onChange={color=>update({newLightColor:color})}/>
        <small>Used for new lights on this map. Changing a light's color also selects it for your next placement.</small>
        {placement?.mapId===map.id?<button className="btn tiny" onClick={()=>place(null)}>Cancel light placement</button>:<button className="btn tiny" onClick={()=>onPlace()}>Place light on map</button>}
        <div className="environment-light-list">{settings.lights.map((light,index)=>{
          const edit=(patch:Partial<typeof light>)=>update({lights:settings.lights.map(l=>l.id===light.id?{...l,...patch}:l)});
          return <details key={light.id}><summary>Light {index+1} · {light.color}</summary>
            <LightColorControl label={`Light ${index+1} color`} color={light.color} onChange={color=>update({newLightColor:color,lights:settings.lights.map(l=>l.id===light.id?{...l,color}:l)})}/>
            <SettingSlider label={`Light ${index+1} lit radius`} value={light.radiusFt} min={3} max={60} suffix=" ft" onCommit={v=>edit({radiusFt:v})}/>
            <SettingSlider label={`Light ${index+1} height`} value={light.heightFt} min={.5} max={30} step={.5} suffix=" ft" onCommit={v=>edit({heightFt:v})}/>
            <SettingSlider label={`Light ${index+1} strength`} value={light.intensity*100} min={10} max={200} suffix="%" onCommit={v=>edit({intensity:v/100})}/>
            <label className="environment-toggle"><input type="checkbox" checked={light.flicker} onChange={e=>edit({flicker:e.target.checked})}/>Gentle flicker</label>
            <label>Model <select aria-label={`Light ${index+1} model`} value={light.fixture??'torch'} onChange={e=>edit({fixture:e.target.value as 'torch'|'lantern'})}><option value="torch">Torch</option><option value="lantern">Lantern</option></select></label>
            <label className="environment-toggle"><input type="checkbox" checked={!!light.visibleTorch} onChange={e=>edit({visibleTorch:e.target.checked})}/>Show 3D {light.fixture==='lantern'?'lantern':'torch'}</label>
            <button className="btn tiny" onClick={()=>onPlace(light.id)}>Move light {index+1}</button>
            <button className="btn tiny" onClick={()=>{update({lights:settings.lights.filter(l=>l.id!==light.id)});place(null);}}>Remove light {index+1}</button>
          </details>;
        })}</div>

  </div>;
}
