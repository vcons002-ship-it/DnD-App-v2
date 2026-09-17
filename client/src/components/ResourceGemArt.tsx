import { memo, useId, type CSSProperties } from 'react';
import type { ResourceSigilKind } from '../../../shared/resourceSigils';
import './resource-gem-art.css';

type GemEffect = 'idle' | 'spend' | 'restore';
const ENERGY_THREADS = [
  'M16 17C9 11 24 5 15-8c-5-9 4-20 10-24',
  'M14 18C22 11 2 7 7-3c2-8-9-15-12-22',
  'M18 18c8-2 6-10 14-14 8-5-1-15 6-22',
];

/** Decorative only. The containing button owns state, labels and interactions. */
export const ResourceGemArt = memo(function ResourceGemArt({ kind, ordinal, spellLevel, extra, effect, reactionKey = 0 }: {
  kind: ResourceSigilKind;
  ordinal: number;
  spellLevel?: number;
  extra: boolean;
  effect: GemEffect;
  reactionKey?: number;
}) {
  const id = useId().replace(/:/g, '');
  const metal = `gem-metal-${id}`;
  const cavity = `gem-cavity-${id}`;
  const heart = `gem-heart-${id}`;
  const emission = `gem-emission-${id}`;
  const bloom = `gem-bloom-${id}`;
  const dark = `gem-dark-${id}`;
  const flare = `gem-flare-${id}`;
  const variant = Math.abs(ordinal) % 3;
  const palette = `gem-kind-${kind}`;
  const cut = 'M11 6H21L27 12V21L21 27H11L5 21V12Z';
  const table = 'M12 11H20L23 14V20L19 23H12L9 20V14Z';
  const levelStep = kind === 'spell' && typeof spellLevel === 'number' && Number.isInteger(spellLevel) && spellLevel >= 1 && spellLevel <= 9
    ? spellLevel - 1 : 0;
  const idleLight = {
    '--gem-idle-brightness': 1 + levelStep * .03,
    '--gem-idle-radiance': .15 + levelStep * .035,
    '--gem-bloom-strength': .86 + levelStep * .017,
    '--gem-bloom-trough': .12 + levelStep * .014,
    '--gem-core-trough': .16 + levelStep * .018,
    '--gem-core-peak': .74 + levelStep * .025,
    // A gentle wave across a row; phase affects only decorative light, never
    // socket geometry or the resource's authoritative state.
    '--gem-breathe-delay': `${-(Math.abs(ordinal) % 4) * .16 - levelStep * .1}s`,
  } as CSSProperties;
  return <>
    <svg className={`resource-gem-art ${palette}`} data-gem-art-variant={variant}
      viewBox="0 0 32 32" style={idleLight} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={metal} x1=".18" y1="0" x2=".77" y2="1">
          <stop offset="0" stopColor="#f0d49a" />
          <stop offset=".18" stopColor="#957344" />
          <stop offset=".37" stopColor="#3c2d21" />
          <stop offset=".52" stopColor="#b6935b" />
          <stop offset=".72" stopColor="#63513a" />
          <stop offset=".9" stopColor="#2c251e" />
          <stop offset="1" stopColor="#b7a078" />
        </linearGradient>
        <radialGradient id={cavity} cx=".42" cy=".35" r=".66">
          <stop offset="0" stopColor="#211e1c" />
          <stop offset=".67" stopColor="#07090c" />
          <stop offset="1" stopColor="#544431" />
        </radialGradient>
        <linearGradient id={dark} x1=".2" y1="0" x2=".78" y2="1">
          <stop offset="0" stopColor="#727d86" />
          <stop offset=".27" stopColor="#333b46" />
          <stop offset=".6" stopColor="#181d26" />
          <stop offset="1" stopColor="#070b11" />
        </linearGradient>
        <radialGradient id={heart} cx={variant === 1 ? '.42' : '.35'} cy=".35" r=".72">
          <stop offset="0" stopColor="var(--gem-flare)" />
          <stop offset=".19" stopColor="var(--gem-light)" />
          <stop offset=".5" stopColor="var(--gem-mid)" />
          <stop offset=".84" stopColor="var(--gem-deep)" />
          <stop offset="1" stopColor="var(--gem-ink)" />
        </radialGradient>
        <radialGradient id={emission} gradientUnits="userSpaceOnUse" cx="16.7" cy="18.4" r="8.8">
          <stop offset="0" stopColor="var(--gem-flare)" />
          <stop offset=".2" stopColor="var(--gem-light)" />
          <stop offset=".43" stopColor="var(--gem-energy)" stopOpacity=".98" />
          <stop offset=".72" stopColor="var(--gem-energy)" stopOpacity=".78" />
          <stop offset="1" stopColor="var(--gem-deep)" stopOpacity="0" />
        </radialGradient>
        {/* The existing cut emits a soft colored halo beneath its setting.
            Only light opacity breathes: no duplicate stone or scaling socket.
            Give the halo room to remain visible at the default 85% UI scale. */}
        <filter id={bloom} filterUnits="userSpaceOnUse" x="-14" y="-14" width="60" height="60" colorInterpolationFilters="sRGB">
          <feGaussianBlur stdDeviation="4.2" />
        </filter>
        <radialGradient id={flare}>
          <stop offset="0" stopColor="#ffffff" />
          <stop offset=".18" stopColor="var(--gem-flare)" stopOpacity=".96" />
          <stop offset=".47" stopColor="var(--gem-light)" stopOpacity=".64" />
          <stop offset="1" stopColor="var(--gem-mid)" stopOpacity="0" />
        </radialGradient>
      </defs>
      <path className="gem-emission-bloom" d={cut} fill="var(--gem-energy)"
        stroke="var(--gem-energy)" strokeWidth="10" filter={`url(#${bloom})`} />
      {/* Engraved bronze setting and dark recess sit behind the cut stone. */}
      <path d="m16 .8 4 3 6-.2 2.4 6.1 2.8 6.3-2.8 6.3-2.4 6.1-6-.2-4 3-4-3-6 .2-2.4-6.1L.8 16l2.8-6.3L6 3.6l6 .2Z"
        fill={`url(#${metal})`} stroke="#15110e" strokeWidth="1.05" />
      <path d="m11.5 4 9 .1 8 8v10l-7.8 7-10.2-.1-7-7.5V11.4Z"
        fill={`url(#${cavity})`} stroke="#d9ba805c" strokeWidth=".65" />
      <path d="m16 1.9 1.4 2.2L16 5.6l-1.4-1.5Zm0 24.8 1.4 1.7-1.4 1.9-1.4-1.9ZM2.1 16l2.1-1.4 1.4 1.4-1.4 1.4Zm24.3 0 1.5-1.4 2 1.4-2 1.4Z"
        fill="#191714" stroke="#c0a270" strokeWidth=".48" />
      <path d="m7.5 3.9-1 2.8-2.4 1M24.5 3.9l1 2.8 2.4 1M4.1 24.3l2.4 1 1 2.8m20.4-3.8-2.4 1-1 2.8"
        fill="none" stroke="#ecd6a9" strokeOpacity=".62" strokeWidth=".65" />

      {/* Empty facets remain visible, rather than becoming a flat black dot. */}
      <g className="gem-dark-body">
        <path d={cut} fill={`url(#${dark})`} stroke="#05090d" strokeWidth=".9" />
        <path d="m11 6 1 5-3 3-4-2Zm10 0-1 5 3 3 4-2Z" fill="#a1afbd" fillOpacity=".27" />
        <path d="m5 12 4 2v6l-4 1Zm22 0-4 2v6l4 1Z" fill="#060b12" fillOpacity=".52" />
        <path d="m5 21 4-1 3 3-1 4Zm16 6-2-4 4-3 4 1Z" fill="#82929d" fillOpacity=".19" />
        <path d={table} fill="#141c28" fillOpacity=".42" stroke="#a0acbb" strokeOpacity=".17" strokeWidth=".55" />
        <path d="m12 11 8 0-5 7-6-4Z" fill="#b3bec8" fillOpacity=".095" />
      </g>

      {/* Crown facets, recessed table and pavilion shadows give real edges. */}
      <g className="gem-lit-body">
        {/* The same emitted color catches the recessed inner setting. */}
        <path d="m5.3 20.5 5.5 6.8h10.5l5.6-6.7" fill="none"
          stroke="var(--gem-energy)" strokeWidth="3.6" strokeOpacity=".8" />
        <path d={cut} fill="var(--gem-deep)" stroke="var(--gem-ink)" strokeWidth=".8" />
        <path d="m11 6 10 0-1 5h-8Z" fill="var(--gem-light)" />
        <path d="m21 6 6 6-4 2-3-3Z" fill="var(--gem-mid)" />
        <path d="m27 12v9l-4-1v-6Z" fill="var(--gem-deep)" />
        <path d="m27 21-6 6-2-4 4-3Z" fill="var(--gem-ink)" />
        <path d="M21 27H11l1-4h7Z" fill="var(--gem-deep)" />
        <path d="m11 27-6-6 4-1 3 3Z" fill="var(--gem-mid)" />
        <path d="M5 21v-9l4 2v6Z" fill="var(--gem-light)" fillOpacity=".56" />
        <path d="m5 12 6-6 1 5-3 3Z" fill="var(--gem-flare)" fillOpacity=".88" />
        <path d={table} fill={`url(#${heart})`} stroke="var(--gem-light)" strokeOpacity=".7" strokeWidth=".55" />
        {/* A second, saturated light source lives below the white reflection.
            Facet overlays and the dark pavilion retain the cut-stone shape. */}
        <path className="gem-inner-emission" d={table} fill={`url(#${emission})`} />
        {/* Tier radiance stays saturated rather than whitening the whole cut. */}
        <path className="gem-level-radiance" d={table} fill={`url(#${emission})`} />
        <path d="m12 11 8 0-5.5 6.5L9 14Z" fill="#ffffff" fillOpacity=".17" />
        <path d="m23 14-8.5 3.5L19 23l4-3Z" fill="var(--gem-ink)" fillOpacity=".23" />
        <path d="m9 20 5.5-2.5L19 23h-7Z" fill="var(--gem-light)" fillOpacity=".24" />
        <path d="m12.4 21.8 3.1 1.4 4.1-1.6" fill="none"
          stroke="var(--gem-light)" strokeOpacity=".86" strokeWidth="1.15" strokeLinejoin="round" />
        <path d="m14.2 19.4 2.4 1.1 2.2-1.1" fill="none"
          stroke="var(--gem-light)" strokeOpacity=".56" strokeWidth=".85" />
        <path className="gem-facet-reflection" d="m10.7 8.7 1.2 2.7-2.3 2.1-1.6-1.6Z" fill="#ffffff" fillOpacity=".82" />
        <path d="m12 23 7 0 2 4" fill="none" stroke="var(--gem-mid)" strokeWidth=".55" />
      </g>

      {/* Four metal claws overlap the stone, anchoring it into the old setting. */}
      <g fill={`url(#${metal})`} stroke="#231b15" strokeWidth=".62">
        <path d="m5.2 6.1 2.6-.8 3.1 3.1-.8 1.9-1.7.2Z" />
        <path d="m26.8 6.1-2.6-.8-3.1 3.1.8 1.9 1.7.2Z" />
        <path d="m5.3 25.5 1.5 1.4 3.9-3.2-.3-1.8-1.6-.1Z" />
        <path d="m26.7 25.5-1.5 1.4-3.9-3.2.3-1.8 1.6-.1Z" />
      </g>
      <path d="m6.4 6.3 2.7 2.5m16.5-2.5-2.7 2.5M6.5 25l2.7-2.1m16.3 2.1-2.7-2.1"
        stroke="#efd5a0" strokeOpacity=".68" strokeWidth=".7" />
      {extra && <g className="gem-extra-engraving">
        <path d="m26.7 1.3 4 4-4 4-4-4Z" fill="#edc465" stroke="#30200e" strokeWidth="1" />
        <path d="m26.7 3.2 2.1 2.1-2.1 2.1-2.1-2.1Z" fill="#60431d" stroke="#fff0b5" strokeWidth=".65" />
        <path d="m25.2 3.3 1.5-1.1 1.5 1.1" fill="none" stroke="#fff2c2" strokeWidth=".8" />
      </g>}
    </svg>

    {effect !== 'idle' && <svg key={reactionKey} className={`resource-gem-reaction ${palette}`}
      viewBox="0 0 32 32" aria-hidden="true" focusable="false" data-gem-reaction={effect}>
      <circle className="gem-reaction-flare" cx="16" cy="16" r="11" fill={`url(#${flare})`} />
      <g fill="none" stroke="var(--gem-mid)" strokeWidth="4.4" strokeLinecap="round" opacity=".42">
        {ENERGY_THREADS.map((path, index) => <path key={index} className="gem-energy-thread gem-thread-halo" pathLength="100" d={path} />)}
      </g>
      <g fill="none" stroke="var(--gem-flare)" strokeWidth="2.4" strokeLinecap="round">
        {ENERGY_THREADS.map((path, index) => <path key={index} className="gem-energy-thread gem-thread-core" pathLength="100" d={path} />)}
      </g>
      {[
        { x: -14, y: -36, r: 1.7 },
        { x: 12, y: -46, r: 2 },
        { x: 22, y: -30, r: 1.5 },
      ].map((mote, index) => <circle key={index} className={`gem-energy-mote mote-${index + 1}`}
        cx="16" cy="16" r={mote.r} fill="var(--gem-flare)"
        stroke="var(--gem-mid)" strokeWidth="1.5" strokeOpacity=".42" paintOrder="stroke fill"
        style={{ '--mote-x': `${mote.x}px`, '--mote-y': `${mote.y}px` } as CSSProperties} />)}
      <path className="gem-event-sparkle" d="m16 8 1.2 6.8L24 16l-6.8 1.2L16 24l-1.2-6.8L8 16l6.8-1.2Z"
        fill="#fff9eb" />
    </svg>}
  </>;
});
