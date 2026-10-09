/** Saved atmosphere for one map. Distances use feet so map calibration applies. */
export type MapEnvironment = {
  lighting: 'day' | 'dusk' | 'night' | 'dungeon';
  lightLevel: number;
  sceneTint: string;
  sceneTintStrength: number;
  heavyDarkness: boolean;
  weather: 'none' | 'rain' | 'snow';
  weatherIntensity: number;
  particles: 'none' | 'leaves' | 'fireflies' | 'embers' | 'dust';
  particleIntensity: number;
  mistColor: 'natural' | 'cool' | 'green' | 'ash' | 'sand';
  lightning: boolean;
  groundWetness: number;
  windDirectionDegrees: number;
  windStrength: number;
  lights: MapEnvironmentLight[];
  /** Color used by the DM's next manually placed light, saved separately per map. */
  newLightColor?: MapLightColor;
  enabled: boolean;
  shadows: boolean;
  /** Fixed map-light direction, separate from shadows cast by torches/lanterns. */
  mapShadows?: boolean;
  shadowDirectionDegrees: number;
  shadowLength: number;
  shadowOpacity: number;
  mist: boolean;
  mistOpacity: number;
  mistHeightFt: number;
  mistShadows: boolean;
  mistInteraction: boolean;
};
export const MAP_LIGHT_COLOR_PRESETS={warm:'#ffb258',cool:'#89bbff',green:'#85eab5'} as const;
export type MapLightColor = keyof typeof MAP_LIGHT_COLOR_PRESETS | `#${string}`;
/** Preserve named colors in older saves; custom colors are opaque six-digit RGB. */
export function sanitizeMapLightColor(value:unknown):MapLightColor {
  if(value==='warm'||value==='cool'||value==='green')return value;
  return typeof value==='string'&&/^#[0-9a-f]{6}$/i.test(value)?value.toLowerCase() as MapLightColor:'warm';
}
export function mapLightColorHex(value:unknown):string {
  const color=sanitizeMapLightColor(value);
  return color.startsWith('#')?color:MAP_LIGHT_COLOR_PRESETS[color as keyof typeof MAP_LIGHT_COLOR_PRESETS];
}
export type MapEnvironmentLight = {id:string;x:number;y:number;radiusFt:number;heightFt:number;color:MapLightColor;intensity:number;flicker:boolean;visibleTorch?:boolean;fixture?:'torch'|'lantern'};
export type EnvironmentQuality = 'auto' | 'high' | 'low' | 'off';
export const DEFAULT_MAP_ENVIRONMENT: Readonly<MapEnvironment> = {
  lighting:'day',lightLevel:1,sceneTint:'#ffffff',sceneTintStrength:0,heavyDarkness:false,weather:'none',weatherIntensity:.5,particles:'none',particleIntensity:.5,mistColor:'natural',lightning:false,groundWetness:0,windDirectionDegrees:20,windStrength:.4,lights:[],newLightColor:'warm',
  enabled: false, shadows: true, mapShadows: true, shadowDirectionDegrees: 55, shadowLength: 1.05,
  shadowOpacity: .65, mist: true, mistOpacity: .35, mistHeightFt: 2,
  mistShadows: true, mistInteraction: true,
};

export function defaultMapShadows(settings: {lighting?: MapEnvironment['lighting'];heavyDarkness?: boolean}): boolean {
  return !settings.heavyDarkness && settings.lighting !== 'night' && settings.lighting !== 'dungeon';
}

/** Old dark maps also default to local-light shadows without a save migration. */
export function mapShadowsEnabled(settings: {mapShadows?: boolean;lighting?: MapEnvironment['lighting'];heavyDarkness?: boolean}): boolean {
  return settings.mapShadows ?? defaultMapShadows(settings);
}

