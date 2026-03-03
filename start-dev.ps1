Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path

foreach ($port in 8010, 5174) {
  $pids = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique

  if ($pids) {
    foreach ($procId in $pids) {
      Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
    }
    Write-Host "Freed port $port (stopped PID(s): $($pids -join ', '))"
  }
}

Write-Host "Starting backend on http://127.0.0.1:8010 ..."
Start-Process powershell -ArgumentList @(
  '-NoExit',
  '-Command',
  "Set-Location '$root/backend'; & '../.venv/Scripts/python.exe' -m uvicorn app.main:app --host 127.0.0.1 --port 8010 --reload"
)

Write-Host "Starting frontend on http://127.0.0.1:5174 ..."
Start-Process powershell -ArgumentList @(
  '-NoExit',
  '-Command',
  "Set-Location '$root/frontend'; npm run dev -- --host 127.0.0.1"
)

Write-Host "Done. Frontend: http://127.0.0.1:5174  Backend docs: http://127.0.0.1:8010/docs"