# DM workspace refresh

The DM battlefield now fills the available workspace. The charcoal panels, gold
borders and locally bundled Cinzel headings match the player HUD, while the DM
retains its own controls and all existing server-authoritative actions.

- A labeled tool rail opens Maps, Creatures, Initiative, and Chat & dice.
- The token inspector opens on selection or the existing inspect action. Both
  panels close explicitly and resize with pointer or keyboard; widths persist
  locally per campaign. Hidden panels stay mounted to preserve in-progress input.
- The bottom turn bar exposes the current combatant and Next turn without
  requiring an open initiative panel. Full encounter management remains inside.
- Campaign-wide actions move into a native disclosure menu. Map measurement,
  fog, annotation and tile tools remain in the toolbar.
- On narrow screens the drawers avoid the tool rail. Picking a spawn closes the
  drawer to expose the map; the inspector and workspace open one at a time.
- A campaign with no map opens Maps immediately. Existing sidebar preferences
  are left intact for the separate data/library views, which retain their layout.
- The same full-resolution models and Overhead/45-degree and 2D/3D preferences
  remain available. No server schema, campaign data, or character art changes.

Validation covers actual DM authentication, all three GLBs, independent view
preferences, field retention, resizing, initiative advancement, mobile token
placement, inspector access, resource editing, chat history and session settings.
Preview recordings use the approved map and copies of the campaign character
sheets in a disposable database; the installed campaign is not modified.

Implementation is on claude/Dev. A commit or preview does not deploy the running
server, and a PR is opened only on request.


## Verified result

- Server/client typechecks and production build passed.
- 609 unit tests across 65 files passed.
- Final complete browser suite: 115 passed in 3.9 minutes.
- Desktop and 430px phone viewport captures reviewed, including corrected drawer
  placement beside the tool rail. Phone behavior is browser emulation.
- Campaign-style walkthrough: 1920x1080 H.264, 25.57 seconds, no browser errors.

[DM workspace walkthrough](https://dnd.nic024i.app/uploads/dm-workspace-tour-18285d9b0028.mp4)
