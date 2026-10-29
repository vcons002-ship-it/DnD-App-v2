param([Parameter(Mandatory=$true)][string]$OutputPath,[switch]$SinglePass)
$ErrorActionPreference='Stop'
$repoRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
Set-Location -LiteralPath $repoRoot
$outputRoot=[IO.Path]::GetFullPath($OutputPath)
if(Test-Path -LiteralPath $outputRoot){throw "Use a new output folder: $outputRoot"}
[IO.Directory]::CreateDirectory($outputRoot) | Out-Null
$utf8=[Text.UTF8Encoding]::new($false)
$cases=@(
 @{name='trial1-on-1x-snap';rate=1;assist=$true;smooth=$false;trial=1},
 @{name='trial1-off-20x-snap';rate=20;assist=$false;smooth=$false;trial=1},
 @{name='trial1-on-20x-snap';rate=20;assist=$true;smooth=$false;trial=1},
 @{name='trial1-off-1x-snap';rate=1;assist=$false;smooth=$false;trial=1},
 @{name='trial2-off-1x-snap';rate=1;assist=$false;smooth=$false;trial=2},
 @{name='trial2-on-20x-snap';rate=20;assist=$true;smooth=$false;trial=2},
 @{name='trial2-off-20x-snap';rate=20;assist=$false;smooth=$false;trial=2},
 @{name='trial2-on-1x-snap';rate=1;assist=$true;smooth=$false;trial=2},
 @{name='smooth-on-20x';rate=20;assist=$true;smooth=$true;trial=1},
 @{name='smooth-on-1x';rate=1;assist=$true;smooth=$true;trial=1}
)
if($SinglePass){$cases=@($cases | Where-Object { $_.trial -eq 1 })}
$clientOutput=if($env:E2E_CLIENT_DIST){Join-Path $env:E2E_CLIENT_DIST 'index.html'}else{'client/dist/index.html'}
$manifest=@{startedAt=[DateTime]::UtcNow.ToString('o');status='running';clientIndexSha256=(Get-FileHash -LiteralPath $clientOutput -Algorithm SHA256).Hash;gitHead=(& git rev-parse HEAD);singlePass=[bool]$SinglePass;method='Legacy fixed, two players, 143 tokens / 48 lights / 28 wall pieces. Snap trials compare assistance on/off at 1x/20x; assisted smooth runs are supplemental. Snap is forced only by a test-only capability override, with no user-facing animation toggle. New disposable server and campaign per run. Both clients settle before the next move and before ending the CPU window. No video, CPU profiler, Playwright tracing or phase timing. GPU/accelerated Canvas2D disabled and WebGL blocked.';cases=$cases}
$manifestPath=Join-Path $outputRoot 'manifest.json'
$save={ [IO.File]::WriteAllText($manifestPath,($manifest | ConvertTo-Json -Depth 8),$utf8) }
& $save
$env:PW_CHROMIUM='C:\Program Files\Google\Chrome\Application\chrome.exe'
$env:E2E_PORT='4128'
$env:E2E_SOFTWARE_GL='0'
$env:E2E_PERFORMANCE_METRICS='1'
$env:SERVER_OFFLOAD_NO_VIDEO='1'
$env:SERVER_OFFLOAD_PROFILE='0'
$env:SERVER_OFFLOAD_PLAYWRIGHT_TRACE='0'
$env:SERVER_OFFLOAD_TIMING='0'
$env:SERVER_OFFLOAD_COMPAT='0'
$env:SERVER_OFFLOAD_ABLATIONS='0'
$env:SERVER_OFFLOAD_RETAINED_OFF='0'
$env:SERVER_OFFLOAD_OBSERVERS='1'
try{
 foreach($case in $cases){
  $case.startedAt=[DateTime]::UtcNow.ToString('o');$case.status='running'
  $env:SERVER_OFFLOAD_OUTPUT=Join-Path $outputRoot $case.name
  $env:SERVER_OFFLOAD_RATES=[string]$case.rate
  $env:SERVER_OFFLOAD_LOCAL=if($case.assist){'0'}else{'1'}
  $env:SERVER_OFFLOAD_EXPECT_SERVER=if($case.assist){'1'}else{'0'}
  $env:SERVER_OFFLOAD_MOTION=if($case.smooth){'1'}else{'0'}
  & $save
  Write-Output "CASE $($case.name)"
  # Windows PowerShell treats redirected native stderr warnings as error
  # records. Judge the test by its exit code instead of aborting on a warning.
  $ErrorActionPreference='Continue'
  & npx.cmd playwright test -c e2e/playwright.config.ts e2e/server-offload.spec.ts 2>&1 | Tee-Object -FilePath (Join-Path $outputRoot "$($case.name).log")
  $testExitCode=$LASTEXITCODE
  $ErrorActionPreference='Stop'
  $case.exitCode=$testExitCode;$case.finishedAt=[DateTime]::UtcNow.ToString('o')
  if($case.exitCode -ne 0){$case.status='failed';throw "Benchmark failed: $($case.name)"}
  $case.status='passed';& $save
 }
 $manifest.status='passed'
}catch{$manifest.status='failed';throw}
finally{$manifest.finishedAt=[DateTime]::UtcNow.ToString('o');& $save}
