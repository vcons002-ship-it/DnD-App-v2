# Independent AI light drafting

DM: Maps > Environment > Suggest lights from map art.

This sends the original base image to the configured image API with the tested
magenta-dot emitter prompt. It does not invoke or modify wall masking. The DM
reviews numbered marker positions, optionally toggles the generated annotation,
and selects which lights to add. Applying enables the environment, preserves its
other settings and existing lights, and never changes map artwork or walls.

Only positions are inferred. New lights use the tested defaults: warm, 20 ft
radius, 8 ft height, intensity 1, gentle flicker, no 3D fixture. Edit each light
with the existing Environment controls after applying. Nearby existing lights
(within 1 ft using map scale) are excluded from new drafts. Map, grid or light
changes invalidate a draft; applying the same draft twice cannot duplicate it.
Changes to walls do not invalidate this separate light draft.

The original artwork's baked illumination remains. This feature does not remove
painted light pools. Only the base image is analyzed; additional map tiles are not
included. Image API failures leave the map unchanged and use the gateway's retry
and status notices. The mask is retained in uploads; it is never used as map art.
