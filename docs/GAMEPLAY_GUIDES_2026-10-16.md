# Current gameplay guides

Recorded on 16 October 2026 in a disposable campaign using the local preview
build, including the spell/mist interaction. No live campaign or shared
library was edited by the demonstrations.

Stable entry points:

- DM: https://dnd.nic024i.app/uploads/guides/dm/index.html
- Player: https://dnd.nic024i.app/uploads/guides/player/index.html
- Guide index: https://dnd.nic024i.app/uploads/guides/index.html
- Integrated-GPU spell/mist video:
  https://dnd.nic024i.app/uploads/previews/spell-mist-20261016/index.html

## Revised map and camera

The current revision uses The Ember Vault, a purpose-built, orthographic
1536 x 1024 dungeon with flat wall caps and floor-level door thresholds.
The earlier perspective map is no longer used for the main exploration and
combat chapters. Exploration and door interactions use a fixed overhead
camera. Combat uses a fixed 45-degree camera. The wider overhead framing
keeps the nearby-door controls clear of the dragged miniature.

Actual app analysis produced a connected polygon wall network, six door
suggestions, eight false windows and twenty light suggestions. The review
removed the false bottom-entrance door, all windows and three misplaced
lights. The applied setup contains five doors and seventeen lights. This
is a reviewed AI result, not a claim that automatic identification was perfect.

All five doors passed closed/open movement and sight checks using the game's
collision and visibility functions. Fitted centers are about 0.2 to 1.3 feet
from the painted threshold centers at the selected 120-ft map width. Actual
player dragging also passed through the entrance and barracks, including
closing the barracks from inside and reopening it to leave. No doorway
geometry was manually moved for that successful route.

The map was generated with the built-in image-generation tool and uploaded
to the isolated campaign. Its image and exact generation prompt are included
with the versioned guide files. App-based AI map generation remains a
separately labeled preparation example.

## Coverage

The revised guides show map analysis and review, party and creature placement,
manual wall creation and deletion, colored lights, torch fixtures, environment
presets, lanterns, regular/heavy darkness, shared explored memory, initiative,
Fireball and grouped saves, Trip Attack, Hunter's Mark and Hail of Thorns,
private DM roll approval, advantage/disadvantage checks, measurements,
annotation cleanup, private image chat, party chat, the rules assistant,
rests, Hit Dice, display settings, docking/pinning, and actual tile placement.

The existing character and creature creation demonstrations are retained as
explicitly separate workshop sections. They include the real API requests,
2024 paladin equipment and spells, rolled stats, personal GLB upload controls,
a generated Warden, multiview shape and texture, compression, bases, CR/HP
editing and library saving. The workshop sections do not imply that their
original preparation map is the Ember Vault gameplay map.

Main gameplay was re-recorded on the new map. Dice outcomes were not forced.
Fireball and Hail of Thorns also catch Druk's footprint at the edge; the
Fireball caption explicitly calls out that included allies are affected.

## Capture and publication

Capture uses Windows Graphics Capture and RTX 5090 NVENC AV1 with real pointer
movement and click highlights. Captions occupy an added strip below the app,
never over its controls. The recordings have no narration or captured audio.
Mobile H.264 copies, original AV1 copies, searchable chapters, chapter links,
resume and playback speed are available.

The revised DM guide is 11:21 with 46 chapters; the player guide is 8:40
with 38 chapters. Mobile 390 x 844 playback, actual time advancement, chapter
seeking, byte-range downloads, and absence of layout overflow/JavaScript
errors were verified after encoding. Canonical URLs return the new version.

Current version: `/uploads/guides/20261016-clean/`. Canonical URLs remain
unchanged. The previous `/20261016/` revision is retained as an archive.
The existing `server/uploads/guides` junction stores published files on drive
D. Cloudflare serves the local app's upload URLs; this does not upload the
videos to a separate cloud media store.

Source recordings, manifests, edit points, compiler, mobile playback results,
map prompt and isolated runtime are under `tmp/guides-clean-20261016/`.
Unchanged workshop sources are under `tmp/guides-20261016/`. Do not commit
large recordings, disposable credentials or runtime data.

The spell/mist implementation remains local until a separately requested
PR/merge and installation update. Publishing static guide files does not
deploy application code or restart the installed server. Its integrated-GPU
performance measurements are in `SPELL_MIST_INTERACTION_2026-10-16.md`.

## Gold ability dice correction

The player guide revision under `/uploads/guides/20261016-gold/` replaces
only the ability-score rolling demonstration. It shows one manual STR roll
and a fresh 24d6 set with the shared polished-gold material, followed by
score review. Other sections retain their prior recordings. Capture again
uses Windows Graphics Capture and RTX 5090 NVENC AV1.

Character-creation requests now carry an explicit cosmetic gold appearance,
independent of the selected class and critical-dice flags. Opening the creator
preloads the gold material. Live browser checks verified four and twenty-four
d6s, with every critical flag false. Typecheck, production build and all
2,238 tests passed. The code is local and pending merge/deployment; guide
publication does not update the installed app.

The updated canonical player guide is 8:54 with 40 chapters. The gold-roll
chapter and later Fireball chapter both passed real 390 x 844 mobile playback
and seeking checks with HTTP 206 range support and no page errors/overflow.
The DM guide remains on the prior overhead-dungeon revision.
