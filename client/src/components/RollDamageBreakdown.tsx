import type { RollEntry } from '../../../shared/types';
import { damageRollBreakdown } from '../../../shared/rollBreakdown';

/** Shared by the full history and bottom overlay; the payload is already
 * visibility-shaped by the server. No rerolls, pending results or inference. */
export function RollDamageBreakdown({ entry }: { entry: RollEntry }) {
  const detail = damageRollBreakdown(entry);
  return detail ? <span className="roll-damage-breakdown">{detail}</span> : null;
}
