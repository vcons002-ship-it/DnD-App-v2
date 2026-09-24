# AI fallback and recovery

Settings now offers Local first (Ollama, Gemini backup) and Gemini first (local
backup). Existing local-mode settings use the new fallback behavior after update.
A configured Gemini API key is required for cloud backup. All in-app text and
JSON workflows share this routing, including rules, recaps, creature dialogue,
sheets, creatures and appearance, spells, items, and shop inventory.

The API transport retries connection failures, timeouts, and HTTP 408, 429, 500,
502, 503, and 504, with three total attempts separated by 1 and 2 seconds.
Authentication and other permanent errors are not retried. Cancellation prevents
subsequent retries and fallback. Empty or unparsable local JSON also falls back;
this does not replace each feature's domain-specific validation of generated stats.

Authenticated DMs receive operational toasts and a durable DM-only chat record
for fallback, retry, recovery, and final failure. Notices are app-wide backend
status and do not include prompts, raw errors, API keys, or hidden creature data.
Normal successful local requests do not add status chatter.

ComfyUI token-art, map, and decal requests use the same retry transport for a
Gemini image backup. Configure Image API backup model in Settings; the default
is gemini-3.1-flash-image (or GEMINI_IMAGE_MODEL). Controls remain available when
ComfyUI is offline and a Gemini key is configured. Local LoRAs and custom graph
nodes are not portable; the fallback uses the final prompt and target aspect
ratio. The separate 2D-to-3D production pipeline has no in-game API fallback.

Image API request format follows Google's documentation:
https://ai.google.dev/gemini-api/docs/generate-content/image-generation

Validation uses simulated backend failures and image responses, without spending
API quota. This verifies routing, retries, cancellation and delivery, not current
API-key eligibility or cloud model availability.
