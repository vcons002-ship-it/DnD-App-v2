# Druk base basalt texture

Generated with the built-in image generation workflow on 2026-09-20. The output
is 1254 by 1254 pixels, copied unchanged to
`client/public/miniatures/druk-basalt-e19b0a12af0c.png`.
SHA-256: `e19b0a12af0c4f383b3731a90016184ad6799f0e6441df9e520d44595cf9013b`.

Applied in `miniatureBaseMaterial.ts` only to `Druk_Base_Earthy_Stone_Moss_Top`
and `Druk_Base_Low_Stone_*`. XZ planar UVs use the measured base center and
diameter. The runtime retains the source mesh/normal/index data and adds UVs;
vertex coloring is replaced with the texture, linear RGB tint (0.22, 0.22,
0.22), roughness 0.96, metalness 0 and a 0.0025 native-unit bump scale. The
same image supplies grayscale bump detail; it is not a scanned height map or
new displaced geometry. Rim, emblem, body, hands and weapons are unaffected.

## Exact generation prompt

Create a single high-resolution square seamless PBR base-color texture of dark cooled volcanic lava stone for the top surface of a fantasy miniature base. Straight orthographic top-down macro material scan, edge-to-edge charcoal-black basalt with irregular fractured plates, sharp chipped edges, fine porous pitting, rough granular rock and thin deep dark fissures. Mostly dark charcoal with restrained warm ash-grey variations so physical detail stays visible. Cooled stone, no bright molten orange, no emitted glow. Uniform diffuse neutral lighting, no cast shadows, no directional lighting, no perspective, no vignette, no objects, no borders, no miniature, no text. Fine crisp natural surface detail at highest available resolution, suitable to map over a circular tabletop base. Deliver the rock texture only.
