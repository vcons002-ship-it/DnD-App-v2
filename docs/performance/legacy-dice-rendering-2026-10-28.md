# Legacy dice rendering

Legacy map mode and dice rendering are independent browser preferences. The Dice selector is available on the startup screen, join screens and map View controls, for both DM and player browsers.

- Automatic (default) tries WebGL dice and falls back to animated Canvas2D dice if graphics initialization or drawing fails.
- 3D requests the WebGL tray. Graphics failure or context loss still falls back to 2D so rolling remains usable.
- 2D dice animations use the existing faceted Canvas2D tumble and landing animation, without importing the material/tray renderer or starting a local dice-physics worker.

Legacy does not globally block WebGL. It continues to exclude 3D map models, mist and other costly map effects. Browser-accelerated Canvas2D/image compositing remains available. This change enables the dice WebGL path independently; it does not add a new WebGL map renderer or establish that WebGL is faster for every Legacy workload.

Legacy skips background dice-theme warmup during campaign loading. Dice graphics load on demand when a roll arrives. Its live 3D tray is capped at 30 draws per second and a display pixel ratio of one, alongside the existing Low dice-resolution/shadow budget. Normal standard-mode rendering retains its existing cadence. Only animated 2D Legacy clients discard redundant intermediate physics poses; 3D Legacy receives the poses needed for the authoritative animation.

The 2D fallback preserves the server's faces, percentile tens/ones, roll calculations, saving-throw controls and hidden DM approval. It does not substitute a text-only results card. Large live rolls display at most 24 animated dice while retaining all result entries. Local rendering choice does not change another viewer's dice appearance, the server simulation, outcomes, or server-assistance preference.

Validation uses disposable campaigns and the isolated client distribution. Browser regressions cover cold Legacy DM/player 3D d20 and percentile rolls, explicit 2D without WebGL/model imports, unavailable WebGL falling back to animated 2D, persisted preferences and private DM approval. An actual `WEBGL_lose_context` check verifies fallback after a working 3D context is lost. Mixed-mode material checks and the live-dice server contracts cover shared faces, private rolls, readiness, skipping and disconnect completion. Saved screenshots are taken while the actual settled tray is visible, before the later roll-log publication can replace it with the calculation screen.

The full unit suite passed: 2,403 tests across 244 files. Client/server typechecks and production builds passed. These are functionality checks on the current PC, not a performance certification of physical old CPUs or integrated GPUs. Changes are in the PR checkout and have not been deployed to the live app or DnDServer.
