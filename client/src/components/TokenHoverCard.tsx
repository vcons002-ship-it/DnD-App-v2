import type { StateSnapshot, Token } from '../../../shared/types';
import { resolveToken } from '../lib/entities';
import { presentAuras } from '../lib/conditions';

type Props = {
  snapshot: StateSnapshot;
  token: Token;
  /** Screen position (clientX/clientY) of the cursor. */
  x: number;
  y: number;
};

/** Read-only hover card: name + HP (where visible) + conditions. */
export function TokenHoverCard({ snapshot, token, x, y }: Props) {
  const d = resolveToken(snapshot, token);
  const canSeeHp = d.curHp !== undefined && d.maxHp !== undefined;
  const auras = presentAuras(d.conditions);

  return (
    <div className="hover-card" style={{ left: x + 14, top: y + 14 }}>
      <div className="hover-card-name">{d.name}</div>
      {canSeeHp && (
        <div className="hover-card-hp">
          HP {d.curHp} / {d.maxHp}
          {!!d.tempHp && d.tempHp > 0 && (
            <span className="temp-hp"> +{d.tempHp} temp</span>
          )}
        </div>
      )}
      {d.conditions.length > 0 && (
        <ul className="hover-card-conds">
          {d.conditions.map((c) => (
            <li key={c.id}>
              <span className={`dot ${c.aura}`} />
              {c.label}
              {c.customText ? `: ${c.customText}` : ''}
            </li>
          ))}
        </ul>
      )}
      {!canSeeHp && d.conditions.length === 0 && auras.length === 0 && (
        <div className="muted hover-card-empty">No visible status</div>
      )}
    </div>
  );
}
