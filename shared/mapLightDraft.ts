import type {MapEnvironmentLight} from './mapEnvironment.js';
import type {MapGeometryDraft} from './mapGeometryDraft.js';
export type MapLightDraft={version:1;id:string;source:Omit<MapGeometryDraft['source'],'wallsHash'>&{lightsHash:string};maskImagePath:string;lights:MapEnvironmentLight[]};
