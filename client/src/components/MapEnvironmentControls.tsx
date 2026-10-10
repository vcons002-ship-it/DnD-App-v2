import type {MapState} from '../../../shared/types';
import {DEFAULT_MAP_ENVIRONMENT, mapShadowsEnabled, type MapEnvironment, type EnvironmentQuality} from '../../../shared/mapEnvironment';
import {useStore} from '../state/socket';
import {useEnvironmentQuality} from '../lib/useEnvironmentQuality';
import {MAP_ENVIRONMENT_PRESETS,environmentPresetPatch,matchingEnvironmentPreset} from '../../../shared/mapEnvironmentPresets';
import {SettingSlider} from './MapSettingSlider';

export function EnvironmentQualityControl(){
  const {quality,setQuality,budget}=useEnvironmentQuality();
  return <label className="environment-quality">Graphics quality
    <select aria-label="Graphics quality" value={quality} onChange={e=>setQuality(e.target.value as EnvironmentQuality)}>
      <option value="auto">Auto</option><option value="high">High</option><option value="balanced">Balanced</option><option value="low">Low</option><option value="off">Effects off</option>
    </select>
    <small>Only changes this browser. Auto uses the approved lighter figures. High keeps originals; Balanced uses conservative copies. Balanced and Low also reduce resolution, shadows and particles. Effects off keeps lighting and fog. {quality==='auto'?`Auto: ${budget.resolved}. Adjusts to sustained frame performance.`:''}</small>
  </label>;
}

