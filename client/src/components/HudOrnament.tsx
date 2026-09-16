import { useId } from 'react';

/** Structural metalwork that joins the live controls to the existing guardian
 * art. SVG keeps the bevels crisp at every player-selected interface scale. */
export function HudOrnament({ crest = false }: { crest?: boolean }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg className={crest ? 'hud-crest-art' : 'hud-wing-art'} viewBox={crest ? '0 0 240 70' : '0 0 290 190'} preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={`${id}-metal`} x1="0" x2="0.2" y1="0" y2="1">
          <stop stopColor="#f1ddb0" /><stop offset=".22" stopColor="#9b7748" />
          <stop offset=".46" stopColor="#332a21" /><stop offset=".7" stopColor="#b79861" /><stop offset="1" stopColor="#3b3024" />
        </linearGradient>
        <linearGradient id={`${id}-iron`} x2="0" y2="1">
          <stop stopColor="#282a2b" /><stop offset=".5" stopColor="#10151b" /><stop offset="1" stopColor="#080b11" />
        </linearGradient>
      </defs>
      {crest ? <>
        <path d="m8 34 20-17 28 4 15-11h98l15 11 28-4 20 17-22 18-28-3-16 12H74L58 49l-28 3z" fill={`url(#${id}-iron)`} stroke={`url(#${id}-metal)`} strokeWidth="2" />
        <path d="m15 34 17-9 23 3 20-11h90l20 11 23-3 17 9M36 43l24-3 16 13h88l16-13 24 3" fill="none" stroke={`url(#${id}-metal)`} opacity=".6" />
        <path d="m7 34 17-7-5 7 5 7zM233 34l-17-7 5 7-5 7zM115 7l5-5 5 5-5 5z" fill={`url(#${id}-metal)`} />
      </> : <>
        <path d="M3 181q21-8 23-31V32Q42 9 75 18l169-3 27 14 9 123-16 25-182 6-39-11z" fill={`url(#${id}-iron)`} fillOpacity=".85" />
        <path d="M6 182q22-7 27-24M28 43q0-21 20-27l23 3 15-9 156 4 15 12 20 5M53 174l21 10 171-6 28-20" fill="none" stroke={`url(#${id}-metal)`} strokeWidth="3" />
        <path d="m78 19 11-4 150 3 16 13M71 176l16 3 151-5 17-9M277 43v99" fill="none" stroke="#e2c794" opacity=".35" />
        <path d="M270 24q-18 6-7 15 12 9 7 21M270 157q-20-7-13-17 10-14 5-22M48 24q15 6 4 13-9 7-3 13" fill="none" stroke={`url(#${id}-metal)`} strokeWidth="2" />
        <path d="m273 76 5 7-5 7-5-7zM112 179l5-4 5 4-5 4zM240 177l5-5 5 4-5 5z" fill={`url(#${id}-metal)`} />
      </>}
    </svg>
  );
}
