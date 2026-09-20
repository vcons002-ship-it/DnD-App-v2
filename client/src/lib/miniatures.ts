import manifest from '../../public/miniatures/manifest.json';
import type { TokenKind } from '../../../shared/types';

/** A glTF miniature is fitted by its base, never by its weapon or total height. */
export type MiniatureDefinition = {
  id: 'druk' | 'varis' | 'vanec';
  url: string;
  baseDiameter: number;
  /** Native glTF XYZ, Y up; the base's horizontal center and lowest point. */
  baseCenter: [number, number, number];
  fxUrl?: string;
  baseTextureUrl?: string;
};

export const MINIATURES = Object.fromEntries(
  manifest.models.map(model => [model.id, model]),
) as unknown as Record<MiniatureDefinition['id'], MiniatureDefinition>;

/** Existing and newly placed party members use their model automatically.
 * Exact PC names keep similarly named monsters and other portraits untouched.
 */
export function resolveMiniature(name: string, kind: TokenKind): MiniatureDefinition | null {
  if (kind !== 'pc') return null;
  const key = name.trim().toLowerCase();
  return Object.hasOwn(MINIATURES, key) ? MINIATURES[key as MiniatureDefinition['id']] : null;
}
