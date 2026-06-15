// Parse chat text into plain-text and link segments so the UI can render safe,
// clickable links. Framework-free so it's unit-tested server-side; the client
// renders the segments. SECURITY: only http(s) URLs are recognized — never raw
// HTML and never other schemes (no `javascript:`/`data:`), so a chat message
// can't inject markup or a scripted href.

export type LinkSegment =
  | { type: 'text'; value: string }
  | { type: 'link'; label: string; url: string };

// A markdown link [label](https://…) OR a bare https?:// URL.
const PATTERN = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<>"'`]+)/g;

export function parseLinks(text: string): LinkSegment[] {
  const out: LinkSegment[] = [];
  let last = 0;
  for (const m of text.matchAll(PATTERN)) {
    const idx = m.index ?? 0;
    if (idx > last) out.push({ type: 'text', value: text.slice(last, idx) });
    if (m[2]) {
      // [label](url)
      out.push({ type: 'link', label: m[1], url: m[2] });
    } else {
      // Bare URL — trim trailing sentence punctuation that isn't part of it.
      let url = m[3];
      const trail = url.match(/[.,!?;:)\]}]+$/)?.[0] ?? '';
      if (trail) url = url.slice(0, url.length - trail.length);
      out.push({ type: 'link', label: url, url });
      if (trail) out.push({ type: 'text', value: trail });
    }
    last = idx + m[0].length;
  }
  if (last < text.length) out.push({ type: 'text', value: text.slice(last) });
  return out.length ? out : [{ type: 'text', value: text }];
}

/** Does the text contain at least one recognizable link? */
export function hasLink(text: string): boolean {
  PATTERN.lastIndex = 0;
  return PATTERN.test(text);
}
