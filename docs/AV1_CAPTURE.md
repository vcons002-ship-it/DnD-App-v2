# App demonstration capture

The linked-spell recorder defaults to browser compositor frames captured at
60 fps into FFmpeg's `av1_nvenc` encoder on GPU 0. This machine's GPU 0 was
verified as an NVIDIA GeForce RTX 5090. Video inspection confirmed codec AV1
and frame rate 60/1. This replaces Playwright's software VP8/25 fps recorder.
An installed FFmpeg with AV1 NVENC support is required; the recorder errors
explicitly if hardware encoding fails. `DND_CAPTURE_GPU` selects another GPU.

In PowerShell from the repo root:

```powershell
$env:PW_CHROMIUM='C:/Program Files/Google/Chrome/Application/chrome.exe'
$env:E2E_PORT='4118'
$env:DND_LINKED_VIDEO='1'
npx.cmd playwright test -c e2e/playwright.config.ts e2e/linked-spells-video.spec.ts --output=artifacts/linked-spells-av1
```

The opt-in demonstration runs a disposable campaign with real UI controls,
server dice physics and completed roll results. Vanec is explicitly a Sorcerer
in this fixture, with demonstration spells added separately; using Wizard here
incorrectly selected generic dice and omitted his red glass dice/tray.

Each clip writes `capture-av1.mp4`, `capture.json`, `performance.json`, chapter
times and runtime evidence. Captions belong outside the application controls.
Frame scheduling samples distinguish browser stalls from capture judder; they
are not a substitute for GPU render-time measurements or mobile profiling.
Hardware encoding changes the capture workload, not players' rendering or
server dice mechanics.

`DND_LINKED_SPELLS='Shocking Grasp'` limits a diagnostic run. Optional
`DND_PROFILE_NO_VIDEO=1` collects the same browser evidence without capture.
`DND_CAPTURE_AV1=0` explicitly opts back into the old software recorder.
