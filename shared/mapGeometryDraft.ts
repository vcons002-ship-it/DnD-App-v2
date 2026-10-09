import type {MapFeatureCheck} from './mapFeatureGate.js';
import {sanitizeWalls,type MapWall,type WallPoint} from './mapWalls.js';
/** Version 1: footprints in normalized ORIGINAL-image coordinates.
 * Heights are estimates in feet, independent of image resolution or camera tilt. */
export type GeometrySuggestion = {
  id: string;
  kind: 'wall' | 'door' | 'obstacle';
  label: string;
  ax: number; ay: number; bx: number; by: number;
  heightFt: number;
  confidence: number;
  /** Omitted in old drafts: rectangular footprint. Mask contours retain room holes. */
  shape?:'polygon'; points?:WallPoint[]; holes?:WallPoint[][];
};
export type MapGeometryDraft = {
  qwenChecks?:MapFeatureCheck[];
  version: 1;
  method?: 'ai' | 'local';
  id: string;
  maskImagePath?: string;
  /** Raw outputs retained separately from the add-only mask used for conversion. */
  wallMaskImagePath?:string;
  naturalMaskImagePath?:string;
  maskWarnings?:string[];
  /** Fraction of mask pixels represented, not an AI accuracy score. */
  maskCoverage?: number;
  maskGeometry?:'outlines'|'rectangles';
  source: {
    mapId: string; imageHash: string; width: number; height: number;
    originX?:number; originY?:number; previewImagePath?:string; tileCount?:number;
    gridSizePx: number; feetPerSquare: number; gridOffsetX: number; gridOffsetY: number;
    wallsHash: string;
  };
  items: GeometrySuggestion[];
};

/** Reject bad geometry rather than silently moving it to another location. */
export function parseGeometrySuggestions(value: unknown): GeometrySuggestion[] {
  const items = (value as {items?: unknown})?.items;
  if (!Array.isArray(items) || items.length > 120) throw new Error('Expected at most 120 geometry suggestions.');
  return items.map((item, index) => {
    if (!item || !['wall', 'door', 'obstacle'].includes(item.kind)) throw new Error('Invalid geometry kind.');
    if (![item.ax,item.ay,item.bx,item.by].every(n => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1)
      || item.bx <= item.ax || item.by <= item.ay) throw new Error('Footprints must be non-empty rectangles within the image.');
    if (typeof item.heightFt !== 'number' || !Number.isFinite(item.heightFt) || item.heightFt < 0 || item.heightFt > 200)
      throw new Error('Invalid estimated height.');
    if (typeof item.confidence !== 'number' || !Number.isFinite(item.confidence) || item.confidence < 0 || item.confidence > 1)
      throw new Error('Invalid confidence.');
    let geometry:Pick<GeometrySuggestion,'shape'|'points'|'holes'>={};
    if(item.shape!==undefined){
      if(item.shape!=='polygon')throw new Error('Invalid wall shape.');
      const expand=(r:WallPoint[])=>r?.map(p=>({x:p?.x*1000,y:p?.y*1000}));
      if(!Array.isArray(item.points)||item.holes!==undefined&&(!Array.isArray(item.holes)||!item.holes.every(Array.isArray)))throw new Error('Invalid wall contours.');
      const [wall]=sanitizeWalls([{id:'validate',kind:'polygon',ax:item.ax*1000,ay:item.ay*1000,bx:item.bx*1000,by:item.by*1000,points:expand(item.points),holes:item.holes?.map(expand)}]);
      if(!wall)throw new Error('Invalid wall contours.');
      geometry={shape:'polygon',points:wall.points!.map(p=>({x:p.x/1000,y:p.y/1000})),...(wall.holes?{holes:wall.holes.map(r=>r.map(p=>({x:p.x/1000,y:p.y/1000})))}:{})};
    }
    return {id: `item-${index}`, kind:item.kind, label:typeof item.label==='string'?item.label.slice(0,80):item.kind,
      ax:item.ax,ay:item.ay,bx:item.bx,by:item.by,heightFt:item.heightFt,confidence:item.confidence,...geometry};
  });
}
export function draftWallShape(item:GeometrySuggestion,source:MapGeometryDraft['source']):MapWall {
 const scale=(p:WallPoint)=>({x:p.x*source.width+(source.originX??0),y:p.y*source.height+(source.originY??0)});
 return {id:item.id,...draftWallRect(item,source),kind:item.shape??'rectangle',...(item.points?{points:item.points.map(scale)}:{}),...(item.holes?{holes:item.holes.map(r=>r.map(scale))}:{})};
}

export function draftWallRect(item:GeometrySuggestion, source:MapGeometryDraft['source']) {
  return {ax:item.ax*source.width+(source.originX??0), ay:item.ay*source.height+(source.originY??0), bx:item.bx*source.width+(source.originX??0), by:item.by*source.height+(source.originY??0)};
}

export function analysisPoint(p:WallPoint,source:Pick<MapGeometryDraft['source'],'originX'|'originY'>):WallPoint {
 return {x:p.x+(source.originX??0),y:p.y+(source.originY??0)};
}
export function analysisMarker<T extends {ax:number;ay:number;bx:number;by:number;footprint?:WallPoint[];points?:WallPoint[]}>(marker:T,source:MapGeometryDraft['source']):T {
 return {...marker,ax:marker.ax+(source.originX??0),ay:marker.ay+(source.originY??0),bx:marker.bx+(source.originX??0),by:marker.by+(source.originY??0),
 ...(marker.footprint?{footprint:marker.footprint.map(p=>analysisPoint(p,source))}:{}),...(marker.points?{points:marker.points.map(p=>analysisPoint(p,source))}:{})};
}
export function insideAnalysis(p:WallPoint,source:Pick<MapGeometryDraft['source'],'originX'|'originY'|'width'|'height'>):boolean {
 return Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=(source.originX??0)&&p.y>=(source.originY??0)&&p.x<=(source.originX??0)+source.width&&p.y<=(source.originY??0)+source.height;
}
