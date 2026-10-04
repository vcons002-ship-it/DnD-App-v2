# Complex dungeon wall conversion test - 4 Oct 2026

PR #102 merged the cave seam and prompt changes into claude/Main. A fresh app setup run on the circular/octagonal/curved-corridor dungeon exposed a separate classifier error: the raw structural API mask contained two interior loops, but both were removed before contour conversion. Slightly muted yellow paint had a green channel below the exact-paint threshold.

The converter now accepts muted, strongly saturated yellow cores only when they have changed substantially from the original map image. Unchanged warm map art and shifted yellow-green flowers remain excluded. No mask pixels or map artwork were manually edited.

A new regression failed before this change and passes afterward. It covers sight and movement blocking, unchanged yellow artwork, and the open entrance. Existing false-positive artwork tests still pass.

Reprocessing the exact saved raw API responses changes the draft from 2 wall pieces / 305 edges to 4 wall pieces / 419 edges. Both interior loops survive; automatic door fitting improves from 1 of 9 to 8 of 9. The setup still contains false-positive window candidates, and one door remains unfitted. No false-positive candidates were removed for the test. The light pass reported no markers on this unlit map.

Evidence is in the separate test checkout artifacts/complex-dungeon-20261004 and artifacts/complex-dungeon-corrected-20261004. The initial run made five image-API requests (structural, natural, doors, windows, lights). The comparison reuses those same raw responses; it does not retry the AI to obtain a more favorable result.

Verification: type checking and all 1651 automated tests passed after the correction. Browser setup and player movement checks use a disposable campaign on port 4184; the stable installation and campaign data were not replaced.

Nine sight and collision probes passed across circular, octagonal, diagonal, rectangular, and cave boundaries and their open corridors. Those probes isolate structural/natural wall conversion from the separate window pass. The window API proposed 29 openings on this map, which has no windows; all are retained in the setup test to expose that limitation rather than hide it.

