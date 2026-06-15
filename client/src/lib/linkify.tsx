import type { ReactNode } from 'react';
import { parseLinks } from '../../../shared/linkify';

/**
 * Render chat text with clickable links. Plain text stays text (React escapes
 * it); recognized http(s) URLs and [label](url) markdown become safe anchors
 * that open in a new tab. No raw HTML is ever rendered.
 */
export function linkify(text: string): ReactNode[] {
  return parseLinks(text).map((seg, i) =>
    seg.type === 'link' ? (
      <a
        key={i}
        className="chat-link"
        href={seg.url}
        target="_blank"
        rel="noopener noreferrer"
        // Don't let a click bubble into chat/selection handlers.
        onClick={(e) => e.stopPropagation()}
      >
        {seg.label}
      </a>
    ) : (
      <span key={i}>{seg.value}</span>
    ),
  );
}
