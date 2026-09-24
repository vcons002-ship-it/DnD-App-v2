import { db } from './db.js';
import type { MapState, Monster, Token } from '../../shared/types.js';
import { tokenVisibleAt } from '../../shared/fog.js';

type TagRow = { token_id: string; family: string; prefix: string; number: number };
export const creatureBaseName = (name: string): string =>
  name.replace(/(?:\s+(?:#?\d+|\(\d+\)))+$/, '').trim() || name;

/** Called once per snapshot change-cycle, including when no players are online.
 * Only the active map may allocate tags. All viewers read the same durable rows.
 */
export function encounterTags(map: MapState, tokens: Token[], monsters: Map<string, Monster>, active: boolean): Map<string, string> {
  return db.transaction(() => {
    const rows = db.prepare('SELECT token_id, family, prefix, number FROM encounter_tags WHERE map_id = ?').all(map.id) as TagRow[];
    const tags = new Map(rows.map(r => [r.token_id, `${r.prefix}${r.number}`]));
    const creatures = tokens.filter(t => t.kind === 'monster' && monsters.has(t.refId) && !monsters.get(t.refId)!.objectKind);
    if (active) {
      const mapFog = map.mapFogEnabled ? new Set(map.mapFogRevealed) : null;
      const tokenFog = map.tokenFogEnabled ? new Set(map.tokenFogRevealed) : null;
      const visible = creatures.filter(t => tokenVisibleAt({ role: 'player', hidden: t.isHidden, owned: false,
        foe: monsters.get(t.refId)!.disposition !== 'friendly', mapFog, tokenFog, grid: map.gridSizePx, x: t.x, y: t.y }));
      // Matching DM numbers is safe only at the initial, complete reveal.
      // Never switch numbering schemes after a partial reveal.
      const matchDm = rows.length === 0 && visible.length === creatures.length;
      const groups = new Map<string, Token[]>();
      for (const token of visible.filter(t => !tags.has(t.id))) {
        const family = creatureBaseName(monsters.get(token.refId)!.name).toLocaleLowerCase();
        groups.set(family, [...(groups.get(family) ?? []), token]);
      }
      for (const [family, group] of groups) {
        let prefix = rows.find(r => r.family === family)?.prefix;
        if (!prefix) {
          const letters = family.toUpperCase().replace(/[^A-Z]/g, '') || 'M';
          let length = 1;
          prefix = letters.slice(0, length);
          while (prefix === 'U' || rows.some(r => r.prefix === prefix && r.family !== family)) {
            length++;
            prefix = length <= letters.length ? letters.slice(0, length) : `${letters}${'X'.repeat(length - letters.length)}`;
          }
        }
        const suffixes = group.map(t => Number(/(?:^|\s)#?(\d+)\)?$/.exec(monsters.get(t.refId)!.name)?.[1]));
        const matching = matchDm && suffixes.every(n => Number.isSafeInteger(n) && n > 0) && new Set(suffixes).size === group.length;
        let next = Math.max(0, ...rows.filter(r => r.prefix === prefix).map(r => r.number)) + 1;
        group.forEach((token, i) => {
          const number = matching ? suffixes[i] : next++;
          db.prepare('INSERT INTO encounter_tags (map_id, token_id, family, prefix, number) VALUES (?, ?, ?, ?, ?)')
            .run(map.id, token.id, family, prefix, number);
          rows.push({ token_id: token.id, family, prefix: prefix!, number });
          tags.set(token.id, `${prefix}${number}`);
        });
      }
    }
    for (const token of creatures) if (!tags.has(token.id)) tags.set(token.id, 'U');
    return tags;
  })();
}
