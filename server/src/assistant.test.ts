import { describe, it, expect, beforeEach } from 'vitest';
import { retrieve, resetCorpusCache } from './assistant/corpus.js';
import {
  chunkRulebookText,
  chunkRulebookPages,
  __setRulebookForTest,
} from './assistant/rulebook.js';

describe('rules-assistant corpus', () => {
  beforeEach(() => {
    __setRulebookForTest(null); // no uploaded rulebook by default
    resetCorpusCache();
  });

  it('retrieves a relevant SRD digest chunk by keyword', () => {
    const top = retrieve('how does grappling work', 6);
    expect(top.length).toBeGreaterThan(0);
    const blob = top.map((c) => `${c.title} ${c.text}`).join(' ').toLowerCase();
    expect(blob).toContain('grapple');
  });

  it('finds a spell entry from the structured data', () => {
    const top = retrieve('what does fireball do', 6);
    expect(top.some((c) => /fireball/i.test(c.title) || /fireball/i.test(c.text))).toBe(
      true,
    );
  });

  it('ranks the uploaded rulebook above the SRD digest on a conflict', () => {
    __setRulebookForTest({
      name: 'My PHB',
      uploadedAt: 0,
      pages: 1,
      chunks: [
        {
          title: 'Grappling (house rule)',
          text: 'In our table grappling uses a contested Athletics check rather than a saving throw.',
        },
      ],
    });
    const top = retrieve('how does grappling work', 6);
    expect(top[0].source).toBe('rulebook');
    expect(top[0].text).toMatch(/contested Athletics/i);
    // The SRD grapple section is still present for context, just lower.
    expect(top.some((c) => c.source === 'srd' && /grapple/i.test(c.text))).toBe(true);
  });

  it('returns nothing for an off-topic query with no matches', () => {
    expect(retrieve('zzzqqq nonsense token', 6).length).toBe(0);
  });
});

describe('rulebook PDF chunking', () => {
  it('splits prose into titled chunks on headings and size', () => {
    const text =
      'Grappling\n\n' +
      'A grapple requires a free hand and a contested check. '.repeat(40) +
      '\n\nShoving\n\n' +
      'A shove can push or knock prone. '.repeat(5);
    const chunks = chunkRulebookText(text);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    // The first heading titles the chunk that follows it.
    expect(chunks[0].title).toBe('Grappling');
    expect(chunks.some((c) => c.title === 'Shoving')).toBe(true);
    // No chunk should be wildly over the target size.
    for (const c of chunks) expect(c.text.length).toBeLessThan(2500);
  });

  it('returns no chunks for empty text', () => {
    expect(chunkRulebookText('   \n\n  ')).toEqual([]);
  });

  it('records page numbers when chunking per page (for citations)', () => {
    const pages = [
      { num: 11, text: 'Grappling\n\n' + 'A grapple needs a free hand. '.repeat(50) },
      { num: 12, text: '…and the contested check resolves it. '.repeat(10) },
      { num: 13, text: 'Shoving\n\n' + 'A shove can push or knock prone. '.repeat(5) },
    ];
    const chunks = chunkRulebookPages(pages);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    // Every chunk carries a page in the source range.
    for (const c of chunks) {
      expect(typeof c.page).toBe('number');
      expect(c.page).toBeGreaterThanOrEqual(11);
      expect(c.page).toBeLessThanOrEqual(13);
    }
    // The Shoving heading chunk is tagged to its page.
    const shove = chunks.find((c) => c.title === 'Shoving');
    expect(shove?.page).toBe(13);
  });
});
