# Player HUD revision 10 - enveloping temporary-HP force field

Replaced the literal shield-shaped emblem with a spherical magical shell that
follows the health globe. Transparent blue edge light, slowly drifting curved
wisps, an orbiting rim highlight and tiny glints convey an enveloping barrier.
There is no crest, cross, icon or shield silhouette over the liquid.

The full effect subtree and blue `+X` remain conditional on positive temporary
HP. At zero there is no residual outline, idle aura or temporary-HP badge.
The health liquid, character art, AC badge, resources and geometry are unchanged.
No game logic or saved values changed. Clicking the globe still opens the same
health controls, and reduced-motion renders the active barrier statically.

Validation uses isolated E2E data and a disposable copy of the preview database;
no live or active-preview characters are claimed or edited. The visual helper
captures all three characters with 12 and 0 temporary HP, checking identical
resource geometry in both states. Evidence: `preview-evidence/revision-10/`.

Client build and typecheck passed. All 10 targeted browser tests passed,
including active/zero shell geometry, no-emblem assertions, complete
reduced-motion coverage, manual temporary-HP editing and existing damage
absorption. The three-character visual helper passed without page errors.