/** Whitelist and bound inputs; an invalid partial update preserves saved values. */
export function sanitizeMapEnvironment(input: unknown, previous: Readonly<MapEnvironment> = DEFAULT_MAP_ENVIRONMENT): MapEnvironment {
  const result = {...previous};
  if (!input || typeof input !== 'object' || Array.isArray(input)) return result;
  const source = input as Record<string, unknown>;
  if(source.newLightColor==='warm'||source.newLightColor==='cool'||source.newLightColor==='green'||
    typeof source.newLightColor==='string'&&/^#[0-9a-f]{6}$/i.test(source.newLightColor))result.newLightColor=sanitizeMapLightColor(source.newLightColor);
  for (const key of ['enabled', 'heavyDarkness', 'lightning', 'shadows', 'mapShadows', 'mist', 'mistShadows', 'mistInteraction'] as const) {
    if (typeof source[key] === 'boolean') result[key] = source[key];
  }
  for (const [key, min, max] of [
    ['shadowLength', .1, 4], ['shadowOpacity', 0, 1], ['mistOpacity', 0, .7], ['mistHeightFt', .5, 10],
    ['particleIntensity',0,1],['groundWetness',0,1],['lightLevel',.1,1],['weatherIntensity',0,1],['windStrength',0,3],['sceneTintStrength',0,1],
  ] as const) {
    const value = source[key];
    if (typeof value === 'number' && Number.isFinite(value)) result[key] = Math.max(min, Math.min(max, value));
  }
  for(const key of ['shadowDirectionDegrees','windDirectionDegrees'] as const){
    const angle=source[key];
    if(typeof angle==='number'&&Number.isFinite(angle))result[key]=((angle%360)+360)%360;
  }
  if(['day','dusk','night','dungeon'].includes(source.lighting as string))result.lighting=source.lighting as MapEnvironment['lighting'];
  // A lighting change applies its default once. Later shadow/weather/light edits
  // preserve a DM override, and an explicitly supplied shadow choice always wins.
  if(typeof source.mapShadows !== 'boolean' && (result.lighting !== previous.lighting || result.heavyDarkness !== previous.heavyDarkness || previous.mapShadows === undefined)) {
    result.mapShadows = defaultMapShadows(result);
  }
  if(['none','rain','snow'].includes(source.weather as string))result.weather=source.weather as MapEnvironment['weather'];
  if(['none','leaves','fireflies','embers','dust'].includes(source.particles as string))result.particles=source.particles as MapEnvironment['particles'];
  if(['natural','cool','green','ash','sand'].includes(source.mistColor as string))result.mistColor=source.mistColor as MapEnvironment['mistColor'];
  if(typeof source.sceneTint==='string'&&/^#[0-9a-f]{6}$/i.test(source.sceneTint))result.sceneTint=source.sceneTint.toLowerCase();
  if(Array.isArray(source.lights)){
    const seen=new Set<string>();
    const number=(v:unknown,min:number,max:number,fallback:number)=>typeof v==='number'&&Number.isFinite(v)?Math.min(max,Math.max(min,v)):fallback;
    result.lights=source.lights.flatMap((light:unknown)=>{
      if(!light||typeof light!=='object')return [];
      const v=light as Record<string,unknown>;
      if(typeof v.id!=='string'||!v.id||v.id.length>80||seen.has(v.id)||typeof v.x!=='number'||!Number.isFinite(v.x)||typeof v.y!=='number'||!Number.isFinite(v.y))return [];
      seen.add(v.id);
      return [{id:v.id,x:number(v.x,-1e6,1e6,0),y:number(v.y,-1e6,1e6,0),radiusFt:number(v.radiusFt,3,60,15),heightFt:number(v.heightFt,.5,30,6),
        color:sanitizeMapLightColor(v.color),intensity:number(v.intensity,.1,2,1),flicker:v.flicker===true,...(v.visibleTorch===true?{visibleTorch:true}:{}),...(v.fixture==='lantern'?{fixture:'lantern' as const}:{})}];
    });
  }
  return result;
}
