# Root coverage 02

The initial lavender paint stopped at a camera-oriented root cutoff. A small part of the tail's upper/root surface therefore retained the original robe-red color even though the spade and exposed loop were already correct.

This revision adds 925 verified root surface triangles to the Blender selection, following the cylindrical root around both sides until it meets the overlying belt/robe. The root's geometry, normals, UVs, and all other material properties remain unchanged. The same original OKLab transfer parameters are retained, so every previously lavender pixel remains exact.

The revised core mask covers 41,375 pixels. The final mask covers 53,528 pixels after protecting non-tail UVs and adding the same two-pixel filtering gutter. Exactly 7,797 additional pixels change compared with revision 1. All other body pixels, all protected robe UV pixels, and alpha stay exact. The cumulative edited RGBA SHA256 is `ffad1bc3a976805f2dbd1d2ef39e341178b9a6cf0a7e8a311b75d46272dde261`.

`paint-receipt.json`, the immutable original atlas, corrected PNG, masks, and self-contained High source in this folder are the reproduction inputs. The parent folder retains the first revision unchanged for provenance. The stable command reads the active High delivery receipt's `tailRecolor.paintReceipt` to select the appropriate revision:

```powershell
node scripts/token-assets/rebuild-vanec-tail.mjs --out C:/Temp/vanec-tail-root-reproduction
```

It reproduces the pixel result and all four currently registered deliveries without changing production files or regenerating any tier geometry. Current shared deliveries:

- High: `vanec-tail-root-high-shared-312f58a9ae16.glb`
- Balanced: `vanec-tail-root-balanced-shared-53e16b642f1d.glb`
- Low: `vanec-tail-root-low-shared-54193adbf01e.glb`
- Battlefield: `vanec-tail-root-battlefield-shared-2986291dfb35.glb`

High was inspected from the top and both sides. Low and Battlefield were checked with matching rear and opposite-side root close-ups for coarse UV bleeding; the surrounding red robe remained unchanged. No quality reduction, repair, or mesh export was rerun.
