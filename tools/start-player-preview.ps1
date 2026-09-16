$ErrorActionPreference = 'Stop'
$previewRepo = Split-Path -Parent $PSScriptRoot
$previewData = Join-Path $previewRepo '.preview-review'
if (-not (Test-Path -LiteralPath (Join-Path $previewData 'game.db'))) {
    throw 'Create the isolated campaign copy before starting this preview.'
}
$env:DATA_ROOT = $previewData
$env:DB_PATH = Join-Path $previewData 'game.db'
$env:PORT = '4276'
$env:DND_HOST = '127.0.0.1'
$env:DND_PREVIEW = '1'
$env:PUBLIC_URL = 'http://127.0.0.1:4276'
$env:DM_PASSPHRASE = 'local-preview-only'
$env:GEMINI_API_KEY = ''
$env:OLLAMA_URL = 'http://127.0.0.1:1'
$env:COMFY_URL = 'http://127.0.0.1:1'
Set-Location -LiteralPath $previewRepo
Write-Host 'LOCAL PREVIEW ONLY - independent data; nothing here writes back to the campaign.'
& node --import tsx server/src/index.ts
