import type { MonsterAppearance } from '../../../shared/monsterAppearance.js';

let listener: ((creature: MonsterAppearance) => void) | undefined;
export function setAssetProductionListener(next: typeof listener) { listener = next; }
/** Queueing must never prevent a creature from being saved or moved. */
export function requestCreatureAsset(creature: MonsterAppearance) {
  try { listener?.(creature); } catch { console.warn('Could not queue creature art; use Retry in token info.'); }
}
