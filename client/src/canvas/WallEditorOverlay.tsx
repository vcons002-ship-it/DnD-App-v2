import { Circle, Group, Line, Path, Rect, Text } from 'react-konva';
import { doorInteractionArea } from '../../../shared/doorInteraction';
import type { MapWall } from '../../../shared/mapWalls';
import { fogVisionContains, usesTokenVision } from '../../../shared/playerVision';
import type { StateSnapshot, Token } from '../../../shared/types';
import { wallBoundarySegments, wallCenter, wallSvgPath, wallVertices } from '../../../shared/wallGeometry';
import { ObjectControls } from '../components/ObjectControls';
import type { WallTool } from '../components/WallMenu';
import { useStore } from '../state/socket';

type Pt = { x: number; y: number };

export function WallAndDoorKonvaGroup({
  wallActive,
  wallTool,
  map,
  wallPreview,
  featureSelection,
  viewScale,
  wallAnchor,
  wallPointer,
  strokeWall,
  selectedWall,
  rotationHandle,
  doors,
  doorVisible,
  actualDm,
  sourceSnapshot,
  snapshot,
  doorDragPreview,
  nearbyDoors,
  pxPerFoot,
  renderPlayerVision,
  openDoorControls,
  notify,
}: {
  wallActive: boolean;
  wallTool: WallTool;
  map: StateSnapshot['map'];
  wallPreview: MapWall | null;
  featureSelection: string[];
  viewScale: number;
  wallAnchor: Pt | null;
  wallPointer: Pt | null;
  strokeWall: (a: Pt, b: Pt) => MapWall;
  selectedWall: MapWall | undefined;
  rotationHandle: (w: MapWall) => Pt;
  doors: MapWall[];
  doorVisible: (door: MapWall) => boolean;
  actualDm: boolean;
  sourceSnapshot: StateSnapshot;
  snapshot: StateSnapshot;
  doorDragPreview: { tokenId: string; ids: string[] } | null;
  nearbyDoors: MapWall[];
  pxPerFoot: number;
  renderPlayerVision: boolean;
  openDoorControls: (id: string) => void;
  notify: (msg: string) => void;
}) {
  return (
    <>
      {wallActive && (
        <Group name="wall-edit-outlines" listening={false}>
          {(map?.walls ?? []).map((original) => {
            const w = wallPreview?.id === original.id ? wallPreview : original;
            const selected = featureSelection.includes(`wall:${w.id}`);
            return (
              <Path
                key={w.id}
                name="wall-edit-piece"
                wallId={w.id}
                featureSelected={selected}
                data={wallSvgPath(w)}
                fillRule="evenodd"
                stroke={selected ? '#6ee7ff' : w.arch ? '#f64fe0' : w.window ? '#398cff' : '#ffc76e'}
                fill={
                  selected
                    ? '#6ee7ff35'
                    : w.arch
                      ? '#f64fe040'
                      : w.window
                        ? '#398cff55'
                        : w.kind || w.thickness
                          ? '#ffc76e25'
                          : undefined
                }
                strokeWidth={(selected ? 3 : 2) / viewScale}
              />
            );
          })}
          {wallTool === 'edit' &&
            (map?.environment?.lights ?? []).map((light, i) => (
              <Group
                key={light.id}
                name="light-edit-marker"
                lightId={light.id}
                featureSelected={featureSelection.includes(`light:${light.id}`)}
                x={light.x}
                y={light.y}
              >
                <Circle
                  radius={10 / viewScale}
                  fill={featureSelection.includes(`light:${light.id}`) ? '#6ee7ff' : '#ffbf65'}
                  stroke="#152230"
                  strokeWidth={2 / viewScale}
                />
                <Text
                  text={String(i + 1)}
                  x={-10 / viewScale}
                  y={-6 / viewScale}
                  width={20 / viewScale}
                  align="center"
                  fontSize={12 / viewScale}
                  fill="#142331"
                />
              </Group>
            ))}
          {wallAnchor &&
            wallPointer &&
            (wallTool === 'erase-area' ? (
              <Rect
                name="wall-erase-preview"
                x={Math.min(wallAnchor.x, wallPointer.x)}
                y={Math.min(wallAnchor.y, wallPointer.y)}
                width={Math.abs(wallPointer.x - wallAnchor.x)}
                height={Math.abs(wallPointer.y - wallAnchor.y)}
                fill="#ff667733"
                stroke="#ff6677"
                strokeWidth={2 / viewScale}
                dash={[8 / viewScale, 5 / viewScale]}
              />
            ) : wallTool === 'door' ? (
              <Line
                points={[wallAnchor.x, wallAnchor.y, wallPointer.x, wallPointer.y]}
                stroke="#fff1c2"
                strokeWidth={3 / viewScale}
                dash={[8 / viewScale, 5 / viewScale]}
              />
            ) : (
              <Path
                data={wallSvgPath(strokeWall(wallAnchor, wallPointer))}
                fillRule="evenodd"
                stroke="#fff1c2"
                fill="#ffe5b333"
                strokeWidth={2 / viewScale}
                dash={[8 / viewScale, 5 / viewScale]}
              />
            ))}
          {wallTool === 'edit' && selectedWall && (
            <Group name="wall-rotation-control">
              <Line
                points={[
                  wallCenter(selectedWall).x,
                  wallCenter(selectedWall).y,
                  rotationHandle(selectedWall).x,
                  rotationHandle(selectedWall).y,
                ]}
                stroke="#6ee7ff"
                strokeWidth={1 / viewScale}
                dash={[5 / viewScale, 4 / viewScale]}
              />
              <Circle
                name="wall-rotation-handle"
                x={rotationHandle(selectedWall).x}
                y={rotationHandle(selectedWall).y}
                radius={8 / viewScale}
                fill="#142833"
                stroke="#6ee7ff"
                strokeWidth={2 / viewScale}
              />
            </Group>
          )}
          {wallPointer && wallTool !== 'edit' && (
            <Circle
              x={wallPointer.x}
              y={wallPointer.y}
              radius={4 / viewScale}
              fill={wallTool === 'erase' || wallTool === 'erase-area' ? '#ff6677' : '#fff1c2'}
            />
          )}
        </Group>
      )}
      {doors.filter(doorVisible).map((d) => {
        const doorSnapshot = actualDm ? sourceSnapshot : snapshot;
        const token = doorSnapshot.tokens.find((t) => t.id === d.tokenId);
        const object = doorSnapshot.monsters.find((m) => m.id === token?.refId);
        const locked = !!object?.conditions.some((c) => c.label.toLowerCase() === 'locked');
        const hidden = !!token?.isHidden;
        const previewed = !!doorDragPreview?.ids.includes(d.id);
        const approached = nearbyDoors.some((door) => door.id === d.id);
        const color = previewed
          ? '#78e6ff'
          : hidden
            ? '#a2a8b1'
            : locked
              ? '#efb05f'
              : d.open
                ? '#94d6b0'
                : '#f1d49c';
        const label = hidden ? 'Hidden' : locked ? 'Locked' : d.open ? 'Open' : 'Door';
        // One full-width line on each outer face. The ordinary vision
        // mask hides the far face of a closed door, including in daylight.
        const pad = 2 / viewScale;
        let faces: number[][];
        if (d.kind === 'rectangle' && !d.rotation) {
          const x0 = Math.min(d.ax, d.bx);
          const x1 = Math.max(d.ax, d.bx);
          const y0 = Math.min(d.ay, d.by);
          const y1 = Math.max(d.ay, d.by);
          faces =
            x1 - x0 >= y1 - y0
              ? [
                  [x0, y0 - pad, x1, y0 - pad],
                  [x0, y1 + pad, x1, y1 + pad],
                ]
              : [
                  [x0 - pad, y0, x0 - pad, y1],
                  [x1 + pad, y0, x1 + pad, y1],
                ];
        } else {
          faces = wallBoundarySegments(d).map(({ a, b }) => [a.x, a.y, b.x, b.y]);
        }
        const activate = () => {
          if (actualDm || nearbyDoors.some((door) => door.id === d.id)) openDoorControls(d.id);
          else
            notify(
              'Move your character’s footprint within 5 ft of this door’s approach area to open it or pick its lock.',
            );
        };
        return (
          <Group
            key={d.id}
            name="wall-door-marker"
            doorId={d.id}
            doorState={label}
            doorPreview={previewed}
            opacity={hidden ? 0.45 : 1}
            listening={!wallActive}
            onMouseDown={(e) => {
              e.cancelBubble = true;
            }}
            onTouchStart={(e) => {
              e.cancelBubble = true;
            }}
            onClick={(e) => {
              e.cancelBubble = true;
              activate();
            }}
            onTap={(e) => {
              e.cancelBubble = true;
              activate();
            }}
          >
            <Line
              name="door-approach-area"
              points={wallVertices(doorInteractionArea(d, pxPerFoot)).flatMap((p) => [p.x, p.y])}
              closed
              listening={false}
              stroke={color}
              strokeWidth={(previewed ? 2 : 1) / viewScale}
              dash={[5 / viewScale, 4 / viewScale]}
              opacity={previewed ? 0.85 : approached ? 0.6 : 0.25}
              fill={previewed ? '#78e6ff20' : approached ? '#f1d49c15' : undefined}
            />
            {faces
              .filter(
                (points) =>
                  !renderPlayerVision ||
                  d.open ||
                  (() => {
                    const dx = points[2] - points[0];
                    const dy = points[3] - points[1];
                    const l = Math.hypot(dx, dy) || 1;
                    const mx = (points[0] + points[2]) / 2;
                    const my = (points[1] + points[3]) / 2;
                    return [
                      { x: mx - (dy / l) * 0.1, y: my + (dx / l) * 0.1 },
                      { x: mx + (dy / l) * 0.1, y: my - (dx / l) * 0.1 },
                    ].some((p) => fogVisionContains(snapshot.playerVision, p.x, p.y, usesTokenVision(map)));
                  })(),
              )
              .map((points, i) => (
                <Line
                  key={i}
                  name="wall-door-face"
                  points={points}
                  stroke={color}
                  strokeWidth={(previewed ? 6 : 4) / viewScale}
                  shadowColor={previewed ? '#78e6ff' : undefined}
                  shadowBlur={previewed ? 8 / viewScale : 0}
                  hitStrokeWidth={16 / viewScale}
                  lineCap="butt"
                  dash={d.open || hidden ? [7 / viewScale, 5 / viewScale] : undefined}
                />
              ))}
          </Group>
        );
      })}
    </>
  );
}

