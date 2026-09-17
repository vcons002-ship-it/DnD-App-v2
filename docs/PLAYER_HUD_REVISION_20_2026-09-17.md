# Revision 20 - visible gem emission and synchronized damage feedback

Development follow-up to `967820b`, not a production deployment.

## Resource gems

The former idle effect primarily brightened tiny facets; at the normal 85% UI
scale it looked like colored stone rather than emitted light. Available gems
now have a stronger saturated internal light and a small soft bloom behind the
existing metal socket. This is the same cut gemstone, not another gem layer or
a regenerated raster asset. Spell levels I through IX retain progressively
stronger idle emission; class and custom resources also emit visible light.

Spent gems remain dark, with their facets and sockets visible. Spend/restore
effects fade the bloom with the existing energy animation. No idle animation
loop was added. Resource amounts, hit targets, arc centers, socket dimensions,
extra-capacity markings, overflow choices and manual editing are unchanged.

## Damage feedback timing

The reported floating damage appeared immediately when the server sent HP FX,
even while the damage dice were still rolling. A separate presentation mismatch
counted dice before their 3D landing rotation finished.

- Server damage events now carry an optional exact roll ID for the relevant
  attack, damage burst, dart, save or source-cast reveal. These IDs are generated
  by the server, never supplied by a player. They are transient metadata, not a
  new database column or a change to saved characters.
- The client holds only the cosmetic feedback belonging to its currently
  visible, unresolved roll. The number floats after that result finishes.
  Unrelated direct damage, hidden rolls and already-completed source casts do
  not wait for an unavailable animation.
- Player dice report when their authoritative face has actually been painted
  face-forward. Counts and compared-roll labels follow this landing instead
  of racing a separate timer. Damage-burst audio follows the completed result.
- Skipping, replacing or disabling an animation releases its held feedback.
  New sessions and explicit leave discard transient pending effects. Effect
  lifetime starts when the number is displayed, not while it waits.
- Concentration notes cannot suppress the associated damage animation. When
  one update contains multiple reveals, the latest actual result is presented.
  A content-sized safety timeout no longer truncates long dice/modifier lists
  at the former fixed five-second cutoff.

**Authoritative HP still changes immediately on the existing damage action.**
The manual attack → Roll damage workflow, damage math, resource spending,
conditions and campaign data are unchanged. Only cosmetic timing is deferred;
there is no new damage-confirmation step. DM panel layout and 2D dice pacing are
retained. Hidden rolls and hidden tokens keep their existing visibility gates.

## Evidence and verification

The baseline actual attack timing capture measured the first floating damage
at about **2 ms after the damage popup opened**, while the first damage die
landed at **870 ms** and the last at **970 ms**. In the corrected video capture,
the last die landed at **972 ms**, the final total finished at **1,405 ms**,
damage audio was scheduled at **1,532 ms**, and the float appeared at
**1,535 ms**, all relative to the damage popup opening. Exact receipts remain under
`preview-evidence/damage-timing/`. These are local timing observations, not a
general performance benchmark.

Gem evidence uses a read-only copy of the preview campaign and restores every
demonstrated counter in that disposable copy. No source counter, maximum or
character record is changed. Full-screen and separately labeled enlarged
close-up recordings are under
`preview-evidence/resource-gems-visible-glow-v20-2026-09-16/` (the existing
recorder retains its historical directory-date suffix; the receipt records the
actual September 17 UTC capture). The recording is 31.03 seconds, H.264 at a
30 fps output cadence, with no audio or synthesized motion. Capture cadence
includes screenshot/encoding overhead and is not a gameplay frame-rate result.

Native-resolution regression checks additionally verify visible colored light
outside the 14.4375-pixel gem socket against dark, medium and bright map tones.

Final integration checks:

- **576 unit tests in 61 files passed**, including 11 server damage-FX correlation
  cases (weapon/spell attacks, individual darts, saving throws, direct damage,
  and hidden roll/target visibility).
- **90 browser tests passed**, including 5 roll-timing regressions and 7 gem
  regressions. The final full-suite attack case independently confirmed a
  969 ms last die, 1,403 ms final total and 1,533 ms floating number.
- Client and server TypeScript checks and the production client build passed.
  Final client assets: `index-D16KXG6T.js` and `index-Zd6YMLty.css`.
- Local validation used Node 24.16, outside the repository's declared Node
  20-22 range. These results do not substitute for a Node 22 CI run.

The local artifact gallery at `http://127.0.0.1:4287/` combines matched gem
before/after stills, both gem recordings, and the corrected attack recording.
The attack MP4 is silent H.264, 1366 x 900, 6.92 seconds, with no synthetic
frames. It is stored at
`preview-evidence/player-effects-v20-2026-09-17/damage-after.mp4`.

## Deployment boundary

This revision is development-only. No production campaign data, server process,
passcode, session, or saved character was changed. The correlation fix requires
the updated server and client together; refreshing a client connected to an old
server does not install it. No push, PR, merge or live restart occurred here.
