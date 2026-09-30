# Map geometry drafts (experimental)

DM: **Walls → Suggest walls from map art**.

Two methods share one review screen and JSON contract:

- **Local contrast / empty space:** server-side image processing, no AI or network call. Choose darker/lighter walls, brightness threshold (0–255), and minimum wall length in grid squares. Finds long contrast bands, merges adjacent scan lines and filters broad floor regions. Best on clean top-down floor plans; painted maps often confuse floor, furniture and shadows with walls. All suggestions start unselected. The 0.55 score is a heuristic warning, not a calibrated probability; 10 ft is a placeholder height.
- **AI image analysis:** sends a resized, uncropped map image and original dimensions/grid metadata through the existing AI gateway. Ollama receives image data when local mode is configured; the configured model must support vision. Gemini is the API backup, with three connection attempts and DM notices. Image requests have a longer timeout than text requests. Invalid geometry triggers the gateway fallback too.

Click rectangles or checkboxes to select walls, then Apply. Orange dashed means unselected, gold selected, green doorway, blue obstacle. Analysis never modifies gameplay. Apply appends selected full-height wall rectangles atomically and preserves existing walls. Adjust or erase applied walls using the existing tools. Door candidates mark gaps only: use Draw door opening to create an interactive door. Obstacles and estimated heights are review/export data only; they do not yet affect shadows, movement or vision.

## API

Both endpoints require the existing DM passphrase header. They read the saved map image; clients do not send arbitrary file paths or image URLs.

`POST /api/maps/:mapId/wall-draft`

```json
{"method":"local","options":{"threshold":90,"polarity":"dark","minLengthSquares":2}}
```

For AI use `{"method":"ai"}`. The response is a `MapGeometryDraft`:

```json
{
  "version": 1,
  "method": "ai",
  "id": "generated-uuid",
  "source": {
    "mapId": "map-id",
    "imageHash": "sha256-of-original-file",
    "width": 1402,
    "height": 1122,
    "gridSizePx": 50,
    "feetPerSquare": 5,
    "gridOffsetX": 0,
    "gridOffsetY": 0,
    "wallsHash": "sha256-of-current-walls"
  },
  "items": [
    {"id":"item-0","kind":"wall","label":"North wall","ax":0.1,"ay":0.1,"bx":0.5,"by":0.12,"heightFt":10,"confidence":0.9},
    {"id":"item-1","kind":"obstacle","label":"Table","ax":0.6,"ay":0.4,"bx":0.7,"by":0.45,"heightFt":3,"confidence":0.8}
  ]
}
```

Coordinates are normalized to the entire source image: top-left origin, x right, y down. Pixel x = normalized x × image width, pixel y = normalized y × image height. Heights are feet. Image resizing preserves aspect ratio and never crops; camera zoom, pan, tilt and rotation never enter this contract. EXIF orientation is accounted for. Grid offsets are sent for analysis, not added again to returned coordinates.

`POST /api/maps/:mapId/wall-draft/apply`

```json
{"draft":"the complete returned JSON object goes here","selected":["item-0"]}
```

The server validates shape, finite values, bounds, image/grid identity, current walls, selected kinds and the existing wall-edge limit. A changed image, grid or wall set invalidates the draft. Download JSON preserves the complete draft for inspection; drafts are currently held in the review window, not saved to the campaign. Applied walls use normal map persistence and backups.

Version 1 analyzes only the base uploaded image, not separately placed map tiles. Footprints are axis-aligned rectangles. Isometric floor footprints and heights are ambiguous and require human review. Future versions can add polygons, separate movement/vision/shadow flags, and approved obstacle persistence without changing the coordinate convention.


## Yellow mask experiments (29 September 2026)

The built-in OpenAI image tool produced a closer wall mask than coordinate prompting. Two independent Gemini API tests used `gemini-3-pro-image` (confirmed by the response's `modelVersion`) with the original map as image input. First attempt painted broad wall regions and altered much of the background; a targeted retry followed wall caps more closely but returned outlines rather than filled regions. These are isolated artifacts, not applied campaign walls.

The image gateway now supports reference-image input and selects the nearest supported aspect ratio instead of forcing landscape images to 3:2. It ignores intermediate thought images when saving final output. Pro generation has a longer timeout and retains the existing connection retries.

All Gemini text/JSON calls share the quality-first `gemini-3.1-pro-preview` default; image calls use `gemini-3-pro-image`. Startup upgrades the named legacy Gemini/Flash presets from env or saved settings. Other custom model names remain intact, and Settings still allows overrides. Blank model selection during a running session auto-discovers Pro first; startup resolves blank to the documented default. No live installed settings or campaign files were modified by these tests.

Model references: https://ai.google.dev/gemini-api/docs/models and https://ai.google.dev/gemini-api/docs/image-generation .
