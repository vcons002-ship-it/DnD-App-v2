# Mobile UI review — 17 October 2026

The existing phone UI wrapped map controls across multiple header rows and
opened the combat console over the map immediately. On a fresh 390 × 844 player
view the header occupied 193 px; the equivalent DM header occupied 270 px.

## Changes

- On phones, View groups tilt, rotation, token appearance and DM visibility.
  Map tools groups measuring, annotation, scale, walls/doors/lights, fog and
  tiles as appropriate to the role. Zoom/Fit remain directly accessible.
- Larger main touch targets and a compact campaign header reduce the 390 px
  phone header to 100 px for both roles. In 844 × 390 landscape it is 51 px.
- A fresh player phone session starts with Combat folded. Its existing expand
  button opens the same combat console and server actions. This is a display
  default; saved panel sizes and character data are not rewritten.
- Character replaces the five-icon vertical rail on phones and opens the
  existing full sheet with Inventory, Spellbook, Checks & saves and Party tabs.
  The health orb/resource artwork and their underlying controls remain.
- View includes touch rotation buttons, without changing desktop right-drag
  rotation or existing map panning/pinch behavior.
- Landscape phone dice use a side calculation/review column to recover tray
  height. Physics, faces, roll timing, modifiers and privacy are unchanged.
  Private DM reviews have a wider column with all approval actions visible;
  results and roll details retain their own scroll area.
- Dialogs use dynamic viewport limits; the character sheet remains scrollable
  and the in-app Mobile guide describes the new entry points.

## Verification boundary

UI checks use Chrome with mobile/touch input emulation on the host PC, isolated
campaign data, real sockets, actual token movement and server-owned dice. They
are not a physical Fold/iPad performance or Safari certification. Mobile GPU
speed, browser chrome, the software keyboard and OS-level gestures still need
a real-device check. Existing small individual resource gems remain precision
shortcuts; their named resource editors and character-sheet controls remain
available for larger editing controls.

The audit samples 360 × 800, 390 × 844, 430 × 932, 844 × 390, 768 × 1024 and
1024 × 768 layouts. Larger tablet/desktop layouts retain the direct toolbar;
coarse-pointer tablet controls gain larger touch targets.

Automated regression coverage is in `e2e/mobile-tabletop.spec.ts`, alongside
annotation, panel-recovery, turn-banner and roll-layout checks. It covers touch
base dragging, pan/pinch zoom, view choices, sheet tabs, attacks and damage,
saving throws, DM map/creature/light/settings access and creator navigation.

Final checks passed across focused runs: 17 browser regressions (7 mobile
checks plus annotation, panel recovery, turn banners, public roll layouts and
private DM approval), all 2,244 unit tests in 210 files, both type checks and
the production build. The public roll layout test includes 40-die pools and
grouped saves; private approval includes reroll, entered totals and a second
player that receives no pending secret roll. Camera tests wait for completed
transitions and model readiness rather than dragging during the camera tween.

This work was verified in an isolated development campaign. It does not
restart or replace the installed app or its campaign save.
