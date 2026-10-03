import type {MapGeometryDraft} from './mapGeometryDraft.js';
import type {MapWall} from './mapWalls.js';
export type MapWindowDraft={version:1;id:string;source:MapGeometryDraft['source'];maskImagePath:string;windows:MapWall[]};
