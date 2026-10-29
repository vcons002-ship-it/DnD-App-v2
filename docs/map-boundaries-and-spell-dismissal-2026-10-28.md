# Natural boundary controls and persistent spell prompt dismissal

Closing the automatic spell damage dock now records a browser-local dismissal for that campaign, role and cast. Close, Done and Escape share this behavior. A reload or remount does not reopen the dock. The original roll and server damage/target budget remain available: deliberately selecting Apply damage in the roll log reopens targeting, and a new cast has its own prompt. Storage failures retain the existing in-memory dismissal behavior.

The previous behavior was reproduced with a saved DM Bone Shard Burst entry against the prior production build: Close hid it, then reload displayed it again. The updated browser regression verifies persistent Close, Done and Escape, deliberate log reopening, a real subsequent cast and its independent dismissal. The frontend fix was published and verified on localhost and the public host at 23:37 UTC on October 28.

## Natural boundaries

The latest installed mask pair from 23:33:50 and 23:34:12 UTC was inspected without generating more AI images or changing the campaign. The second image recolored structural yellow markings green instead of tracing the natural cave edges. Running the real add-only merge against those files produced zero added pixels, 30 ignored masonry components and no natural layer. This was a pass with an unusable result, rather than a skipped API call. The diagnostic receipt is in `artifacts/natural-boundary-only-20261028/prior-output-diagnosis.json`.

The AI analysis menu now has a dedicated **Natural boundaries only** entry. Both the standalone wall dialog and combined map analysis expose three choices: structural walls and natural boundaries, structural walls only, or natural boundaries only. The natural-only option sends `structuralWalls:false,naturalBoundaries:true`, bypasses the automatic feature gate, analyzes original assembled map artwork and requests no structural mask. Selected regions remain supported through the combined analysis controls.

Natural-only conversion uses the extracted natural layer, so unrelated original map pixels do not become structural walls. Conversion failure cannot fall back to generating masonry walls. Apply retains the existing append-only review and source-change validation. Saved walls and map artwork remain intact; the user reviews and applies only the new suggestions.

The natural mask prompt now explicitly preserves existing yellow paint, forbids recoloring or retracing masonry, and asks for previously unmarked rock boundaries. A pass that produces no usable additions now returns a clear warning with the natural-only retry option. This does not establish that a future image-model response will correctly identify every cave edge; the user's map has not been regenerated in this work.

## Validation and deployment evidence

- Production client build and server/client TypeScript checks passed.
- 28 focused tests passed for map geometry, natural merging and framing. The forced natural-only test verifies one image request, filter bypass, saved-wall preservation and unchanged map art through real Apply.
- Five browser workflows passed for default combined analysis, structural-only selection, forced natural-only selection, the dedicated menu with real Apply, and persistent spell dismissal.
- Tests used disposable databases and stubbed paid image generation. No AI provider calls or map applications were made to the user's campaigns.
- The backend/frontend deployment helper records restart, publication, source hashes, database integrity, protected configuration hashes and campaign row counts under `artifacts/natural-boundary-only-20261028`. A successful build is separate from a completed service restart; check the deployment receipt for the final outcome.
