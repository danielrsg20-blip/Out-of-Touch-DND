Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Set-Location "e:\Personal Projects\DND\Out-of-Touch-DND"

$envLines = Get-Content "frontend/.env.local"
$urlLine = $envLines | Where-Object { $_ -like 'VITE_SUPABASE_URL=*' } | Select-Object -First 1
$keyLine = $envLines | Where-Object { $_ -like 'VITE_SUPABASE_ANON_KEY=*' } | Select-Object -First 1

if (-not $urlLine -or -not $keyLine) {
  [pscustomobject]@{
    reachable = $false
    has_audio = $false
    audio_chars = 0
    error = 'missing_frontend_supabase_env'
  } | ConvertTo-Json -Compress
  exit 0
}

$url = $urlLine.Split('=', 2)[1]
$key = $keyLine.Split('=', 2)[1]
$body = @{
  text = 'Supabase voice reachability check.'
  voiceId = 'dm_default'
  speed = 1.5
  mock_mode = $false
} | ConvertTo-Json

try {
  $response = Invoke-RestMethod -Method Post -Uri "$url/functions/v1/voice-tts" -Headers @{
    apikey = $key
    Authorization = "Bearer $key"
    'Content-Type' = 'application/json'
  } -Body $body -TimeoutSec 25

  $audioLength = 0
  if ($response.audio -is [string]) {
    $audioLength = $response.audio.Length
  }

  [pscustomobject]@{
    reachable = $true
    has_audio = ($audioLength -gt 0)
    audio_chars = $audioLength
    speed = $response.speed
    error = $null
  } | ConvertTo-Json -Compress
} catch {
  $errorBody = $null
  if ($_.Exception.Response) {
    try {
      $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
      $errorBody = $reader.ReadToEnd()
      $reader.Close()
    } catch {
      $errorBody = $null
    }
  }

  [pscustomobject]@{
    reachable = $false
    has_audio = $false
    audio_chars = 0
    speed = $null
    error = $_.Exception.Message
    error_body = $errorBody
  } | ConvertTo-Json -Compress
}
