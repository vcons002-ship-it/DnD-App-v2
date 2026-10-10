import type {MapGeometryDraft} from './mapGeometryDraft.js';
import type {MapDoorDraft} from './mapDoorDraft.js';
import type {MapLightDraft} from './mapLightDraft.js';
import type {MapWindowDraft} from './mapWindowDraft.js';
import type {MapArchDraft} from './mapArchDraft.js';

export type MapSetupStep='walls'|'doors'|'windows'|'lights'|'arches';
export type MapSetupDrafts={walls?:MapGeometryDraft;doors?:MapDoorDraft;windows?:MapWindowDraft;lights?:MapLightDraft;arches?:MapArchDraft};
export type MapSetupSelection=Record<Exclude<MapSetupStep,'windows'|'arches'>,string[]>&{windows?:string[];arches?:string[]};
