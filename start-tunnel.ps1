Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$tunnelName = 'out-of-touch-dnd'

if (-not (Get-Command cloudflared -ErrorAction SilentlyContinue)) {
  Write-Error "cloudflared is not installed or not on PATH. Install Cloudflare Tunnel client, then retry."
  exit 1
}

Write-Host "Starting Cloudflare tunnel '$tunnelName' ..."
cloudflared tunnel run $tunnelName