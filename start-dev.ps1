Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path

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
  "Set-Location '$root/ts-runtime'; `$env:TS_RUNTIME_PORT='9020'; npm run dev"
)

Write-Host "Starting frontend on http://127.0.0.1:5174 ..."
Start-Process powershell -ArgumentList @(
  '-NoExit',
  '-Command',
  "`$env:VITE_API_URL='http://127.0.0.1:9020'; Set-Location '$root/frontend'; npm run dev -- --host 127.0.0.1"
)

Write-Host "Done. Frontend: http://127.0.0.1:5174  TS runtime: http://127.0.0.1:9020"