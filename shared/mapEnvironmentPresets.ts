import {defaultMapShadows,type MapEnvironment} from './mapEnvironment.js';

// Presets replace atmosphere only. Map-calibrated shadow direction/length,
// placed lights and viewer quality are deliberately outside their owned fields.
type Atmosphere = Pick<MapEnvironment,'enabled'|'lighting'|'lightLevel'|'sceneTint'|'sceneTintStrength'|'heavyDarkness'|
  'particles'|'particleIntensity'|'mistColor'|'weather'|'weatherIntensity'|'lightning'|'groundWetness'|'windStrength'|'shadows'|'mapShadows'|'shadowOpacity'|
  'mist'|'mistOpacity'|'mistHeightFt'|'mistShadows'|'mistInteraction'>;
const base:Atmosphere={
  enabled:true,lighting:'day',lightLevel:1,sceneTint:'#ffffff',sceneTintStrength:0,heavyDarkness:false,
  weather:'none',weatherIntensity:.5,particles:'none',particleIntensity:.5,mistColor:'natural',lightning:false,groundWetness:0,windStrength:.15,shadows:true,shadowOpacity:.65,
  mist:false,mistOpacity:.08,mistHeightFt:1.5,mistShadows:true,mistInteraction:true,
};
const preset=(id:string,label:string,description:string,settings:Partial<Atmosphere>)=>({id,label,description,settings:{...base,...settings,mapShadows:settings.mapShadows??defaultMapShadows({...base,...settings})}});
export const MAP_ENVIRONMENT_PRESETS=[
  preset('clear-day','Clear day','Original map colors, balanced daylight and defined token shadows.',{}),
  preset('golden-dusk','Golden dusk','Warm fading daylight and softer shadows.',{lighting:'dusk',shadowOpacity:.5}),
  preset('moonlit-night','Moonlit night','Cool moonlight with a little low mist.',{lighting:'night',mist:true,shadowOpacity:.35}),
  preset('light-rain','Light rain','Gentle rain, subdued daylight and thin ground mist.',{lighting:'day',lightLevel:.7,groundWetness:.35,weather:'rain',weatherIntensity:.3,windStrength:.25,shadowOpacity:.2,mist:true,mistOpacity:.06}),
  preset('rainstorm','Rainstorm','Driving rain, wet stone and occasional cloud lightning.',{lighting:'night',lightLevel:.8,groundWetness:.8,lightning:true,weather:'rain',weatherIntensity:1,windStrength:.8,shadowOpacity:.15,mist:true,mistOpacity:.10}),
  preset('snowfall','Snowfall','Drifting snow under soft winter light.',{lightLevel:.8,weather:'snow',weatherIntensity:.65,windStrength:.25,shadowOpacity:.25,mist:true,mistOpacity:.04}),
  preset('misty-moor','Misty moor','Low drifting mist under dim evening light.',{lighting:'dusk',lightLevel:.85,mist:true,mistOpacity:.3,mistHeightFt:3,windStrength:.35,shadowOpacity:.3}),
  preset('dungeon','Dungeon','The approved dungeon lighting with light floor mist.',{lighting:'dungeon',mist:true,shadowOpacity:.8}),
  preset('deep-dungeon','Deep dungeon','Heavy darkness with light floor mist; lanterns keep their brightness.',{lighting:'dungeon',heavyDarkness:true,mist:true,shadowOpacity:.8}),
  preset('autumn-wind','Autumn wind','Tumbling leaves on a warm, breezy evening.',{lighting:'dusk',particles:'leaves',particleIntensity:.7,windStrength:.55,shadowOpacity:.45,mist:true,mistOpacity:.04}),
  preset('firefly-glade','Firefly glade','Gently glowing fireflies above a thin layer of green mist.',{lighting:'night',particles:'fireflies',particleIntensity:.65,windStrength:.1,shadowOpacity:.3,mist:true,mistColor:'green',mistOpacity:.12}),
  preset('haunted-marsh','Haunted marsh','Deep green mist, scattered ghost lights and damp ground.',{lighting:'night',lightLevel:.75,particles:'fireflies',particleIntensity:.35,windStrength:.2,groundWetness:.25,shadowOpacity:.25,mist:true,mistColor:'green',mistOpacity:.3,mistHeightFt:3}),
  preset('ashfall','Ashfall','Drifting ash and rising embers in smoky evening light.',{lighting:'dusk',lightLevel:.75,particles:'embers',particleIntensity:.8,windStrength:.35,shadowOpacity:.3,mist:true,mistColor:'ash',mistOpacity:.22,mistHeightFt:4}),
  preset('sandstorm','Sandstorm','Windblown dust and warm billowing haze.',{lighting:'dusk',lightLevel:.8,particles:'dust',particleIntensity:1,windStrength:.9,shadowOpacity:.15,mist:true,mistColor:'sand',mistOpacity:.3,mistHeightFt:5}),
  preset('blizzard','Blizzard','Dense wind-driven snow through cold, low mist.',{lightLevel:.7,weather:'snow',weatherIntensity:1,windStrength:1,shadowOpacity:.2,mist:true,mistColor:'cool',mistOpacity:.2,mistHeightFt:3}),
] as const;

export function matchingEnvironmentPreset(settings:MapEnvironment):string {
  return MAP_ENVIRONMENT_PRESETS.find(p=>Object.entries(p.settings).every(([key,value])=>{
    const actual=settings[key as keyof Atmosphere];
    return typeof value==='number'&&typeof actual==='number'?Math.abs(actual-value)<1e-6:actual===value;
  }))?.id??'';
}

/** A patch for the normal authoritative environment update, never a map replacement. */
export function environmentPresetPatch(id:string):Partial<MapEnvironment>|undefined {
  const selected=MAP_ENVIRONMENT_PRESETS.find(p=>p.id===id);
  return selected?{...selected.settings}:undefined;
}
