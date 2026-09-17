# Revision 21 - character kill-count crest

Development follow-up to `432e037`; not a production deployment.

## Presentation

The player's health-orb base now carries an engraved skull crest beside the
existing AC shield. A large ivory-gold tally and small Kills inscription use the
same bundled Cinzel display font as the character name. Beveled bronze trim,
bone-metal relief and restrained shadows match the existing orb's metalwork.
This is crisp SVG and live text, not regenerated character art.

The crest occupies the existing lower rim. It does not raise resource symbols,
expand the HUD, move AC or the character title, or cover the liquid/HP readout.
Pointer events pass through to the existing health control. Zero stays visible,
larger numbers use thousands separators and smaller type, and an accessible
status label announces the character's exact tally.

## Data and compatibility

`OrbKillCount` reads only the existing server-supplied `Character.killCount`,
with a zero fallback. It does not compute, increment, reset or persist counts.
Existing combat credit, saved campaign data, import behavior, character claiming
and the DM UI are untouched. No database migration or new automation is added.

## Validation and evidence

- Client and server TypeScript checks passed.
- Production client build passed.
- 576 unit tests across 61 files passed against a disposable database.

- Three focused browser tests passed: existing manual damage changes the saved
  tally from zero to one, duplicate damage cannot inflate it, and reload retains
  it. Clicking through the crest still opens health controls. The DM gets no
  player crest.
- Twenty-four layout combinations passed: three guardian artworks plus generic
  art, 980/1366px viewport widths, and 70/85/115% interface scales. The tally
  clears the globe, HP text, AC, title and resource gems; 9,999 fits without
  clipping. A six-digit fixture also verifies exact text/accessible labeling.
- Reviewed default-scale screenshots for all four variants, using an explicitly
  synthetic display count of 12 and class-appropriate fixture resources, under
  `preview-evidence/orb-kill-count-v21/`. These are not campaign tally edits.
- An additional 29 browser regressions passed: player HUD controls, default and
  compact layouts, all ten resource rings, liquid/shield animation behavior,
  reduced motion and unavailable-WebGL fallbacks. Total: 32 browser tests this
  revision; the entire browser suite was not rerun for this display-only change.

The existing development preview at `http://127.0.0.1:4276/join` was verified
to serve the new client assets (`index-BSCGk7Cz.js`, `index-g_D-moyZ.css`).
Refreshing that preview loads this display-only addition; the existing server
already supplies the tally. This does not mean the separate revision-20 server
correlation changes have been installed in that older running backend.

This revision remains on the local development branch. No push, PR, merge,
production restart or live campaign writes were performed.
