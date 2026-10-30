/** Opt-in isolated-benchmark diagnostics. Epoch timestamps share one host clock
 * in the local test; worker durations are monotonic elapsed time, not CPU time. */
export type MovementWorkerTiming={kind:'geometry'|'preview'|'raster'|'maskTiles'|'terrain'|'walkSight';queueMs:number;roundTripMs:number;computeMs:number;terrain?:{lightsMs:number;blendMs:number;encodeMs:number;maskMs:number};detail?:{rasterMs:number;copyHashMs:number;encodeMs:number;tiles:number;encodedTiles:number;cached?:boolean}};
export type MovementFrameTiming={
 id:string;receivedAt:number;appliedAt?:number;queuedAt:number;startedAt?:number;
 geometryStartAt?:number;geometryEndAt?:number;renderStartAt?:number;renderEndAt?:number;
 spritesStartAt?:number;spritesEndAt?:number;maskStartAt?:number;maskEndAt?:number;
 motionStartAt?:number;motionEndAt?:number;terrainCacheHits?:number;
 emittedAt?:number;reused?:boolean;workers:MovementWorkerTiming[];
};
