Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$startLocalEdgeFunctions = $env:OTDND_START_LOCAL_EDGE_FUNCTIONS -eq 'true'
$dockerAvailable = $false
if ($null -ne (Get-Command docker -ErrorAction SilentlyContinue)) {
  try {
    docker info *> $null
    if ($LASTEXITCODE -eq 0) {
      $dockerAvailable = $true
    }
  } catch {
    $dockerAvailable = $false
  }
}

foreach ($port in 9020, 8010, 5174) {
  $pids = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique

  if ($pids) {
    foreach ($procId in $pids) {
      Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
    }
    Write-Host "Freed port $port (stopped PID(s): $($pids -join ', '))"
  }
}

Write-Host "Starting TS runtime on http://127.0.0.1:9020 ..."
Start-Process powershell -ArgumentList @(
  '-NoExit',
  '-Command',
  "Set-Location '$root/ts-runtime'; `$env:TS_RUNTIME_PORT='9020'; `$env:VECTOR_MAP_GENERATION_TS_ENABLED='false'; `$env:VECTOR_GRID_DERIVATION_ENABLED='false'; npm run dev"
)

if ($startLocalEdgeFunctions -and $dockerAvailable) {
  Write-Host "Starting Supabase Edge Functions on http://127.0.0.1:54321 ..."
  Start-Process powershell -ArgumentList @(
    '-NoExit',
    '-Command',
    "Set-Location '$root'; `$env:OTDND_TS_RUNTIME_BASE_URL='http://host.docker.internal:9020'; supabase functions serve --env-file .env"
  )
} elseif ($startLocalEdgeFunctions) {
  Write-Host "Skipping local Supabase Edge Functions because Docker is unavailable."
} else {
  Write-Host "Skipping local Supabase Edge Functions (set OTDND_START_LOCAL_EDGE_FUNCTIONS=true to enable)."
}

Write-Host "Starting frontend on http://127.0.0.1:5174 ..."
Start-Process powershell -ArgumentList @(
  '-NoExit',
  '-Command',
  "`$env:VITE_API_URL='http://127.0.0.1:9020'; `$env:VITE_ENABLE_LEGACY_SPRITES='true'; Set-Location '$root/frontend'; npm run dev -- --host 127.0.0.1"
)

if ($startLocalEdgeFunctions -and $dockerAvailable) {
  Write-Host "Done. Frontend: http://127.0.0.1:5174  TS runtime: http://127.0.0.1:9020  Edge Functions: http://127.0.0.1:54321"
} else {
  Write-Host "Done. Frontend: http://127.0.0.1:5174  TS runtime: http://127.0.0.1:9020"
}