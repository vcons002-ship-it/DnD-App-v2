/** Version 1: axis-aligned footprints in normalized ORIGINAL-image coordinates.
 * Heights are estimates in feet, independent of image resolution or camera tilt. */
export type GeometrySuggestion = {
  id: string;
  kind: 'wall' | 'door' | 'obstacle';
  label: string;
  ax: number; ay: number; bx: number; by: number;
  heightFt: number;
  confidence: number;
};
export type MapGeometryDraft = {
  version: 1;
  method?: 'ai' | 'local';
  id: string;
  source: {
    mapId: string; imageHash: string; width: number; height: number;
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
    return {id: `item-${index}`, kind:item.kind, label:typeof item.label==='string'?item.label.slice(0,80):item.kind,
      ax:item.ax,ay:item.ay,bx:item.bx,by:item.by,heightFt:item.heightFt,confidence:item.confidence};
  });
}

export function draftWallRect(item:GeometrySuggestion, source:MapGeometryDraft['source']) {
  return {ax:item.ax*source.width, ay:item.ay*source.height, bx:item.bx*source.width, by:item.by*source.height};
}
