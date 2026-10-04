# Enhanced-reference window mask test

One Gemini image API call supplied the original map first and a deterministic enhanced reference second. The reference preserves dimensions, uses grayscale luminance, lifts values below 128/255 by up to 12/255, and blends 35% contrast-limited local enhancement (128 x 128 regions, maximum slope 2) with 65% lifted luminance. No geometry, light beams or new features were generated into the reference.

The prompt retains the closer test's exclusions and adds the reference roles, light-through-openings cue and no-assumed-symmetry instruction. This therefore is not a controlled measurement of preprocessing alone.

The raw output still marks apparent solid-wall candidates, including paired/repeated slit-shaped marks. Detection is not established as reliable. No output edits, candidate removals, geometry conversion or map application. Windows are intended to allow visibility while blocking player movement regardless of size.

Exact prompt, model, duration, processing recipe and hashes are in receipt.json. Comparison page: https://dnd.nic024i.app/uploads/previews/courtyard-enhanced-windows-20261003/index.html
