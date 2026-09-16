import { useId } from 'react';

/** Engraved, beveled metal; the accessible AC value remains ordinary text. */
export function ArmorClassBadge({ value }: { value: number }) {
  const id = useId();
  return (
    <div className="hud-armor" aria-label={`Armor Class ${value}`} title="Armor Class">
      <svg className="hud-shield-art" viewBox="0 0 44 54" aria-hidden="true">
        <defs>
          <linearGradient id={`${id}-rim`} x1="0" y1="0" x2=".8" y2="1">
            <stop stopColor="#f4dfb3" />
            <stop offset=".23" stopColor="#b59a6b" />
            <stop offset=".48" stopColor="#504330" />
            <stop offset=".7" stopColor="#dcc492" />
            <stop offset="1" stopColor="#69543b" />
          </linearGradient>
          <linearGradient id={`${id}-steel`} x1="0" y1="0" x2="1" y2=".9">
            <stop stopColor="#525455" />
            <stop offset=".34" stopColor="#252a30" />
            <stop offset=".52" stopColor="#171b20" />
            <stop offset="1" stopColor="#343b40" />
          </linearGradient>
          <linearGradient id={`${id}-etch`} x1="0" y1="0" x2="0" y2="1">
            <stop stopColor="#ead4a7" />
            <stop offset="1" stopColor="#917650" />
          </linearGradient>
        </defs>
        <path d="m22 1 8 5 11-1-2 26c-1 9-7 15-17 22C12 46 6 40 5 31L3 5l11 1Z"
          fill="#151411" stroke="#191712" strokeWidth="1.5" />
        <path d="m22 2 8 5 10-1-2 25c-1 8-7 15-16 21C13 46 7 39 6 31L4 6l10 1Z"
          fill={`url(#${id}-rim)`} stroke="#d2b784" strokeWidth=".65" />
        <path d="m22 7 7 4 7-1-2 21c-1 6-6 12-12 17-6-5-11-11-12-17L8 10l7 1Z"
          fill={`url(#${id}-steel)`} stroke="#191919" strokeWidth="1.4" />
        <path d="m22 9 7 4 5-1-2 19c-1 5-5 10-10 15-5-5-9-10-10-15l-2-19 5 1Z"
          fill="none" stroke={`url(#${id}-etch)`} strokeWidth=".5" opacity=".65" />
        <path d="m6 8 1.8 23c1 7 6 13 14.2 19M23 3l7 5 8-1"
          fill="none" stroke="#fff0c9" strokeWidth=".65" opacity=".7" />
        <path d="M36 13 34.5 30c-.8 6-5 12-12 18" fill="none" stroke="#0b1017" strokeWidth="1" opacity=".85" />
        <path d="m22 6 2 3-2 3-2-3Zm0 34 1.5 2-1.5 3-1.5-3Z" fill="#d5be89" />
        <path d="m9 19 3 1-1 5m24-6-3 1 1 5M13 33l2 1 2 4m14-5-2 1-2 4"
          fill="none" stroke="#ab9266" strokeWidth=".65" />
        <g fill="#e0c797" stroke="#514430" strokeWidth=".5">
          <circle cx="7" cy="9" r="1" /><circle cx="37" cy="9" r="1" />
          <circle cx="9" cy="31" r=".85" /><circle cx="35" cy="31" r=".85" />
        </g>
      </svg>
      <small>AC</small><strong>{value}</strong>
    </div>
  );
}
