import { memo } from 'react';
import type { StateSnapshot } from '../../../shared/types';
import { resolveToken } from '../lib/entities';
import { useStore } from '../state/socket';
import { SpellAreaShapes } from './SpellAreaShapes';
import type { useSpellTargeting } from './useSpellTargeting';

/** Other casters' live spell-area aims (~14 updates/s each while aiming).
 *  Subscribed here so those packets re-render only this layer, not the map. */
export const SharedSpellAreas = memo(function SharedSpellAreas({
  mapId,
  hideId,
  scale,
  pxPerFoot,
}: {
  mapId: string;
  hideId: string | undefined;
  scale: number;
  pxPerFoot: number;
}) {
  const previews = useStore((s) => s.spellAreaPreviews);
  return (
    <>
      {Object.values(previews)
        .filter((p) => !p.resolving && p.area.mapId === mapId && p.id !== hideId)
        .map((p) => (
          <SpellAreaShapes
            key={p.id}
            spellName={p.name}
            previewState="aiming"
            scale={scale}
            spec={p.spec}
            placement={p.area}
            caster={p.caster}
            pxPerFoot={pxPerFoot}
            targets={[]}
          />
        ))}
    </>
  );
});

export function SpellTargetingPrompts({
  targeting,
  actionSnapshot,
  map,
  actualDm,
}: {
  targeting: ReturnType<typeof useSpellTargeting>;
  actionSnapshot: StateSnapshot;
  map: StateSnapshot['map'];
  actualDm: boolean;
}) {
  const {
    teleportCast,
    clearTeleportCast,
    pendingSpellCost,
    teleportPoint,
    teleportError,
    areaCast,
    clearAreaCast,
    areaPoints,
    setAreaPoints,
    areaAngle,
    setAreaAngle,
    areaDirectionLocked,
    setAreaDirectionLocked,
    areaExcluded,
    setAreaExcluded,
    areaActor,
    areaPlacement,
    areaTargets,
    areaRangeError,
  } = targeting;

  return (
    <>
      {teleportCast && (
        <div
          className="save-resolve-banner spell-area-prompt"
          role="region"
          aria-label="Misty Step destination"
          style={{ zIndex: 30 }}
        >
          <strong>Misty Step · 30 ft</strong>
          <span>Click a visible, unoccupied destination. No slot is spent until you confirm the cast below.</span>
          {teleportError && <span role="alert">{teleportError}</span>}
          <button
            className="btn"
            disabled={!teleportPoint || !!teleportError || pendingSpellCost(teleportCast)?.unavailable}
            onClick={() => {
              if (teleportPoint && map)
                useStore.getState().rollAbility({ ...teleportCast, destination: { mapId: map.id, ...teleportPoint } });
              clearTeleportCast();
            }}
          >
            Cast Misty Step · {pendingSpellCost(teleportCast)?.label}
          </button>
          <button className="btn" onClick={clearTeleportCast}>
            Cancel (Esc)
          </button>
        </div>
      )}
      {areaCast && areaActor && map && (
        <div
          className="save-resolve-banner spell-area-prompt"
          role="region"
          aria-label="Place spell area"
          style={{ flexWrap: 'wrap', maxWidth: 'min(760px,calc(100% - 30px))', zIndex: 30, borderColor: '#e0be6b' }}
        >
          <strong>
            {areaCast.name} · {areaCast.spec.sizeFt} ft{' '}
            {['sphere', 'cylinder', 'emanation'].includes(areaCast.spec.kind) ? 'radius' : areaCast.spec.kind}
          </strong>
          <span>
            {areaCast.repeat
              ? 'Repeat use · no additional spell slot.'
              : `${pendingSpellCost(areaCast.payload)?.label ?? 'Spell casting'} · no slot is spent until you confirm this area.`}
          </span>
          <span>
            {areaCast.name.toLowerCase() === 'pass without trace'
              ? 'Choose allies to share your moving Stealth aura.'
              : areaCast.spec.self
                ? 'Aim, then click to lock the direction.'
                : ['line', 'cone'].includes(areaCast.spec.kind)
                  ? 'Click a start, then aim and click again to lock the direction.'
                  : `Click to place${areaCast.spec.count ? ` up to ${areaCast.spec.count} areas` : ''}.`}{' '}
            Overlapping combat footprints are affected; allies can be hit.
            {areaCast.spec.ongoing ? ' Ongoing effects are resolved with the DM.' : ''}
          </span>
          {areaRangeError && (
            <span role="alert">Choose an origin within {areaCast.spec.rangeFt} ft and outside Total Cover.</span>
          )}
          <span>
            {areaTargets.filter((t) => !areaExcluded.includes(t.id)).length}{' '}
            {actualDm ? 'targets' : 'visible targets'}
            {areaCast.spec.maxTargets ? ` / choose up to ${areaCast.spec.maxTargets}` : ''}
          </span>
          {areaCast.spec.selective && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {areaTargets.map((t) => {
                const e = resolveToken(actionSnapshot, t);
                return (
                  <label key={t.id}>
                    <input
                      type="checkbox"
                      checked={!areaExcluded.includes(t.id)}
                      onChange={() =>
                        setAreaExcluded((old) =>
                          old.includes(t.id) ? old.filter((id) => id !== t.id) : [...old, t.id],
                        )
                      }
                    />
                    {e.name}
                    {t.revealTag && t.revealTag !== 'U' ? ` ${t.revealTag}` : ''}
                  </label>
                );
              })}
            </div>
          )}
          {['cube', 'line', 'cone'].includes(areaCast.spec.kind) && (
            <label>
              Direction{' '}
              <input
                aria-label="Spell area rotation"
                type="range"
                min="-180"
                max="180"
                step="1"
                value={(areaAngle * 180) / Math.PI}
                onChange={(e) => {
                  const next = (+e.target.value * Math.PI) / 180;
                  const delta = next - areaAngle;
                  if (areaCast.name.trim().toLowerCase() === 'fire storm')
                    setAreaPoints((old) =>
                      old.map((p) => {
                        const anchor = old[0];
                        const dx = p.x - anchor.x;
                        const dy = p.y - anchor.y;
                        return {
                          x: anchor.x + dx * Math.cos(delta) - dy * Math.sin(delta),
                          y: anchor.y + dx * Math.sin(delta) + dy * Math.cos(delta),
                        };
                      }),
                    );
                  setAreaAngle(next);
                  setAreaDirectionLocked(true);
                }}
              />
            </label>
          )}
          <button
            className="btn tiny"
            disabled={
              (!areaCast.repeat && pendingSpellCost(areaCast.payload)?.unavailable) ||
              !areaPoints.length ||
              !!areaRangeError ||
              (!!areaCast.spec.maxTargets &&
                areaTargets.filter((t) => !areaExcluded.includes(t.id)).length > areaCast.spec.maxTargets) ||
              (['line', 'cone'].includes(areaCast.spec.kind) && !areaDirectionLocked)
            }
            onClick={() => {
              const placement = {
                ...areaPlacement,
                ...(areaCast.spec.selective
                  ? { selected: areaTargets.filter((t) => !areaExcluded.includes(t.id)).map((t) => t.id) }
                  : {}),
              };
              if (areaCast.repeat) useStore.getState().repeatSpell({ ...areaCast.repeat, area: placement });
              else useStore.getState().rollAbility({ ...areaCast.payload, area: placement });
              clearAreaCast();
            }}
          >
            Confirm area ·{' '}
            {areaCast.repeat ? 'Repeat · no slot' : `Cast · ${pendingSpellCost(areaCast.payload)?.label ?? areaCast.name}`}
          </button>
          <button
            className="btn tiny"
            onClick={() => {
              setAreaPoints((old) => old.slice(0, -1));
              setAreaDirectionLocked(false);
            }}
          >
            Undo placement
          </button>
          <button className="btn tiny" onClick={clearAreaCast}>
            Cancel (Esc)
          </button>
        </div>
      )}
    </>
  );
}
