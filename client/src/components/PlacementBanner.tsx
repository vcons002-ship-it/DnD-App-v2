import type { StateSnapshot } from '../../../shared/types';

/**
 * A small always-visible banner over the map shown while a spawn is armed
 * (tap/click the map to place). Gives an on-screen **cancel** that works on
 * touch, where Esc / re-tapping the side-drawer entry isn't reachable mid-place.
 */
export function PlacementBanner({
  snapshot,
  pending,
  onCancel,
}: {
  snapshot: StateSnapshot;
  pending: { kind: 'pc' | 'monster'; refId: string };
  onCancel: () => void;
}) {
  const name =
    pending.kind === 'pc'
      ? snapshot.characters.find((c) => c.id === pending.refId)?.name
      : snapshot.monsterTemplates.find((m) => m.id === pending.refId)?.name;

  return (
    <div className="place-banner">
      <span className="place-banner-text">
        Placing <strong>{name ?? 'unit'}</strong> — tap the map to drop
        {pending.kind === 'monster' ? ' (place several)' : ''}.
      </span>
      <button className="btn tiny" onClick={onCancel} title="Stop placing (Esc)">
        ✕ Done
      </button>
    </div>
  );
}
