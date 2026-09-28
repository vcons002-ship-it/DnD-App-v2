/** Saved atmosphere for one map. Distances use feet so map calibration applies. */
export type MapEnvironment = {
  lighting: 'day' | 'dusk' | 'night' | 'dungeon';
  lightLevel: number;
  heavyDarkness: boolean;
  weather: 'none' | 'rain' | 'snow';
  weatherIntensity: number;
  windDirectionDegrees: number;
  windStrength: number;
  lights: MapEnvironmentLight[];
  enabled: boolean;
  shadows: boolean;
  shadowDirectionDegrees: number;
  shadowLength: number;
  shadowOpacity: number;
  mist: boolean;
  mistOpacity: number;
  mistHeightFt: number;
  mistShadows: boolean;
  mistInteraction: boolean;
};
export type MapEnvironmentLight = {id:string;x:number;y:number;radiusFt:number;heightFt:number;color:'warm'|'cool'|'green';intensity:number;flicker:boolean;visibleTorch?:boolean;fixture?:'torch'|'lantern'};
export type EnvironmentQuality = 'auto' | 'high' | 'low' | 'off';
export const DEFAULT_MAP_ENVIRONMENT: Readonly<MapEnvironment> = {
  lighting:'day',lightLevel:1,heavyDarkness:false,weather:'none',weatherIntensity:.5,windDirectionDegrees:20,windStrength:.4,lights:[],
  enabled: false, shadows: true, shadowDirectionDegrees: 55, shadowLength: 1.05,
  shadowOpacity: .65, mist: true, mistOpacity: .35, mistHeightFt: 2,
  mistShadows: true, mistInteraction: true,
};

/** Whitelist and bound inputs; an invalid partial update preserves saved values. */
export function sanitizeMapEnvironment(input: unknown, previous: Readonly<MapEnvironment> = DEFAULT_MAP_ENVIRONMENT): MapEnvironment {
  const result = {...previous};
  if (!input || typeof input !== 'object' || Array.isArray(input)) return result;
  const source = input as Record<string, unknown>;
  for (const key of ['enabled', 'heavyDarkness', 'shadows', 'mist', 'mistShadows', 'mistInteraction'] as const) {
    if (typeof source[key] === 'boolean') result[key] = source[key];
  }
  for (const [key, min, max] of [
    ['shadowLength', .1, 4], ['shadowOpacity', 0, 1], ['mistOpacity', 0, .7], ['mistHeightFt', .5, 10],
    ['lightLevel',.1,1],['weatherIntensity',0,1],['windStrength',0,1],
  ] as const) {
    const value = source[key];
    if (typeof value === 'number' && Number.isFinite(value)) result[key] = Math.max(min, Math.min(max, value));
  }
  for(const key of ['shadowDirectionDegrees','windDirectionDegrees'] as const){
    const angle=source[key];
    if(typeof angle==='number'&&Number.isFinite(angle))result[key]=((angle%360)+360)%360;
  }
  if(['day','dusk','night','dungeon'].includes(source.lighting as string))result.lighting=source.lighting as MapEnvironment['lighting'];
  if(['none','rain','snow'].includes(source.weather as string))result.weather=source.weather as MapEnvironment['weather'];
  if(Array.isArray(source.lights)){
    const seen=new Set<string>();
    const number=(v:unknown,min:number,max:number,fallback:number)=>typeof v==='number'&&Number.isFinite(v)?Math.min(max,Math.max(min,v)):fallback;
    result.lights=source.lights.flatMap((light:unknown)=>{
      if(!light||typeof light!=='object')return [];
      const v=light as Record<string,unknown>;
      if(typeof v.id!=='string'||!v.id||v.id.length>80||seen.has(v.id)||typeof v.x!=='number'||!Number.isFinite(v.x)||typeof v.y!=='number'||!Number.isFinite(v.y))return [];
      seen.add(v.id);
      return [{id:v.id,x:number(v.x,-1e6,1e6,0),y:number(v.y,-1e6,1e6,0),radiusFt:number(v.radiusFt,3,60,15),heightFt:number(v.heightFt,.5,30,6),
        color:v.color==='cool'||v.color==='green'?v.color:'warm',intensity:number(v.intensity,.1,2,1),flicker:v.flicker===true,...(v.visibleTorch===true?{visibleTorch:true}:{}),...(v.fixture==='lantern'?{fixture:'lantern' as const}:{})}];
    });
  }
  return result;
}
