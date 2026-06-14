import fs from 'node:fs';
import { PDFParse } from 'pdf-parse';
import { config } from '../config.js';

/**
 * An uploaded rulebook PDF, parsed once into retrievable text chunks and
 * persisted to disk (data/rulebook.json) so it survives restarts. The DM's own
 * rulebook is AUTHORITATIVE — corpus.ts ranks its chunks above the bundled SRD
 * digest and structured data, and the assistant is told to prefer it on any
 * conflict. App-wide (not per session), mirroring the settings file.
 */
export type RulebookChunk = { title: string; text: string; page?: number; pageEnd?: number };
export type RulebookDoc = {
  name: string;
  uploadedAt: number;
  pages: number;
  chunks: RulebookChunk[];
};

let cache: RulebookDoc | null | undefined; // undefined = not yet loaded from disk

/** Test hook: install a rulebook doc in memory without parsing a PDF. */
export function __setRulebookForTest(doc: RulebookDoc | null): void {
  cache = doc;
}

/** Lazily load the persisted rulebook (cached in memory after first read). */
export function getRulebook(): RulebookDoc | null {
  if (cache !== undefined) return cache;
  try {
    cache = JSON.parse(fs.readFileSync(config.rulebookPath, 'utf8')) as RulebookDoc;
  } catch {
    cache = null; // none uploaded yet
  }
  return cache;
}

/** Lightweight info for the Settings UI (never ships the full text). */
export function rulebookInfo(): { name: string; uploadedAt: number; pages: number; chunks: number } | null {
  const doc = getRulebook();
  return doc
    ? { name: doc.name, uploadedAt: doc.uploadedAt, pages: doc.pages, chunks: doc.chunks.length }
    : null;
}

/** All chunks (for the toolbar reader/search). null if none uploaded. */
export function getRulebookChunks(): { name: string; chunks: RulebookChunk[] } | null {
  const doc = getRulebook();
  return doc ? { name: doc.name, chunks: doc.chunks } : null;
}

/** Remove the uploaded rulebook (revert to SRD + app data only). */
export function clearRulebook(): void {
  cache = null;
  try {
    fs.rmSync(config.rulebookPath, { force: true });
  } catch {
    /* nothing to remove */
  }
}

/**
 * Split extracted PDF prose into ~1 KB retrievable chunks on paragraph
 * boundaries, titling each chunk by a best-effort heading (a short or
 * ALL-CAPS leading line) so retrieval and the prompt stay readable.
 */
export function chunkRulebookText(text: string): RulebookChunk[] {
  const TARGET = 1100; // chars per chunk (≈ a few short paragraphs)
  // Normalise whitespace; PDFs often carry page-break artifacts and hard wraps.
  const paras = text
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .split(/\n{2,}/)
    .map((p) => p.replace(/\n/g, ' ').replace(/\s{2,}/g, ' ').trim())
    .filter((p) => p.length > 1);

  const chunks: RulebookChunk[] = [];
  let buf = '';
  let heading = 'Rulebook';
  const looksLikeHeading = (p: string) =>
    p.length <= 60 && !/[.!?]$/.test(p) && /[A-Za-z]/.test(p);

  const flush = () => {
    const t = buf.trim();
    if (t) chunks.push({ title: heading.slice(0, 80), text: t });
    buf = '';
  };

  for (const p of paras) {
    if (looksLikeHeading(p)) {
      // A heading starts a fresh chunk and labels what follows.
      if (buf.trim()) flush();
      heading = p;
      continue;
    }
    buf += (buf ? ' ' : '') + p;
    if (buf.length >= TARGET) flush();
  }
  flush();
  return chunks;
}

/**
 * Page-aware chunker: same packing as chunkRulebookText, but fed per-page so each
 * chunk records the page (range) it came from — used to cite sources back to the
 * DM. Walks pages in order, carrying the buffer across page breaks.
 */
export function chunkRulebookPages(
  pages: { num: number; text: string }[],
): RulebookChunk[] {
  const TARGET = 1100;
  const chunks: RulebookChunk[] = [];
  let buf = '';
  let heading = 'Rulebook';
  let startPage = pages[0]?.num ?? 1;
  let curPage = startPage;
  const looksLikeHeading = (p: string) =>
    p.length <= 60 && !/[.!?]$/.test(p) && /[A-Za-z]/.test(p);
  const flush = () => {
    const t = buf.trim();
    if (t) chunks.push({ title: heading.slice(0, 80), text: t, page: startPage, pageEnd: curPage });
    buf = '';
  };
  for (const pg of pages) {
    curPage = pg.num;
    const paras = pg.text
      .replace(/\r/g, '')
      .split(/\n{2,}/)
      .map((p) => p.replace(/\n/g, ' ').replace(/\s{2,}/g, ' ').trim())
      .filter((p) => p.length > 1);
    for (const p of paras) {
      if (looksLikeHeading(p)) {
        if (buf.trim()) flush();
        heading = p;
        startPage = pg.num;
        continue;
      }
      if (!buf) startPage = pg.num;
      buf += (buf ? ' ' : '') + p;
      if (buf.length >= TARGET) flush();
    }
  }
  flush();
  return chunks;
}

/**
 * Parse an uploaded PDF buffer, chunk it, and persist as the active rulebook.
 * Returns the new info, or null on failure (callers degrade to SRD + app data).
 */
export async function setRulebookFromPdf(
  buffer: Buffer,
  name: string,
): Promise<{ name: string; uploadedAt: number; pages: number; chunks: number } | null> {
  let pageTexts: { num: number; text: string }[] = [];
  let fullText = '';
  let pages = 0;
  try {
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      fullText = result.text ?? '';
      pageTexts = (result.pages ?? []).map((p) => ({ num: p.num, text: p.text ?? '' }));
      pages = result.total ?? pageTexts.length;
    } finally {
      await parser.destroy();
    }
  } catch (err) {
    console.warn('  [rulebook] PDF parse failed:', (err as Error).message);
    return null;
  }
  // Prefer per-page chunking (records page numbers); fall back to the flat text.
  const chunks = pageTexts.length
    ? chunkRulebookPages(pageTexts)
    : chunkRulebookText(fullText);
  if (chunks.length === 0) {
    console.warn('  [rulebook] no extractable text (scanned/image-only PDF?)');
    return null;
  }
  const doc: RulebookDoc = {
    name: name.slice(0, 200),
    uploadedAt: Date.now(),
    pages,
    chunks,
  };
  try {
    fs.writeFileSync(config.rulebookPath, JSON.stringify(doc));
  } catch (err) {
    console.warn('  [rulebook] could not persist:', (err as Error).message);
    return null;
  }
  cache = doc;
  return { name: doc.name, uploadedAt: doc.uploadedAt, pages: doc.pages, chunks: doc.chunks.length };
}