export function MapEnvironmentControls({map}:{map:MapState}){
  const settings=map.environment??DEFAULT_MAP_ENVIRONMENT;
  const save=useStore(s=>s.setMapEnvironment);
  const update=(patch:Partial<MapEnvironment>)=>save(map.id,patch);
  const toggle=(key:'enabled'|'heavyDarkness'|'shadows'|'mist'|'mistShadows'|'mistInteraction'|'lightning',label:string)=><label className="environment-toggle">
    <input type="checkbox" checked={settings[key]} onChange={e=>update({[key]:e.target.checked})}/>{label}
  </label>;
  return <details className="map-environment-controls" key={map.id}>
    <summary>Environment <span className="muted">{settings.enabled?'On':'Off'}</span></summary>
    <p className="muted">{map.name} · saved for everyone on this map</p>
    <label className="environment-preset">Environment preset <select aria-label="Environment preset" value={matchingEnvironmentPreset(settings)} onChange={e=>{const patch=environmentPresetPatch(e.target.value);if(patch)update(patch);}}>
      <option value="" disabled>Custom settings</option>
      {MAP_ENVIRONMENT_PRESETS.map(p=><option key={p.id} value={p.id}>{p.label}</option>)}
    </select></label>
    <small>Apply a look, then adjust it below. Keeps placed lights and your chosen shadow and wind directions.</small>
    {toggle('enabled','Enable environment')}
    {settings.enabled&&<>
      <fieldset><legend>Lighting</legend>
        <label>Time / setting <select aria-label="Lighting preset" value={settings.lighting} onChange={e=>update({lighting:e.target.value as MapEnvironment['lighting']})}>
          <option value="day">Day</option><option value="dusk">Dusk</option><option value="night">Night</option><option value="dungeon">Dungeon</option>
        </select></label>
        <SettingSlider label="Ambient light" value={settings.lightLevel*100} min={10} max={100} suffix="%" onCommit={v=>update({lightLevel:v/100})}/>
        <label>Scene tint <input aria-label="Scene tint" type="color" value={settings.sceneTint} onChange={e=>update({sceneTint:e.target.value,sceneTintStrength:settings.sceneTintStrength||.25})}/></label>
        <SettingSlider label="Scene tint strength" value={settings.sceneTintStrength*100} min={0} max={100} suffix="%" onCommit={v=>update({sceneTintStrength:v/100})}/>
        <button onClick={()=>update({sceneTint:'#ffffff',sceneTintStrength:0})}>Reset scene tint</button>
        <small>Adds color to the map and figure lighting. Clear day uses original colors with no tint.</small>
        {toggle('heavyDarkness','Heavy darkness')}
        <small>Heavy darkness is nonmagical: Darkvision is grayscale. Regular darkness preserves color. Lantern-lit areas keep their color.</small>
        <small>Night and Dungeon limit each player to 60 ft around their own token, even with effects off. The DM sees the full map. Fog still applies; painted walls do not block sight.</small>
      </fieldset>
      <fieldset><legend>Weather</legend>
        <label>Weather <select aria-label="Weather" value={settings.weather} onChange={e=>update({weather:e.target.value as MapEnvironment['weather']})}><option value="none">None</option><option value="rain">Rain</option><option value="snow">Snow</option></select></label>
        {settings.weather!=='none'&&<SettingSlider label="Weather strength" value={settings.weatherIntensity*100} min={0} max={100} suffix="%" onCommit={v=>update({weatherIntensity:v/100})}/>}
        {settings.weather==='rain'&&toggle('lightning','Lightning flashes')}
        <SettingSlider label="Wet ground" value={settings.groundWetness*100} min={0} max={100} suffix="%" onCommit={v=>update({groundWetness:v/100})}/>
        <SettingSlider label="Wind direction" value={settings.windDirectionDegrees} min={0} max={359} suffix="°" onCommit={v=>update({windDirectionDegrees:v})}/>
        <SettingSlider label="Wind strength" value={settings.windStrength*100} min={0} max={300} suffix="%" onCommit={v=>update({windStrength:v/100})}/>
        <small>Wind moves mist, particles and snow, and tilts rain. 100% is the previous maximum.</small>
      </fieldset>
      <fieldset><legend>Atmosphere particles</legend>
        <label>Particles <select aria-label="Atmosphere particles" value={settings.particles} onChange={e=>update({particles:e.target.value as MapEnvironment['particles']})}>
          <option value="none">None</option><option value="leaves">Autumn leaves</option><option value="fireflies">Fireflies</option><option value="embers">Ash and embers</option><option value="dust">Windblown dust</option>
        </select></label>
        {settings.particles!=='none'&&<SettingSlider label="Particle density" value={settings.particleIntensity*100} min={0} max={100} suffix="%" onCommit={v=>update({particleIntensity:v/100})}/>}
        <small>Combines with weather and mist. Uses the wind settings above.</small>
      </fieldset>
      <fieldset><legend>Shadows</legend>
        {toggle('shadows','Token shadows')}
        {settings.shadows&&<>
          <label className="environment-toggle"><input type="checkbox" checked={mapShadowsEnabled(settings)} onChange={e=>update({mapShadows:e.target.checked})}/>Map directional shadows</label>
          <small>Night, Dungeon and heavy darkness default to shadows from torches and lanterns only. Enable map directional shadows to add the map’s fixed light direction.</small>
        </>}
        {settings.shadows&&mapShadowsEnabled(settings)&&<>
          <SettingSlider label="Shadow direction" value={settings.shadowDirectionDegrees} min={0} max={359} suffix="°" onCommit={v=>update({shadowDirectionDegrees:v})}/>
          <small>Outdoor light direction: 0° right, 90° down. Match the map art. Torches and lanterns also cast shadows from their own positions.</small>
          <SettingSlider label="Shadow length" value={settings.shadowLength} min={.1} max={4} step={.05} suffix="×" onCommit={v=>update({shadowLength:v})}/>
          <SettingSlider label="Shadow darkness" value={settings.shadowOpacity*100} min={0} max={100} suffix="%" onCommit={v=>update({shadowOpacity:v/100})}/>
        </>}
        {settings.shadows&&!mapShadowsEnabled(settings)&&<>
          <small>Torches and lanterns set each creature’s shadow direction and length. Move a light or change its height to adjust the shadows.</small>
          <SettingSlider label="Shadow darkness" value={settings.shadowOpacity*100} min={0} max={100} suffix="%" onCommit={v=>update({shadowOpacity:v/100})}/>
        </>}
      </fieldset>
      <fieldset><legend>Mist</legend>
        {toggle('mist','Drifting mist')}
        {settings.mist&&<>
          <label>Mist color <select aria-label="Mist color" value={settings.mistColor} onChange={e=>update({mistColor:e.target.value as MapEnvironment['mistColor']})}>
            <option value="natural">Natural</option><option value="cool">Cool blue</option><option value="green">Eerie green</option><option value="ash">Ash grey</option><option value="sand">Warm sand</option>
          </select></label>
          <SettingSlider label="Mist density" value={settings.mistOpacity*100} min={0} max={70} suffix="%" onCommit={v=>update({mistOpacity:v/100})}/>
          <SettingSlider label="Mist height" value={settings.mistHeightFt} min={.5} max={10} step={.5} suffix=" ft" onCommit={v=>update({mistHeightFt:v})}/>
          {toggle('mistShadows','Subtle mist shading')}{toggle('mistInteraction','React to moving figures')}
        </>}
      </fieldset>
    </>}
    <EnvironmentQualityControl/>
  </details>;
}
