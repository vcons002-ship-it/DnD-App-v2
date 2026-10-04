# Selective map feature analysis

In the DM's **Walls** menu:

- **Suggest walls, doors, windows & lights** opens full-map analysis options.
- **Analyze selected regions** opens a flat map image where the DM draws up to eight non-overlapping rectangles with a mouse or touch.

Both screens wait for **Analyze selected features**. Unchecking Walls, Doors, Windows or Lights skips that workflow entirely. Unchecking **Cave boundaries (second wall pass)** skips the natural-boundary request within the wall workflow. Arches currently remain a preview experiment and are not a production setup checkbox.

Include the whole feature and adjoining wall context in each rectangle. Remove individual rectangles or clear the selection before starting. Results still require review and **Apply selected setup**; doors and windows fit against existing walls and selected wall suggestions. Running only doors/windows requires existing walls.

## Crop alignment and API calls

Regions use normalized original-image coordinates, independent of map scale, tilt and rotation. The server rejects empty, overlapping and out-of-range rectangles, with a maximum of eight. Every crop must be at least 16 pixels wide and tall. Crops are padded to a supported image-API aspect ratio, then the returned mask is resized and unpadded into its exact original position. Pixels outside the selections are preserved. Raw responses and crop/padding metadata are saved with uploads.

Each enabled masking pass makes one image request per region. For example, Lights alone in two regions makes two image requests. Walls with cave boundaries enabled makes two requests per region. Full-map analysis retains its existing prompts and one request per enabled pass. Existing source-hash, grid and geometry freshness checks still prevent applying a stale draft.

## Qwen filtering experiment, 4 October 2026

The installed `qwen3.8:27b-q4_K_M` was asked simple yes/no questions about walls, caves, doors, arches, windows and lights in four map quadrants. Positive quadrants proceeded to the existing Gemini mask prompts. Thirteen of 24 feature/quadrant pairs were positive. That is not a cost saving relative to one full-map request per feature: splitting masks can increase request counts.

The filter missed a cave in every quadrant but recognized it with the full map. A full-map cave-mask fallback then incorrectly painted cabin walls green instead of tracing the cave. Qwen also claimed a light in the stream quadrant, where Gemini returned no light markers. Some positive crops produced extra window and light suggestions. No hand cleanup was used in these evidence images.

**Qwen gating is not enabled in the production workflow.** A negative answer is not yet safe grounds for silently skipping a requested feature. Manual feature selection and region cropping work independently of Qwen.

## Verification

- Type checking, production build and all 1,656 server tests passed.
- Six focused Playwright tests passed, covering no requests before Analyze, unchecked workflow/cave skipping, multi-region request payloads, partial retry, authorization and window fitting.
- A live disposable campaign sent two selected crops to Gemini with only Lights enabled, reviewed seven suggestions and applied them inside the chosen regions. This verifies request scope and coordinate placement, not that every AI suggestion is correct.
- Video and unchanged mask evidence: https://dnd.nic024i.app/uploads/previews/qwen-all-workflow-filters-20261004/