export function WallAndDoorHud({
  wallActive,
  wallTool,
  setWallTool,
  setWallAnchor,
  wallThickness,
  setWallThickness,
  selectedWall,
  featureSelection,
  deleteFeatures,
  map,
  doorDragPreview,
  doors,
  activeDoorControls,
  dismissDoorControls,
  actualDm,
  sourceSnapshot,
  snapshot,
  onSelectToken,
  operateDoor,
}: {
  wallActive: boolean;
  wallTool: WallTool;
  setWallTool: (t: WallTool) => void;
  setWallAnchor: (p: Pt | null) => void;
  wallThickness: number;
  setWallThickness: (n: number) => void;
  selectedWall: MapWall | undefined;
  featureSelection: string[];
  deleteFeatures: () => void;
  map: StateSnapshot['map'];
  doorDragPreview: { tokenId: string; ids: string[] } | null;
  doors: MapWall[];
  activeDoorControls: MapWall[];
  dismissDoorControls: () => void;
  actualDm: boolean;
  sourceSnapshot: StateSnapshot;
  snapshot: StateSnapshot;
  onSelectToken: (token: Token | null, additive?: boolean) => void;
  operateDoor: (id: string, open: boolean) => void;
}) {
  return (
    <>
      {!wallActive && doorDragPreview && doorDragPreview.ids.length > 0 && (
        <div
          data-testid="door-preview-hint"
          role="status"
          style={{
            position: 'absolute',
            bottom: 92,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 5,
            padding: '9px 14px',
            background: '#102633ee',
            border: '1px solid #78e6ff',
            borderRadius: 6,
            color: '#c7f5ff',
            pointerEvents: 'none',
          }}
        >
          Release to interact · {doorDragPreview.ids.map((id) => `Door ${doors.findIndex((d) => d.id === id) + 1}`).join(', ')}
        </div>
      )}
      {!wallActive && activeDoorControls.length > 0 && !doorDragPreview && (
        <section data-testid="door-controls" className="nearby-door-controls" role="region" aria-label="Door controls">
          <header>
            <strong>Door controls</strong>
            <button
              className="btn tiny"
              aria-label="Close door controls"
              title="Close — click a nearby door or leave and return to reopen"
              onClick={dismissDoorControls}
            >
              ×
            </button>
          </header>
          <div className="nearby-door-list">
            {activeDoorControls.map((d) => {
              const doorSnapshot = actualDm ? sourceSnapshot : snapshot;
              const token = doorSnapshot.tokens.find((t) => t.id === d.tokenId);
              return (
                <div className="nearby-door" key={d.id}>
                  <strong>Door {doors.indexOf(d) + 1}</strong>
                  {token ? (
                    <>
                      <ObjectControls snapshot={doorSnapshot} token={token} editable={actualDm} compact />
                      {actualDm && (
                        <button className="btn tiny" onClick={() => onSelectToken(token)}>
                          Door details
                        </button>
                      )}
                    </>
                  ) : (
                    <button className="btn" onClick={() => operateDoor(d.id, !d.open)}>
                      {d.open ? 'Close' : 'Open'} door
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}
      {wallActive && (
        <div
          data-testid="wall-drawing-hint"
          style={{
            position: 'absolute',
            bottom: 88,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 5,
            background: '#161b23ee',
            color: '#ffe5b3',
            padding: '8px 12px',
            border: '1px solid #aa8550',
            borderRadius: 6,
            fontSize: 13,
            display: 'flex',
            gap: 10,
            alignItems: 'center',
            maxWidth: 'calc(100% - 32px)',
            flexWrap: 'wrap',
          }}
        >
          <span>
            {wallTool === 'erase-area'
              ? 'Drag a rectangle to erase only that section. Doors are kept.'
              : wallTool === 'rectangle'
                ? 'Drag across the wall’s length and thickness'
                : wallTool === 'door'
                  ? 'Drag along a wall to cut a door opening'
                  : wallTool === 'draw'
                    ? 'Drag a line at any angle'
                    : wallTool === 'circle'
                      ? 'Drag from the room center to its wall'
                      : wallTool === 'freehand'
                        ? 'Hold and trace the wall; release to save'
                        : wallTool === 'edit'
                          ? 'Click to select · Shift/Ctrl-click to add · Ctrl-drag a box · Delete to remove · Ctrl+Z to undo'
                          : 'Click a wall to delete the entire piece'}
          </span>
          {['draw', 'circle', 'freehand'].includes(wallTool) && (
            <label>
              Thickness{' '}
              <input
                aria-label="Wall thickness in feet"
                type="number"
                min={0.1}
                max={20}
                step={0.25}
                value={wallThickness}
                onChange={(e) => setWallThickness(Math.max(0.1, Math.min(20, Number(e.target.value) || 0.1)))}
                style={{ width: 55 }}
              />{' '}
              ft
            </label>
          )}
          {wallTool === 'edit' && selectedWall && (
            <>
              <label>
                Rotation{' '}
                <input
                  aria-label="Wall rotation in degrees"
                  type="number"
                  min={-360}
                  max={360}
                  step={1}
                  value={Math.round(selectedWall.rotation ?? 0)}
                  onChange={(e) => {
                    const rotation = Number(e.target.value);
                    if (Number.isFinite(rotation) && map)
                      useStore
                        .getState()
                        .editMapWalls(map.id, { update: { ...selectedWall, rotation: Math.max(-360, Math.min(360, rotation)) } });
                  }}
                  style={{ width: 62 }}
                />{' '}
                degrees
              </label>
            </>
          )}
          {wallTool === 'edit' && featureSelection.length > 0 && (
            <button data-testid="delete-map-features" className="btn tiny" onClick={deleteFeatures}>
              Delete {featureSelection.length} selected
            </button>
          )}
          <button
            className="btn tiny"
            onClick={() => {
              setWallTool('off');
              setWallAnchor(null);
            }}
          >
            Done
          </button>
        </div>
      )}
    </>
  );
}
