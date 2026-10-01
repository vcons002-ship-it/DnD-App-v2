import type {MapGeometryDraft} from './mapGeometryDraft.js';
import type {MapDoorDraft} from './mapDoorDraft.js';
import type {MapLightDraft} from './mapLightDraft.js';

export type MapSetupStep='walls'|'doors'|'lights';
export type MapSetupDrafts={walls?:MapGeometryDraft;doors?:MapDoorDraft;lights?:MapLightDraft};
export type MapSetupSelection=Record<MapSetupStep,string[]>;
