import { RULES_DIGEST } from './rulesDigest.js';
import { getRulebook } from './rulebook.js';
import { getAllSpells } from '../spells/srd.js';
import { SKILLS } from '../../../shared/skills.js';
import { FEAT_LIBRARY } from '../../../shared/featLibrary.js';

/**
 * The retrieval corpus the rules assistant grounds on. Three tiers, in order of
 * authority:
 *   1. the DM's uploaded rulebook PDF (if any) — AUTHORITATIVE, ranked first;
 *   2. the hand-authored SRD 5.2 (2024) rules digest (rulesDigest.ts);
 *   3. the app's structured data (spells, skills, feats) rendered to prose.
 * Retrieval is dependency-free keyword scoring — robust offline, no embeddings.
 */
export type ChunkSource = 'rulebook' | 'srd' | 'reference';
export type Chunk = { source: ChunkSource; title: string; text: string };

const STOP = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'on', 'is', 'are', 'do', 'does',
  'how', 'what', 'when', 'can', 'i', 'my', 'you', 'it', 'for', 'with', 'at', 'be',
  'if', 'this', 'that', 'as', 'by', 'me', 'we', 'they', 'their', 'his', 'her',
]);

/** Lowercase content words, singular-ish (drop a trailing 's'), 3+ chars. */
function terms(s: string): string[] {
  return (s.toLowerCase().match(/[a-z0-9']+/g) ?? [])
    .filter((w) => w.length >= 3 && !STOP.has(w))
    .map((w) => (w.length > 4 && w.endsWith('s') ? w.slice(0, -1) : w));
}

let baseCache: Chunk[] | null = null;

/** The static tiers (digest + structured data), built once and cached. */
function baseCorpus(): Chunk[] {
  if (baseCache) return baseCache;
  const chunks: Chunk[] = [];
  for (const d of RULES_DIGEST) chunks.push({ source: 'srd', title: d.title, text: d.text });

  // Spells & class abilities (terse one-liners so "what does Fireball do" hits).
  for (const sp of getAllSpells()) {
    const lvl = sp.level === 0 ? 'cantrip' : `level ${sp.level}`;
    const meta = sp.meta ? ` (${sp.meta})` : '';
    chunks.push({
      source: 'reference',
      title: `Spell: ${sp.name}`,
      text: `${sp.name} — ${lvl} ${sp.school ?? ''}${meta}. ${sp.description ?? ''}`.trim(),
    });
  }

  // Skills list (one chunk — the digest covers how checks work).
  chunks.push({
    source: 'reference',
    title: 'Skills and their abilities',
    text:
      'The 18 skills and the ability each uses: ' +
      SKILLS.map((s) => `${s.name} (${s.ability})`).join(', ') + '.',
  });

  // Feats & ASIs from the picker library.
  for (const f of FEAT_LIBRARY) {
    chunks.push({
      source: 'reference',
      title: `Feat: ${f.name}`,
      text: `${f.name} (${f.group}). ${f.description}`,
    });
  }

  baseCache = chunks;
  return chunks;
}

/** The uploaded rulebook's chunks (fresh each call; getRulebook is cached). */
function rulebookChunks(): Chunk[] {
  const doc = getRulebook();
  if (!doc) return [];
  return doc.chunks.map((c) => ({ source: 'rulebook' as const, title: c.title, text: c.text }));
}

function score(chunk: Chunk, q: string[]): number {
  if (q.length === 0) return 0;
  const title = chunk.title.toLowerCase();
  const body = chunk.text.toLowerCase();
  let s = 0;
  for (const t of q) {
    if (title.includes(t)) s += 5; // a title hit is a strong signal
    // count body occurrences (cheap, bounded by chunk size)
    let idx = body.indexOf(t);
    while (idx !== -1) {
      s += 1;
      idx = body.indexOf(t, idx + t.length);
    }
  }
  return s;
}

/**
 * Top chunks for a question. The uploaded rulebook is authoritative, so it gets
 * a score boost AND a guaranteed share of the slots: we fill up to half the
 * budget from matching rulebook chunks first, then the best of everything else.
 */
export function retrieve(question: string, k = 6): Chunk[] {
  const q = terms(question);
  const rank = (chunks: Chunk[], boost = 1) =>
    chunks
      .map((c) => ({ c, s: score(c, q) * boost }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s);

  const book = rank(rulebookChunks(), 1.5);
  const base = rank(baseCorpus());

  const out: Chunk[] = [];
  const bookSlots = Math.min(book.length, Math.ceil(k / 2));
  for (let i = 0; i < bookSlots; i++) out.push(book[i].c);
  for (const { c } of base) {
    if (out.length >= k) break;
    out.push(c);
  }
  // If the book had more strong hits and base didn't fill the budget, top up.
  for (let i = bookSlots; i < book.length && out.length < k; i++) out.push(book[i].c);
  return out;
}

/** Test/diagnostic hook — drop the cached base corpus. */
export function resetCorpusCache(): void {
  baseCache = null;
}
