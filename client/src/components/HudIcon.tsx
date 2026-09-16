/** Small, purpose-drawn relief icons. Vector strokes stay legible at laptop size. */
export function HudIcon({ name }: { name: 'character' | 'inventory' | 'spellbook' | 'checks' | 'party' }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {name === 'character' && <>
        <path d="M9 15V10a7 7 0 0 1 14 0v5l-3 6h-8z" fill="currentColor" fillOpacity=".12" />
        <path d="m9 12 7 3 7-3M16 6v15M10 23l-5 4h22l-5-4M12 21v3l4 3 4-3v-3" />
        <path d="m11 15 3 1m4 0 3-1" strokeWidth="2" />
      </>}
      {name === 'inventory' && <>
        <path d="M7 10h18l2 17H5z" fill="currentColor" fillOpacity=".12" />
        <path d="M11 10V7a5 5 0 0 1 10 0v3M6 15l10 4 10-4M9 22v3m14-3v3" />
        <path d="M14 16h4v6h-4z" fill="currentColor" fillOpacity=".3" />
      </>}
      {name === 'spellbook' && <>
        <path d="M3 7q7-3 13 1 6-4 13-1v18q-7-3-13 1-6-4-13-1z" fill="currentColor" fillOpacity=".12" />
        <path d="M16 8v18M7 12l5 1m-5 4 5 1m8 3 5-1" />
        <path d="m23 7 1.2 4.3L28 13l-3.8 1.7L23 19l-1.2-4.3L18 13l3.8-1.7z" fill="currentColor" fillOpacity=".3" />
      </>}
      {name === 'checks' && <>
        <path d="m16 3 12 8v12l-12 6L4 23V11z" fill="currentColor" fillOpacity=".12" />
        <path d="m16 3-6 13 6 13 6-13zM4 11l6 5-6 7m24-12-6 5 6 7M10 16h12" />
        <path d="m12 13 3 3 5-6" strokeWidth="2.3" />
      </>}
      {name === 'party' && <>
        <circle cx="16" cy="10" r="4" fill="currentColor" fillOpacity=".2" />
        <path d="M9 27v-5a7 7 0 0 1 14 0v5zM7 7a4 4 0 0 0 0 8m18-8a4 4 0 0 1 0 8M6 18a5 5 0 0 0-4 5v3h4m20 0h4v-3a5 5 0 0 0-4-5" />
        <path d="m14 22 2 2 2-2" />
      </>}
    </svg>
  );
}
