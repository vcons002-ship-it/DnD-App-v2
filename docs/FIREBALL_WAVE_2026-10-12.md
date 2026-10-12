# Fireball: one expanding dome blast

The previous explosion used eighteen independently expanding spheres plus a
plain circular outline. The first revision used a connected polar surface, but
its hollow center read as a ring. The current revision uses one hemisphere
filled with ray-marched fire. Advected, twisted 3D noise makes rolling flame
folds inside the volume, with orange-red variation, hotter pockets and soft
edges. It expands once to the selected radius, then cools and fades.

A shared 32 KiB 3D noise texture avoids evaluating procedural noise repeatedly
for every volume step. Normal rendering takes up to 32 samples; reduced effects
use 16 samples and stop texture motion. This is a visual quality limit, not a
change to the area or damage. No external images or new downloads are required.

The 600 ms projectile flight, existing 20 ft Fireball radius, and damage/roll
release timing remain unchanged. Illumination is sampled at three points along
the actual expanding front; the traveling projectile has its own sample.
Geometry and noise are shared across casts and shaders still prepare during the
roll hold, including the dome surface and noise texture before impact.

The comparison uses the real app renderer and its cosmetic `fx:hp` event with
identical source, target area, map and cameras. The effect is replayed without
rolling combat or changing HP so the two visuals can be compared directly.
Captured using Windows Graphics Capture with RTX 5090 AV1 NVENC at 60 fps;
the public embedded copy uses H.264 for phone compatibility.

Video: <https://dnd.nic024i.app/uploads/previews/fireball-wave-20261012/index.html>

Dome versus ring: <https://dnd.nic024i.app/uploads/previews/fireball-dome-20261012/index.html>

Focused browser coverage checks the single front, expansion to the map-scaled
radius, projectile flight, light samples, expiry, detached GPU warmup, and skips
before/during shader compilation. A GPU pixel test verifies a filled center from
overhead and oblique cameras, checks reduced rendering, and rejects shader or
WebGL errors. This is a development change pending approval.
