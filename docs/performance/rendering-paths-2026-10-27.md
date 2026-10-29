# Rendering and hardware selection audit

**2026-10-28 follow-up:** the two gaps described below were subsequently changed and measured. Legacy now skips perspective buffers/input, and the miniature renderer requests `high-performance`. See [the controlled before/after report](legacy-optimizations-2026-10-28.md). The rest of this document retains the 2026-10-27 audit context.

Checked against the local source on 2026-10-27. This is an explanation of the current implementation; no rendering policy was changed for the movement benchmark.

## How work is divided

| Path | Implementation | Performance controls |
|---|---|---|
| Legacy map and tokens | Konva Canvas2D plus a basic SVG visibility overlay | Pixel ratio 1, flat tokens, still maps, no 3D asset preloads or miniature renderer, cached visibility polygons, coalesced visibility updates at most twice per second, no movement interpolation or decorative particle/shadow/dice scenes |
| Standard map and miniatures | Canvas2D map/input layers plus Three.js WebGL miniatures, atmospheric lighting, effects and GPU vision compositing | One miniature renderer for the scene, model variants, instanced batching where compatible, capped pixel ratio, shadow size/light-count limits, effect budgets, cached assets and event-driven rendering |
| Auto quality | The same standard renderer, changing high/balanced/low budgets | Sustained frame-time sampling; excludes loading, hidden tabs and idle time. It checks whether a quality reduction actually improves performance and backs off repeated unsuccessful upgrades |
| Server | Node CPU, authoritative movement/visibility filtering and shared state | A client rendering mode does not reduce the other clients' graphics or change game outcomes. Client-side mask geometry, decoding, UI and drawing still cost local CPU |

Sources: [budgets](../../shared/graphicsQuality.ts), [quality store and sampling](../../client/src/lib/useEnvironmentQuality.ts), [Auto controller](../../shared/adaptiveGraphics.ts), [Legacy visibility](../../client/src/canvas/LegacyVisionOverlay.tsx), [geometry cache](../../client/src/canvas/legacyVision.ts), [miniature renderer](../../client/src/canvas/MiniatureLayer.tsx), [batching](../../client/src/canvas/miniatureBatches.ts), [frame scheduling](../../client/src/canvas/battlefieldFrame.ts).

The default quality is Balanced. Auto operates only when selected. It starts at High on a wide viewport and Balanced on a narrow one. It examines roughly three-second windows, needs sustained slow windows before lowering a tier, waits between changes, and requires sustained fast rendering before recovering quality. It does not automatically switch to Legacy.

Legacy is selected before the campaign routes import, so choosing it avoids initializing and preloading the 3D scene. The choice is local to each browser. Flat/2D tokens alone do not imply Legacy: standard mode can still render an atmospheric WebGL scene with flat tokens.

WebGL is a browser graphics API, not a processor separate from the CPU/GPU. Canvas2D can also be accelerated by a GPU; the browser chooses the backing implementation. The application does not force software rendering in normal Legacy mode. The benchmark deliberately disables GPU acceleration and blocks WebGL to measure the fallback. [HTML Canvas implementation notes](https://html.spec.whatwg.org/dev/canvas.html#implementation-notes).

Some standard-mode CPU work is moved into browser workers: shadow mesh reduction and dice physics. The Legacy mask polygon computation remains on the client main thread. No WebGPU renderer or Legacy OffscreenCanvas worker renderer was found in the application source.

## What is not automatic

The application has no startup comparison that benchmarks Canvas2D against WebGL and chooses the fastest complete renderer. Auto adjusts quality within the standard path; it is not a CPU-versus-GPU selector. It also does not identify which portion of a slow frame is server time, network delay, JavaScript, CPU rasterization or GPU execution before selecting a backend.

The miniature renderer explicitly requests `powerPreference: 'low-power'`. On a machine with multiple GPUs that is a power-saving preference, not a fastest-GPU request. It is only a hint and the browser may ignore it. [WebGL context creation attributes](https://registry.khronos.org/webgl/specs/latest/1.0/#5.2).

There is remaining avoidable Legacy overhead: MapStage still calls `installPerspectiveCanvas` even with Legacy's fixed zero tilt and zero rotation. That utility reserves the full 45-degree orbit envelope for each applicable layer, including additional scene/hit/buffer canvases. For a 1440 × 772 viewport its padded surface is 2636 × 1868, about 4.43 times the visible pixel area per surface. This is a buffer-area calculation, not a measured total RAM or CPU saving. It is a concrete candidate for a separately measured improvement; it was retained for the current benchmark so the recordings match the existing build.

Sources: [MapStage canvas setup](../../client/src/canvas/MapStage.tsx), [perspective canvas allocation](../../client/src/canvas/perspectiveCanvas.ts), [projection padding](../../client/src/canvas/miniatureProjection.ts).

The current implementation provides explicit compatibility and quality controls, and a working adaptive quality loop. It does not establish that every device is using its fastest possible rendering path. The paired movement benchmark measures that practical limit separately from a functional pass.
