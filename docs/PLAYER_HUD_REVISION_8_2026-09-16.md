# Player HUD revision 8 — restore resource height

Reverted the revision-7 lift: the resource symbols, their gem rows and custom
shortcut use their original baseline 42 logical pixels above the artwork base.
No resource radius or center changes. An explicit browser assertion protects
that original baseline at laptop and narrow desktop widths.

Only temporary HP was adapted to fit: 30px circular badge, right10px, bottom−2px
inside the HUD's existing4px viewport inset. It remains bottom-right opposite
AC, below the unchanged symbol row, fully on screen and independently clickable.
Original art, campaign data and gameplay behavior remain unchanged.

Preview-only build. Geometry tests, HUD/resource browser checks and three-art
runtime captures use disposable databases. Evidence: `preview-evidence/revision-8/`.
