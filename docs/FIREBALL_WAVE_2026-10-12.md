# Fireball: one continuous flame wave

The previous explosion used eighteen independently expanding spheres plus a
plain circular outline. The revised explosion uses one connected polar surface
that moves outward from the impact to the selected radius. Procedural fire
texture, irregular rising folds, and yellow-orange hot crests give the front
depth without separate bubbles. It sweeps outward once, then cools and fades.

The 600 ms projectile flight, existing 20 ft Fireball radius, and damage/roll
release timing remain unchanged. Illumination is sampled at three points along
the actual expanding front; the traveling projectile has its own sample.
Geometry is shared across casts and shaders still prepare during the roll hold.

The comparison uses the real app renderer and its cosmetic `fx:hp` event with
identical source, target area, map and cameras. The effect is replayed without
rolling combat or changing HP so the two visuals can be compared directly.
Captured using Windows Graphics Capture with RTX 5090 AV1 NVENC at 60 fps;
the public embedded copy uses H.264 for phone compatibility.

Video: <https://dnd.nic024i.app/uploads/previews/fireball-wave-20261012/index.html>

Focused browser coverage checks the single front, expansion to the map-scaled
radius, projectile flight, light samples, expiry, detached GPU warmup, and skips
before/during shader compilation. This is a development change pending approval.
