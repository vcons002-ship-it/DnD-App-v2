/** Rendering placement is independent of this browser's graphics quality. */
export type RenderingOverride='inherit'|'on'|'off';
export type ServerRenderingState={
  enabled:boolean;
  preference:boolean;
  forcedBy?:'board'|'player';
  board:RenderingOverride;
  player:RenderingOverride;
  /** Present only in authenticated DM snapshots. */
  players?:{id:string;name:string;override:RenderingOverride;enabled:boolean;boardForced:boolean}[];
};
export type RenderingPolicyChange={mapId?:string;playerId?:string;value:RenderingOverride};
export function effectiveServerRendering(preference:boolean,board:RenderingOverride,player:RenderingOverride){
  if(board!=='inherit')return {enabled:board==='on',forcedBy:'board' as const};
  if(player!=='inherit')return {enabled:player==='on',forcedBy:'player' as const};
  return {enabled:preference};
}
export type RasterAsset={key:string;width:number;height:number;x:number;y:number;scale:number};
export type RasterTiles={key:string;bounds:Omit<RasterAsset,'key'>;tiles:Record<string,RasterAsset>};
