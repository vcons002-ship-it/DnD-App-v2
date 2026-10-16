# Class dice and grouped-save art review

Implementation and preview review for this change. Updating the installed server is a separate step.

The updated interactive roller and inspector share the gameplay renderer. Added
class directions and ownership rules are documented in DICE_SIMULATOR.md.

Door controls: upper-left, closeable; nearby marker click or a fresh approach
reopens controls. Closing the panel never opens or closes a door.

Verification: typecheck and production build passed; all 2,242 unit tests passed.
Ten new class materials rendered in Chrome with no page errors or shader errors.
Live mixed Fireball save screen: Fighter, Ranger, purple DM creature, all together.
The dedicated door-controls browser test passed before this art change; final
combined browser results are recorded below after completion.

Separate unresolved timing check: e2e/door-interaction.spec.ts's strict 250 ms
preloaded reveal assertion measured about 641-675 ms during earlier testing.
No additional miniature downloads occurred. Its threshold was not changed.

Evidence is in tmp/class-dice-20261016 and tmp/door-controls-20261016; these are
review artifacts, not campaign data. Production campaign and server are untouched.

Final browser checks passed: grouped-save owner art through final PASS/FAIL,
dismissible/reopenable door controls, and desktop/mobile 3D dice inspector.
The published 430 x 932 mobile reviewer exposed all 14 choices, rolled Paladin
art, opened its rotatable inspector, had no dialog overflow and no page errors.

Preview: https://dnd.nic024i.app/uploads/previews/class-dice-20261016/index.html
Current roller: https://dnd.nic024i.app/uploads/previews/dice-roller/index.html
Publishing these preview bundles does not update the installed app or modify any campaign. First material/inspector use can take a few
seconds for graphics compilation; subsequent switches reuse the shared programs.

Turn/Nat 20 follow-up: turn banners retire on action rather than resuming after
attack dice. Natural skill/check twenties celebrate over the tray at settlement,
without replaying at modifiers or changing the check result. Both behavior and
phone/reduced-motion browser regressions passed (turn-and-nat20.spec.ts).
