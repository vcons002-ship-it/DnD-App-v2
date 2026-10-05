# Selective map feature analysis

In the DM's **Walls** menu:

- **Suggest walls, doors, windows & lights** opens full-map analysis options.
- **Analyze selected regions** opens a flat map image where the DM draws up to eight non-overlapping rectangles with a mouse or touch.

Both screens wait for **Analyze selected features**. Unchecking Walls, Doors, Windows or Lights skips that workflow entirely. Unchecking **Cave boundaries (second wall pass)** skips the natural-boundary request within the wall workflow. Arches currently remain a preview experiment and are not a production setup checkbox.

Include the whole feature and adjoining wall context in each rectangle. Remove individual rectangles or clear the selection before starting. Results still require review and **Apply selected setup**; doors and windows fit against existing walls and selected wall suggestions. Running only doors/windows requires existing walls.

## Crop alignment and API calls

Regions use normalized original-image coordinates, independent of map scale, tilt and rotation. The server rejects empty, overlapping and out-of-range rectangles, with a maximum of eight. Every crop must be at least 16 pixels wide and tall. Crops are padded to a supported image-API aspect ratio, then the returned mask is resized and unpadded into its exact original position. Pixels outside the selections are preserved. Raw responses and crop/padding metadata are saved with uploads.

Each enabled non-window masking pass makes one image request per selected region after its full-map Qwen check. Full-map analysis retains one image request per allowed non-window pass. Windows check four context-padded quadrants and mask positive/uncertain quadrants only, intersecting them with DM-selected regions when present. Context pixels help identify windows at seams but only the selected rectangle is copied into the final mask. Existing source-hash, grid and geometry freshness checks still prevent applying a stale draft.

## Qwen filtering experiment, 4 October 2026

The installed `qwen3.8:27b-q4_K_M` was asked simple yes/no questions about walls, caves, doors, arches, windows and lights in four map quadrants. Positive quadrants proceeded to the existing Gemini mask prompts. Thirteen of 24 feature/quadrant pairs were positive. That is not a cost saving relative to one full-map request per feature: splitting masks can increase request counts.

The filter missed a cave in every quadrant but recognized it with the full map. A full-map cave-mask fallback then incorrectly painted cabin walls green instead of tracing the cave. Qwen also claimed a light in the stream quadrant, where Gemini returned no light markers. Some positive crops produced extra window and light suggestions. No hand cleanup was used in these evidence images.

This quadrant-everywhere experiment was not enabled. It is superseded by the requested full-map gate below.

## Active Qwen gate, 5 October 2026

- Walls, natural/cave interiors, doors and lights use the full original map for local yes/no checks. Their accepted masking prompts and separate API requests are unchanged.
- Windows use four quadrants, with 4% of map width/height as surrounding context on internal edges. Positive quadrants proceed to the simple window mask prompt, with matching context around API crops and exact restoration into map coordinates.
- Choose the configured installed Qwen model when applicable, otherwise the newest installed Qwen name. No model is downloaded automatically. The tested machine selected `qwen3.8:27b-q4_K_M`.
- A clear `no` skips that API pass and returns an empty review. Missing local service/model, timeout or an ambiguous reply proceeds through the existing image API instead. Operational notices explain checks, skips and fallback; JSON receipts retain the decision and image hash.
- Disabled passes still do not run. The optional natural pass is gated independently, so a map without structural walls can still receive cave boundaries.
- Local answers are a cost filter, not proof of correct detection. Negative answers can miss features. Review the final mask and use manual editing where necessary.

Fresh generated inn/cave map: 8 local checks, all positive; 8 image masking calls (walls, caves, doors, four window crops, lights). No cloud-request saving on this particular map. The normal sequential UI fitting policy applied 24 wall pieces, 4 of 7 door candidates, 19 fitted window pieces from 23 blue components, and 22 lights in a disposable save. Blue panes split several physical windows into multiple pieces; 3 door candidates lacked adequate jamb support. No masks or map geometry were manually corrected. See `docs/QWEN_FULL_MAP_GATE_TEST_2026_10_05.md`.

## Verification

- Type checking, production build and all 1,656 server tests passed.
- Six focused Playwright tests passed, covering no requests before Analyze, unchecked workflow/cave skipping, multi-region request payloads, partial retry, authorization and window fitting.
- A live disposable campaign sent two selected crops to Gemini with only Lights enabled, reviewed seven suggestions and applied them inside the chosen regions. This verifies request scope and coordinate placement, not that every AI suggestion is correct.
- Video and unchanged mask evidence: https://dnd.nic024i.app/uploads/previews/qwen-all-workflow-filters-20261004/
