import { describe, it, expect } from 'vitest';
import { parseLinks, hasLink } from '../../shared/linkify.js';

describe('parseLinks', () => {
  it('linkifies a bare https URL in surrounding text', () => {
    const segs = parseLinks('See https://example.com/map for the battle');
    expect(segs[0]).toEqual({ type: 'text', value: 'See ' });
    expect(segs[1]).toEqual({ type: 'link', label: 'https://example.com/map', url: 'https://example.com/map' });
    expect(segs[2]).toEqual({ type: 'text', value: ' for the battle' });
  });

  it('supports [label](url) markdown links', () => {
    const segs = parseLinks('Open [the tavern map](https://example.com/tavern)!');
    expect(segs[0]).toEqual({ type: 'text', value: 'Open ' });
    expect(segs[1]).toEqual({ type: 'link', label: 'the tavern map', url: 'https://example.com/tavern' });
    expect(segs[2]).toEqual({ type: 'text', value: '!' });
  });

  it('trims trailing sentence punctuation off a bare URL', () => {
    const segs = parseLinks('here: https://example.com.');
    expect(segs.find((s) => s.type === 'link')).toEqual({
      type: 'link',
      label: 'https://example.com',
      url: 'https://example.com',
    });
    expect(segs.at(-1)).toEqual({ type: 'text', value: '.' });
  });

  it('does NOT recognize javascript:/data: or other schemes (no XSS href)', () => {
    for (const bad of ['javascript:alert(1)', 'data:text/html,<script>', 'file:///etc/passwd']) {
      const segs = parseLinks(`click ${bad}`);
      expect(segs.every((s) => s.type === 'text')).toBe(true);
    }
  });

  it('treats plain text (no URL) as a single text segment', () => {
    expect(parseLinks('just a normal message')).toEqual([
      { type: 'text', value: 'just a normal message' },
    ]);
  });

  it('hasLink detects presence of a link', () => {
    expect(hasLink('go to https://x.io')).toBe(true);
    expect(hasLink('no links here')).toBe(false);
    // Stateful-regex guard: a second call must not be thrown off by lastIndex.
    expect(hasLink('no links here')).toBe(false);
  });
});
