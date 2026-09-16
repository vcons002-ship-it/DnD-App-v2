# Player HUD revision 9 - temporary-HP ward and engraved AC

Temporary HP no longer occupies a separate badge or mini-orb. A translucent
blue shield appears over the existing globe only while the saved buffer is
positive. A quiet breathing edge, rotating rim highlight and occasional light
sweep animate without another WebGL context. The guardian artwork remains in
front of the ward; the normal HP text and blue `+X` are above both.

The ward is decorative and cannot intercept clicks. Clicking the health orb
still opens the same Damage / Heal / Temp HP controls, including when the
buffer is zero. Its accessible name includes active temporary HP. At zero,
both the ward and bonus disappear. Reduced-motion mode is static; hidden-page
animations pause alongside the existing liquid renderer. No HP maximum,
automatic behavior or persistence logic was introduced or changed.

AC uses a new code-native SVG shield with beveled antique-metal edges, dark
steel inset, etched ornaments and small rivets. Its existing 40x48px footprint
and bottom offset are unchanged, with its left anchor moved from 28% to 24%
of the sculpture (about 8 logical pixels on the standard desktop orb). The
same effective-AC calculation and ordinary accessible text remain authoritative.

No resources were repositioned. Symbols keep the 42px baseline and all circle
centers/radii remain unchanged. A clickability regression also identified the
fixed Place token strip covering the health drawer in the no-map state;
the open drawer now stacks above that strip without moving either surface.

Validation is isolated from the active preview and installed campaign:

- Client build and server/client typechecks passed.
- Twelve geometry unit tests passed.
- Ten targeted liquid-orb, player-HUD and resource browser tests passed, covering active/zero
  display, unchanged temp-first damage absorption, existing edit controls,
  refresh, fallback, reduced motion, and unchanged resource positions.
- `tools/verify-player-layout.cjs --hud-only` passed with no page errors; it copies the preview database before
  seeding test values, captures all three guardian artworks at laptop/desktop
  sizes, and compares geometry with 12 / 0 / 12 temporary HP.

Evidence: `preview-evidence/revision-9/`, including active/zero corner captures
and `layout-checks.json`. This is a local preview build, not production deployment.
