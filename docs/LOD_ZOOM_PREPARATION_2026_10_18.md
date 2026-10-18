# Preparing character detail during zoom - 18 October 2026

Each resolved graphics preset uses only its distant and close-up model. After
visual review, High/Balanced use Low at distance; Low still uses Battlefield.
The performance traces and 51,832-triangle figures below describe the earlier
common-Battlefield trial. Current loading assertions are linked from
[the updated policy](TWO_TIER_MINIATURES_2026_10_18.md).
Close art is still restricted to figures
whose measured bounds intersect the viewport and which are not fog-hidden.

## Changes

- Camera detail checks run at most every 80 ms during a gesture, rather than
  debouncing until the camera stops. Only a changed loading/display decision
  triggers the heavier scene sync.
- Close art starts preparing at 55% of its display-size threshold. The original
  display thresholds and 15% size hysteresis remain unchanged.
- The existing coarse body stays visible while the replacement is parsed,
  cloned, measured and shader-compiled. Vertex/index buffers are uploaded one
  mesh per browser frame using zero-pixel draws with the actual scene lighting.
  The draw restores camera layers, light layers, scissor, shadow flags and parent.
- Both tiers reuse the coarse movement-preview silhouette. A detail change no
  longer expands hundreds of thousands of dense triangles into a new planning
  mesh on the main thread.
- Once detail has been requested, the two ready bodies can be reused while that
  figure stays on-screen. Zoom reversals do not download/parse GLBs or rebuild
  instances again. The inactive body is detached from the scene: it is not drawn,
  animated, included in batches, or considered for shadows.
- A 350 ms downgrade dwell absorbs rapid zoom-out/zoom-in reversals. Sustained
  zoom-outs select Battlefield. Off-screen/fog-hidden figures downgrade without
  that delay and release their prepared close tier.

This trades additional retained RAM/VRAM for smoother repeated zooming; it does
not render both models. During the 350 ms dwell the detailed model continues to
render alone, so that short interval retains its higher geometry cost. After the
downgrade the cached model adds no map draw calls or rendered triangles. The
cache remains bounded to the preset's two tiers for each on-screen figure.
Changing graphics presets may temporarily replace the old tier during loading;
old browser HTTP cache entries are not purged.

## Measurements

One matched cold-page trace per version and adapter used the Druk courtyard
preview, 1800x1080 DPR 1, a seven-second continuous zoom and 2.5-second hold.
Chrome used the adapter LUIDs from the verified integrated/5090 performance
tests. No video recording or unit tests ran during these samples.

| RAF frame gap | RTX 5090 before / after | AMD integrated before / after |
|---|---:|---:|
| Largest gap in the sampled zoom | 245.8 / 58.8 ms | 349.9 / 59.6 ms |
| Largest gap within 150 ms of the model swap | 245.8 / 4.6 ms | 349.9 / 19.0 ms |

The detailed GLB request moved from about 5.4 seconds into the zoom to 3.1
seconds. The actual swap moved from roughly 5.9 seconds to 5.3 seconds, when
the display threshold was crossed. Remaining cold-load preparation can still
produce a short frame gap; this is not a claim of zero stutter or a multi-run
average FPS measurement. Network speed can also delay first-time close art.

[Recorded timings](performance/lod-zoom-2026-10-18/comparison.json) include
long-task records and the frame timestamps around each swap.

## Regression checks

The reusable real-renderer loading test covers High, Balanced and Low:

- Exact two-tier URL sets and no hidden/off-screen detail requests.
- Pure imperative continuous camera zoom, without React prop changes; the close
  request starts before the gesture ends and the model upgrades during it.
- One coarse planning silhouette per character across both detail tiers.
- Repeated rapid and sustained zoom cycles: no additional model requests,
  bounded swaps during quick reversals, and no increase in far-view color
  triangle or draw-call counts while detail remains cached outside the scene.

Unit regressions cover downgrade timing/reversal/off-screen release and the GPU
warmup's one-mesh-per-frame behavior, cancellation, and render-state restoration
after an upload failure. Use the build/loading commands in
[two-tier model tests](TWO_TIER_MINIATURES_2026_10_18.md).

The rapid-zoom regression in all three presets produced only two swaps across
six quick reversal cycles and made zero additional GLB requests. With close art
held ready but detached, the far view rendered 51,832 triangles in 43 calls;
the same budget remained after two additional sustained zoom cycles. No cached
body was attached to the scene. Moving that figure off-screen released its
prepared close tier. These counts isolate Druk from other characters' animated
FX and establish rendering cost, not the number of bytes retained in GPU memory.
