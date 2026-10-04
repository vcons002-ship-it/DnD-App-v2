import type {MapGeometryDraft} from './mapGeometryDraft.js';
import type {MapDoorDraft} from './mapDoorDraft.js';
import type {MapLightDraft} from './mapLightDraft.js';
import type {MapWindowDraft} from './mapWindowDraft.js';

export type MapSetupStep='walls'|'doors'|'windows'|'lights';
export type MapSetupDrafts={walls?:MapGeometryDraft;doors?:MapDoorDraft;windows?:MapWindowDraft;lights?:MapLightDraft};
export type MapSetupSelection=Record<Exclude<MapSetupStep,'windows'>,string[]>&{windows?:string[]};
