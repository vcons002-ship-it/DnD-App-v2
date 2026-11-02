import { createPortal } from 'react-dom';
import type { MapWall } from '../../../shared/mapWalls';
import { usesMapVision } from '../../../shared/playerVision';
import type { FogLayer, StateSnapshot } from '../../../shared/types';
import { AnnotationMenu } from '../components/AnnotationMenu';
import { CompactToolbarMenu } from '../components/CompactToolbarMenu';
import { FogMenu } from '../components/FogMenu';
import { LegacyModeControl } from '../components/LegacyModeControl';
import { MeasureMenu } from '../components/MeasureMenu';
import { ScaleMenu } from '../components/ScaleMenu';
import { WallMenu, type WallTool } from '../components/WallMenu';
import { useStore } from '../state/socket';
import type { DraftMeasure, MeasureShapeKind, MeasureSize, MeasureTool } from './MeasureShape';
import { BATTLEFIELD_TILT_DEGREES } from './miniatureProjection';

type Pt = { x: number; y: number };
type View = { scale: number; x: number; y: number };

export function MapToolbarPortals({
  toolSlot,
  zoomBy,
  view,
  resetView,
  legacy,
  animateView,
  tilted,
  projectionState,
  actualDm,
  dmViewMode,
  setDmViewMode,
  partyPreview,
  sourceSnapshot,
  chooseTilt,
  rotationLabel,
  rotationDegrees,
  map,
  tiles,
  animateMap,
  mapAnimation,
  doors,
  openDoorControls,
  wallTool,
  wallSnap,
  setWallSnap,
  comfyOk,
  generateScenery,
  tilesMode,
  setTilesMode,
  addTileFromFile,
  reorderMapImage,
  removeMapImage,
  setTool,
  setRemoveMode,
  setScaleMode,
  setMatchMode,
  setAnnotate,
  setFogBrush,
  placeLight,
  setMenu,
  setWallTool,
  setWallAnchor,
  setWallPointer,
  hideCursor,
  cancelWallStroke,
  tool,
  snap,
  setSnap,
  removeMode,
  snapshot,
  pendingRef,
  setDraft,
  clearMeasurements,
  annotate,
  annoColor,
  setAnnoColor,
  clearAnnotations,
  decalsLocked,
  toggleDecalsLocked,
  derivedFtPerSquare,
  widthFt,
  setWidthFt,
  gridPx,
  scaleMode,
  matchMode,
  commitScaleFeet,
  setMapGrid,
  setScaleLine,
  setScalePrompt,
  setVisionFog,
  mapFogEnabled,
  tokenFogEnabled,
  paintLayer,
  setPaintLayer,
  fogBrush,
  brushSize,
  setBrushSize,
  toggleLayer,
  coverFog,
  revealAll,
}: {
  toolSlot: HTMLElement | null;
  zoomBy: (factor: number) => void;
  view: View;
  resetView: () => void;
  legacy: boolean;
  animateView: (nextTilt: number, nextRotation: number) => void;
  tilted: boolean;
  projectionState: React.MutableRefObject<{ tilt: number; rotation: number }>;
  actualDm: boolean;
  dmViewMode: 'dm' | 'scene' | 'player';
  setDmViewMode: (mode: 'dm' | 'scene' | 'player') => void;
  partyPreview: boolean;
  sourceSnapshot: StateSnapshot;
  chooseTilt: (next: boolean) => void;
  rotationLabel: React.RefObject<HTMLButtonElement>;
  rotationDegrees: number;
  map: NonNullable<StateSnapshot['map']>;
  tiles: StateSnapshot['mapImages'];
  animateMap: boolean;
  mapAnimation: { enabled: boolean; setEnabled: (enabled: boolean) => void };
  doors: MapWall[];
  openDoorControls: (id: string) => void;
  wallTool: WallTool;
  wallSnap: boolean;
  setWallSnap: (snap: boolean) => void;
  comfyOk: boolean;
  generateScenery: (prompt: string) => Promise<boolean>;
  tilesMode: boolean;
  setTilesMode: React.Dispatch<React.SetStateAction<boolean>>;
  addTileFromFile: (file: File) => Promise<void>;
  reorderMapImage: (id: string, to: 'front' | 'back') => void;
  removeMapImage: (id: string) => void;
  setTool: React.Dispatch<React.SetStateAction<MeasureTool | null>>;
  setRemoveMode: React.Dispatch<React.SetStateAction<boolean>>;
  setScaleMode: React.Dispatch<React.SetStateAction<boolean>>;
  setMatchMode: React.Dispatch<React.SetStateAction<boolean>>;
  setAnnotate: React.Dispatch<React.SetStateAction<'pen' | 'text' | null>>;
  setFogBrush: (b: 'off' | 'reveal' | 'hide') => void;
  placeLight: (p: null) => void;
  setMenu: (m: null) => void;
  setWallTool: (t: WallTool) => void;
  setWallAnchor: (p: Pt | null) => void;
  setWallPointer: (p: Pt | null) => void;
  hideCursor: () => void;
  cancelWallStroke: () => void;
  tool: MeasureTool | null;
  snap: boolean;
  setSnap: React.Dispatch<React.SetStateAction<boolean>>;
  removeMode: boolean;
  snapshot: StateSnapshot;
  pendingRef: React.MutableRefObject<boolean>;
  setDraft: React.Dispatch<React.SetStateAction<DraftMeasure | null>>;
  clearMeasurements: (mapId: string, onlyMine: boolean) => void;
  annotate: 'pen' | 'text' | null;
  annoColor: string;
  setAnnoColor: (c: string) => void;
  clearAnnotations: (mapId: string, onlyMine: boolean, kind?: 'image') => void;
  decalsLocked: boolean;
  toggleDecalsLocked: () => void;
  derivedFtPerSquare: number;
  widthFt: number;
  setWidthFt: (w: number) => void;
  gridPx: number;
  scaleMode: boolean;
  matchMode: boolean;
  commitScaleFeet: (ftPerSquare: number, ftWide: number) => void;
  setMapGrid: (
    mapId: string,
    gridSizePx: number,
    feetPerSquare: number,
    mapWidthFt: number,
    opts?: { offsetX?: number; offsetY?: number; hidden?: boolean; locked?: boolean },
  ) => void;
  setScaleLine: (l: { origin: Pt; target: Pt } | null) => void;
  setScalePrompt: (p: { lenPx: number } | null) => void;
  setVisionFog: (mapId: string, layer: FogLayer, enabled: boolean) => void;
  mapFogEnabled: boolean;
  tokenFogEnabled: boolean;
  paintLayer: FogLayer;
  setPaintLayer: (l: FogLayer) => void;
  fogBrush: 'off' | 'reveal' | 'hide';
  brushSize: number;
  setBrushSize: (n: number) => void;
  toggleLayer: (layer: FogLayer) => void;
  coverFog: (mapId: string, layer: FogLayer) => void;
  revealAll: (layer: FogLayer) => void;
}) {
  if (!toolSlot) return null;
  return (
    <>
      {createPortal(
        <div className="map-view-controls" role="group" aria-label="Map view controls">
          <button className="btn tiny zoom-btn" onClick={() => zoomBy(1 / 1.25)} title="Zoom out">
            −
          </button>
          <span className="zoom-label">{Math.round(view.scale * 100)}%</span>
          <button className="btn tiny zoom-btn" onClick={() => zoomBy(1.25)} title="Zoom in">
            +
          </button>
          <button className="btn tiny" onClick={resetView} title="Fit to window">
            Fit
          </button>
          <span className="map-rotation-controls" role="group" aria-label="Map rotation">
            <button
              className="btn tiny"
              aria-label="Rotate map left"
              disabled={legacy}
              title={legacy ? 'Legacy mode uses a fixed overhead view' : 'Rotate view left 15°'}
              onClick={() => animateView(tilted ? BATTLEFIELD_TILT_DEGREES : 0, projectionState.current.rotation - 15)}
            >
              ↶
            </button>
            <button
              className="btn tiny"
              aria-label="Rotate map right"
              disabled={legacy}
              title={legacy ? 'Legacy mode uses a fixed overhead view' : 'Rotate view right 15°'}
              onClick={() => animateView(tilted ? BATTLEFIELD_TILT_DEGREES : 0, projectionState.current.rotation + 15)}
            >
              ↷
            </button>
          </span>
          <CompactToolbarMenu label="View" forceCompact={actualDm}>
            <LegacyModeControl toolbar />
            <div className="battlefield-view-options" role="group" aria-label="Your battlefield view">
              <span className="muted">Your view</span>
              {actualDm && (
                <select
                  className="btn tiny"
                  aria-label="Battlefield visibility"
                  value={dmViewMode}
                  title="Only changes this DM window. Player view combines the party's current sight without changing fog or character claims."
                  onChange={(e) => setDmViewMode(e.target.value as typeof dmViewMode)}
                >
                  <option value="dm">DM visibility</option>
                  <option value="scene">Scene lighting</option>
                  <option value="player">Player view</option>
                </select>
              )}
              {partyPreview && (
                <span className="muted" role="status">
                  {sourceSnapshot.partyView ? 'Combined party sight' : 'Loading party sight…'}
                </span>
              )}
              <button
                className={`btn tiny ${tilted ? 'on' : ''}`}
                aria-pressed={tilted}
                aria-label="Tilted battlefield view"
                disabled={legacy}
                title="45° tilt — only changes your view"
                onClick={() => chooseTilt(true)}
              >
                45°
              </button>
              <button
                className={`btn tiny ${!tilted ? 'on' : ''}`}
                aria-pressed={!tilted}
                aria-label="Flat battlefield view"
                title="Flat overhead view — only changes your view"
                onClick={() => chooseTilt(false)}
              >
                Overhead
              </button>
              <button
                ref={rotationLabel}
                className="btn tiny"
                hidden={Math.abs(rotationDegrees % 360) < 0.01}
                aria-label="Reset battlefield rotation"
                title="Reset the map's rotation. Hold right mouse button and drag empty space to rotate freely."
                onClick={() => animateView(tilted ? BATTLEFIELD_TILT_DEGREES : 0, 0)}
              >
                Reset rotation
              </button>
            </div>
            {!legacy && (map?.videoPath || tiles.some((t) => t.videoPath)) && (
              <button
                className={`btn tiny ${animateMap ? 'on' : ''}`}
                aria-label="Toggle map animation"
                aria-pressed={animateMap}
                title="Animate the map in your view, or use its still image for better performance"
                onClick={() => mapAnimation.setEnabled(!mapAnimation.enabled)}
              >
                Map animation: {animateMap ? 'On' : 'Off'}
              </button>
            )}
          </CompactToolbarMenu>
        </div>,
        toolSlot,
      )}
      {createPortal(
        <>
          {actualDm && (
            <WallMenu
              map={map}
              doors={doors}
              onDoor={openDoorControls}
              tool={wallTool}
              count={map?.walls?.length ?? 0}
              snap={wallSnap}
              onSnap={setWallSnap}
              canGenerateDecal={comfyOk}
              onGenerateDecal={generateScenery}
              tiles={tiles}
              arrangingTiles={tilesMode}
              onToggleArrangeTiles={() => setTilesMode((t) => !t)}
              onAddTileFile={addTileFromFile}
              onReorderTile={reorderMapImage}
              onRemoveTile={removeMapImage}
              onTool={(next) => {
                setTool(null);
                setRemoveMode(false);
                setScaleMode(false);
                setMatchMode(false);
                setAnnotate(null);
                setFogBrush('off');
                setTilesMode(false);
                placeLight(null);
                setMenu(null);
                setWallTool(next);
                setWallAnchor(null);
                setWallPointer(null);
                hideCursor();
              }}
              onFinish={cancelWallStroke}
              onUndo={() => {
                const last = map?.walls?.at(-1);
                if (map && last) useStore.getState().editMapWalls(map.id, { removeId: last.id });
                setWallAnchor(null);
              }}
            />
          )}
          <CompactToolbarMenu label="Map tools" shortLabel="Tools" forceCompact={actualDm}>
            <div className="map-tool-menus">
              {/* Measuring tools — available to everyone; shapes are shared. */}
              <MeasureMenu
                tool={tool}
                snap={snap}
                removeMode={removeMode}
                hasMeasurements={snapshot.measurements.length > 0}
                isDm={actualDm}
                onPick={(shape: MeasureShapeKind, sz: MeasureSize) => {
                  setRemoveMode(false);
                  pendingRef.current = false;
                  setDraft(null);
                  setTool((cur) => (cur && cur.shape === shape && cur.size === sz ? null : { shape, size: sz }));
                }}
                onToggleSnap={() => setSnap((s) => !s)}
                onToggleRemove={() => {
                  setTool(null);
                  pendingRef.current = false;
                  setDraft(null);
                  setRemoveMode((r) => !r);
                }}
                onClearMine={() => map && clearMeasurements(map.id, true)}
                onClearAll={() => map && clearMeasurements(map.id, false)}
              />
              {/* Annotation tools — freehand pen + text labels (shared). */}
              <div className="annotate-tools">
                <AnnotationMenu
                  tool={annotate}
                  color={annoColor}
                  onColor={setAnnoColor}
                  onTool={(next) => {
                    setTool(null);
                    setRemoveMode(false);
                    setDraft(null);
                    setAnnotate(next);
                  }}
                />
                {snapshot.annotations.length > 0 && (
                  <button
                    className="btn tiny"
                    title="Clear my annotations"
                    onClick={() => map && clearAnnotations(map.id, true)}
                  >
                    Clear mine
                  </button>
                )}
                {actualDm && snapshot.annotations.length > 0 && (
                  <button
                    className="btn tiny"
                    title="Clear everyone's annotations"
                    onClick={() => map && clearAnnotations(map.id, false)}
                  >
                    Clear all
                  </button>
                )}
                {actualDm && snapshot.annotations.some((a) => a.kind === 'image') && (
                  <>
                    <button
                      className={`btn tiny ${decalsLocked ? 'on' : ''}`}
                      title={
                        decalsLocked
                          ? 'Decals locked: click-through and undraggable — click to unlock'
                          : 'Lock decals so they become click-through and undraggable'
                      }
                      onClick={toggleDecalsLocked}
                    >
                      {decalsLocked ? '🔒' : '🔓'} Decals
                    </button>
                    <button
                      className="btn tiny"
                      title="Remove all scenery decals on this map (strokes/text stay)"
                      onClick={() => map && clearAnnotations(map.id, false, 'image')}
                    >
                      Clear decals
                    </button>
                  </>
                )}
              </div>
              {actualDm && (
                <>
                  <ScaleMenu
                    feetPerSquare={derivedFtPerSquare}
                    widthFt={widthFt}
                    gridPx={gridPx}
                    scaleMode={scaleMode}
                    matchMode={matchMode}
                    gridHidden={!!map?.gridHidden}
                    gridLocked={!!map?.gridLocked}
                    onCommit={(ft, width) => {
                      setWidthFt(width);
                      commitScaleFeet(ft, width);
                    }}
                    onToggleHidden={() =>
                      map &&
                      setMapGrid(map.id, gridPx, Math.round(derivedFtPerSquare) || 5, widthFt, {
                        hidden: !map.gridHidden,
                      })
                    }
                    onUnlock={() =>
                      map &&
                      setMapGrid(map.id, gridPx, Math.round(derivedFtPerSquare) || 5, widthFt, {
                        locked: false,
                      })
                    }
                    onToggleMatchMode={() => {
                      setTool(null);
                      setRemoveMode(false);
                      setScaleMode(false);
                      setScaleLine(null);
                      setScalePrompt(null);
                      setMatchMode((s) => !s);
                    }}
                    onToggleScaleMode={() => {
                      setTool(null);
                      setRemoveMode(false);
                      setMatchMode(false);
                      setScaleLine(null);
                      setScalePrompt(null);
                      setScaleMode((s) => !s);
                    }}
                  />

                  <FogMenu
                    sharedPartyVision={map?.sharedPartyVision!==false}
                    onSharedPartyVision={enabled=>map&&useStore.getState().setSharedPartyVision(map.id,enabled)}
                    onResetExploration={() => map && useStore.getState().resetExploration(map.id)}
                    explorationMode={map?.explorationMode ?? 'remembered'}
                    onExplorationMode={(mode) => map && useStore.getState().setExplorationMode(map.id, mode)}
                    mapVisionEnabled={usesMapVision(map)}
                    tokenVisionEnabled={map?.tokenVisionEnabled !== false}
                    onToggleVision={(layer) =>
                      map &&
                      setVisionFog(map.id, layer, !(layer === 'map' ? usesMapVision(map) : map.tokenVisionEnabled !== false))
                    }
                    mapFogEnabled={mapFogEnabled}
                    tokenFogEnabled={tokenFogEnabled}
                    paintLayer={paintLayer}
                    fogBrush={fogBrush}
                    brushSize={brushSize}
                    onToggleLayer={toggleLayer}
                    onSetPaintLayer={setPaintLayer}
                    onSetBrush={(b) => setFogBrush(b)}
                    onSetBrushSize={setBrushSize}
                    onCoverAll={() => map && coverFog(map.id, paintLayer)}
                    onRevealAll={() => revealAll(paintLayer)}
                  />
                </>
              )}
            </div>
          </CompactToolbarMenu>
        </>,
        toolSlot,
      )}
    </>
  );
}
