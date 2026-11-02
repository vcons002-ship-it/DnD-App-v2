import { useEffect, useRef, useState } from 'react';
import { tokenDistanceFt } from '../../../shared/distance';
import { hasLineOfSight } from '../../../shared/mapWalls';
import { areaExcludesCaster, areaOrigin, tokenInSpellArea, type SpellAreaPlacement } from '../../../shared/spellAreas';
import type { AbilityRollPayload, SpellAreaPreviewIntent, StateSnapshot } from '../../../shared/types';
import { resolveToken } from '../lib/entities';
import { spellCastCost } from '../lib/spellcasting';
import { useStore } from '../state/socket';

type Pt = { x: number; y: number };

export function useSpellTargeting(actionSnapshot: StateSnapshot, map: StateSnapshot['map']) {
  const teleportCast = useStore((s) => s.teleportCast);
  const clearTeleportCast = useStore((s) => s.clearTeleportCast);
  const pendingSpellCost = (payload: AbilityRollPayload) => {
    const caster = (payload.kind === 'pc' ? actionSnapshot.characters : actionSnapshot.monsters).find(
      (c) => c.id === payload.refId,
    );
    const ability =
      caster && 'sheetAbilities' in caster
        ? caster.sheetAbilities.find((a) => a.id === payload.abilityId)
        : undefined;
    return caster && 'sheetAbilities' in caster && ability
      ? spellCastCost(caster, ability, payload.castLevel, payload.slotPool)
      : undefined;
  };
  const [teleportPoint, setTeleportPoint] = useState<Pt | null>(null);
  const teleportActor = teleportCast
    ? actionSnapshot.tokens.find((t) => t.kind === teleportCast.kind && t.refId === teleportCast.refId)
    : undefined;
  useEffect(() => {
    setTeleportPoint(null);
  }, [teleportCast]);
  useEffect(() => {
    if (!teleportCast) return;
    const escape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') clearTeleportCast();
    };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [teleportCast, clearTeleportCast]);
  useEffect(() => {
    if (teleportCast && (!teleportActor || teleportActor.mapId !== map?.id)) clearTeleportCast();
  }, [teleportCast, teleportActor?.id, teleportActor?.mapId, map?.id, clearTeleportCast]);
  const teleportError =
    teleportPoint && teleportActor && map
      ? tokenDistanceFt({ ...teleportActor, widthFt: 0 }, { ...teleportPoint, widthFt: 0 }, map) > 30
        ? 'Choose a destination within 30 ft.'
        : !hasLineOfSight(teleportActor, teleportPoint, map.walls)
          ? 'Choose a destination you can see.'
          : null
      : null;

  const areaSocketId = useStore((s) => s.socket?.id);
  const areaCast = useStore((s) => s.areaCast);
  const clearAreaCast = useStore((s) => s.clearAreaCast);
  const [areaPoints, setAreaPoints] = useState<Pt[]>([]);
  const [areaPointer, setAreaPointer] = useState<Pt | null>(null);
  const [areaAngle, setAreaAngle] = useState(0);
  const [areaDirectionLocked, setAreaDirectionLocked] = useState(false);
  const [areaExcluded, setAreaExcluded] = useState<string[]>([]);
  const areaActor = areaCast
    ? actionSnapshot.tokens.find((t) => t.kind === areaCast.payload.kind && t.refId === areaCast.payload.refId)
    : undefined;

  useEffect(() => {
    setAreaPoints(
      areaCast?.spec.kind === 'emanation' && areaCast.spec.self && areaActor
        ? [{ x: areaActor.x, y: areaActor.y }]
        : [],
    );
    setAreaPointer(null);
    setAreaAngle(0);
    setAreaDirectionLocked(false);
    setAreaExcluded([]);
  }, [areaCast]);
  useEffect(() => {
    if (areaCast && (!areaActor || !map || areaActor.mapId !== map.id)) clearAreaCast();
  }, [areaCast, areaActor?.mapId, map?.id, clearAreaCast]);
  useEffect(() => {
    if (!areaCast) return;
    const escape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') clearAreaCast();
    };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [areaCast, clearAreaCast]);

  const placeSpellArea = (p: Pt) => {
    if (!areaCast || !areaActor) return;
    if (areaCast.spec.self) {
      setAreaPoints([{ x: areaActor.x, y: areaActor.y }]);
      setAreaDirectionLocked(true);
      return;
    }
    if (areaCast.spec.kind === 'line' || areaCast.spec.kind === 'cone') {
      if ((areaCast.spec.count ?? 1) > 1) {
        setAreaPoints((old) => (old.length < (areaCast.spec.count ?? 1) ? [...old, p] : old));
        setAreaDirectionLocked(true);
      } else if (!areaPoints.length) setAreaPoints([p]);
      else setAreaDirectionLocked(true);
    } else if ((areaCast.spec.count ?? 1) > 1)
      setAreaPoints((old) => {
        if (old.length >= (areaCast.spec.count ?? 1)) return old;
        if (areaCast.name.trim().toLowerCase() === 'fire storm' && old.length && map) {
          const grid = (areaCast.spec.sizeFt * map.gridSizePx) / map.feetPerSquare;
          const dx = p.x - old[0].x;
          const dy = p.y - old[0].y;
          const x = Math.round((dx * Math.cos(areaAngle) + dy * Math.sin(areaAngle)) / grid) * grid;
          const y = Math.round((-dx * Math.sin(areaAngle) + dy * Math.cos(areaAngle)) / grid) * grid;
          p = {
            x: old[0].x + x * Math.cos(areaAngle) - y * Math.sin(areaAngle),
            y: old[0].y + x * Math.sin(areaAngle) + y * Math.cos(areaAngle),
          };
        }
        return old.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < 1e-6) ? old : [...old, p];
      });
    else setAreaPoints([p]);
  };

  const areaPlacement: SpellAreaPlacement = { mapId: map?.id ?? '', points: areaPoints, angle: areaAngle };
  const areaPreview =
    areaCast && areaActor
      ? {
          ...areaPlacement,
          points: areaPoints.length
            ? areaPoints
            : areaCast.spec.self
              ? [areaActor]
              : areaPointer
                ? [areaPointer]
                : [],
        }
      : areaPlacement;
  const areaTargets =
    areaCast && areaActor && map
      ? actionSnapshot.tokens.filter((t) => {
          const e = resolveToken(actionSnapshot, t);
          return (
            !t.sharedSightOnly &&
            !e.dead &&
            !(t.kind === 'monster' && actionSnapshot.monsters.find((m) => m.id === t.refId)?.objectKind) &&
            !(areaExcludesCaster(areaCast.spec) && t.id === areaActor.id) &&
            tokenInSpellArea(areaCast.spec, areaPreview, areaActor, t, map.gridSizePx / map.feetPerSquare) &&
            areaPreview.points.some((_, i) =>
              hasLineOfSight(
                areaCast.spec.self
                  ? areaActor
                  : areaOrigin(areaCast.spec, areaPreview, areaActor, map.gridSizePx / map.feetPerSquare, i),
                t,
                map.walls,
              ),
            )
          );
        })
      : [];

  // Send the latest geometry at most every 70 ms while the pointer is moving.
  const areaShareTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestAreaShare = useRef<SpellAreaPreviewIntent | null>(null);
  useEffect(() => {
    const hadPreview = !!latestAreaShare.current;
    latestAreaShare.current = areaCast && areaActor && map ? { ...areaCast.payload, area: areaPreview } : null;
    if (!latestAreaShare.current) {
      if (hadPreview) useStore.getState().shareSpellArea(null);
      if (areaShareTimer.current) clearTimeout(areaShareTimer.current);
      areaShareTimer.current = null;
      return;
    }
    if (!areaShareTimer.current)
      areaShareTimer.current = setTimeout(() => {
        areaShareTimer.current = null;
        if (latestAreaShare.current) useStore.getState().shareSpellArea(latestAreaShare.current);
      }, 70);
  }, [areaCast, areaActor?.x, areaActor?.y, map?.id, areaPoints, areaPointer, areaAngle]);
  useEffect(
    () => () => {
      if (areaShareTimer.current) clearTimeout(areaShareTimer.current);
      useStore.getState().shareSpellArea(null);
    },
    [],
  );

  const areaRangeError =
    areaCast &&
    areaActor &&
    map &&
    !areaCast.spec.self &&
    areaPoints.some(
      (p) =>
        tokenDistanceFt({ ...areaActor, widthFt: 0 }, { ...p, widthFt: 0 }, map) > areaCast.spec.rangeFt + 1e-6 ||
        !hasLineOfSight(areaActor, p, map.walls),
    );

  return {
    teleportCast,
    clearTeleportCast,
    pendingSpellCost,
    teleportPoint,
    setTeleportPoint,
    teleportActor,
    teleportError,
    areaSocketId,
    areaCast,
    clearAreaCast,
    areaPoints,
    setAreaPoints,
    areaPointer,
    setAreaPointer,
    areaAngle,
    setAreaAngle,
    areaDirectionLocked,
    setAreaDirectionLocked,
    areaExcluded,
    setAreaExcluded,
    areaActor,
    placeSpellArea,
    areaPlacement,
    areaPreview,
    areaTargets,
    areaRangeError,
  };
}
