Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$cloudflaredProcesses = Get-Process -Name cloudflared -ErrorAction SilentlyContinue

if (-not $cloudflaredProcesses) {
  Write-Host "No running cloudflared process found."
  exit 0
}

$processIds = @($cloudflaredProcesses | Select-Object -ExpandProperty Id)
Stop-Process -Id $processIds -Force

Write-Host "Stopped cloudflared process(es): $($processIds -join ', ')"