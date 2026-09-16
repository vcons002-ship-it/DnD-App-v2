import { useId } from 'react';
import type { ResourceSigilPresentation } from '../../../shared/resourceSigils';
import './resource-sigils.css';

/** Small engraved medallion. Semantic labels belong to the containing edit button. */
export function ResourceSigil({ presentation }: { presentation: ResourceSigilPresentation }) {
  const id = useId().replace(/:/g, '');
  const metal = `resource-metal-${id}`;
  const ink = `resource-ink-${id}`;
  const { kind, numeral, initial } = presentation;
  return (
    <svg className={`resource-sigil resource-sigil-${kind}`} viewBox="0 0 36 36" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={metal} x1="0" x2=".7" y1="0" y2="1">
          <stop offset="0" stopColor="#f0d8a3" />
          <stop offset=".28" stopColor="#886136" />
          <stop offset=".54" stopColor="#3b2b1d" />
          <stop offset=".74" stopColor="#ba955d" />
          <stop offset="1" stopColor="#4a3626" />
        </linearGradient>
        <linearGradient id={ink} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#fff1c9" />
          <stop offset="1" stopColor="#bc945b" />
        </linearGradient>
      </defs>
      <path d="M18 1 23 5 29 5 31 12 35 18 31 24 29 31 23 31 18 35 13 31 7 31 5 24 1 18 5 12 7 5 13 5Z" fill={`url(#${metal})`} stroke="#18120d" strokeWidth="1" />
      <path d="M18 5 26 8 30 18 26 28 18 31 10 28 6 18 10 8Z" fill="#151414" stroke="#c2a06a" strokeWidth=".6" />
      <path d="M9 10 18 7 27 10M9 26 18 29 27 26" fill="none" stroke="#795d3e" strokeWidth=".65" />
      <g fill="none" stroke={`url(#${ink})`} strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">
        {kind === 'sorcery' && <><path d="M19 8c2 7-5 7-3 12 2-1 3-3 3-5 7 6 6 12 0 13-7 1-11-5-7-10 0 4 2 4 2 3-1-5 2-7 5-13Z" /><path d="m25 8 .6 2.5L28 11l-2.4.5L25 14l-.6-2.5L22 11l2.4-.5Z" strokeWidth=".7" /></>}
        {kind === 'superiority' && <><path d="m18 7 10 11-10 11L8 18Z" /><path d="m18 7-5 11 5 11 5-11Zm-10 11h20" /><circle cx="18" cy="18" r="1.6" fill="#dbc28c" stroke="none" /></>}
        {kind === 'wind' && <><path d="M8 14h12c5 0 5-6 1-6-2 0-3 1-3 3M6 19h20c5 0 5 7 1 7-2 0-3-1-3-3M10 24h6c5 0 5 6 1 6" /><path d="m9 9 3 1-3 1" strokeWidth=".8" /></>}
        {kind === 'surge' && <><path d="m20 7-11 13h8l-1 10 12-16h-9Z" /><path d="m8 10-2 4m20 13 3-4" strokeWidth=".8" /></>}
        {kind === 'resolve' && <><path d="m18 7 10 4-2 11-8 8-8-8-2-11Z" /><path d="m13 18 4 4 7-10" /></>}
        {kind === 'rage' && <><path d="m9 8 3 21m5-22 1 23m8-22-3 21" strokeWidth="2.4" /><path d="m7 15 22-2M9 23l17-2" strokeWidth=".7" /></>}
        {kind === 'focus' && <><circle cx="18" cy="18" r="9" /><path d="M18 9c-9 2 0 16 0 18 9-2 0-16 0-18Z" /><circle cx="14" cy="15" r="1" fill="#e2ca97" stroke="none" /><circle cx="22" cy="21" r="1" fill="#e2ca97" stroke="none" /></>}
        {kind === 'inspiration' && <><path d="M9 9c2 2 5 3 9 3s7-1 9-3L24 24l-6 5-6-5Z" /><path d="M14 12v12m4-12v15m4-15v9M7 9h6m10 0h6" /></>}
        {kind === 'divinity' && <><circle cx="18" cy="18" r="5" /><path d="M18 6v5m0 14v5M6 18h5m14 0h5M9 9l4 4m10 10 4 4M9 27l4-4m10-10 4-4" /></>}
        {kind === 'nature' && <><path d="M27 8C13 6 5 15 12 24c9 7 17-4 15-16Z" /><path d="m9 29 15-17m-10 8v-5m5 0h5m-10 5h7" /></>}
        {kind === 'healing' && <><path d="M10 27V17c0-2 3-2 3 0v3-10c0-2 3-2 3 0v9-12c0-2 3-2 3 0v12-10c0-2 3-2 3 0v11l3-4c2-2 4 0 2 3l-4 9H13Z" strokeWidth="1.3" /></>}
      </g>
      {(numeral || initial) && <text x="18" y="23" textAnchor="middle" fill={`url(#${ink})`} className="resource-sigil-letter" fontSize={numeral && numeral.length >= 4 ? 11 : numeral && numeral.length >= 3 ? 13 : 17}>{numeral || initial}</text>}
      <path d="m18 2 1.6 2-1.6 1.5L16.4 4Zm0 28.5 1.6 1.5-1.6 2-1.6-2Z" fill="#f0d8a3" />
    </svg>
  );
}
