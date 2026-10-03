# Simple windows-only mask test

One isolated Gemini image API request on the original courtyard map.

Prompt: Look at the walls of this battle map. Paint existing window openings or narrow viewing slits solid blue (#0000FF). Leave solid walls, broken wall tops, doors and arches unmarked. Keep the map unchanged otherwise. If there are no windows or slits, add no marks.

The raw result is more selective than the previous windows-only test but still marks candidates on apparently solid masonry. No candidates were removed, no output pixels were repaired, and no geometry was converted or applied. Window integration should allow visibility and block player movement regardless of size. This is a prompt experiment, not an implemented window feature.

The comparison page includes the exact original reference and links the previous raw result for context. The previous request used an arch-marked input; this request uses the original map only. Prompt, model, duration and image hashes are in receipt.json.
