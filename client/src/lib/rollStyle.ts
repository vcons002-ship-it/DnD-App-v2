import type { RollEntry } from '../../../shared/types';

/** Broad category of a roll, derived from its label, for color-coding the log. */
export type RollCategory = 'attack' | 'save' | 'roll';

/** Bucket a roll entry by its label so attacks and saves stand out from
 *  plain dice rolls. Attacks are logged with the label "Attack" and saves
 *  with "<ABILITY> save" (see server/src/combat.ts). */
export function rollCategory(entry: RollEntry): RollCategory {
  const label = entry.label.trim().toLowerCase();
  if (label === 'attack') return 'attack';
  if (label.endsWith('save')) return 'save';
  return 'roll';
}

/** A stable color for a roller, so each character is easy to pick out at a
 *  glance. The DM gets a fixed amber; everyone else is hashed to a hue. */
export function rollerColor(roller: string): string {
  if (roller === 'DM') return '#e0b341';
  let h = 0;
  for (let i = 0; i < roller.length; i++) {
    h = (h * 31 + roller.charCodeAt(i)) >>> 0;
  }
  return `hsl(${h % 360} 62% 64%)`;
}
