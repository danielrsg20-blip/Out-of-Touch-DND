# Local Dev Launch: Frontend + TS Runtime + Supabase Edge Functions

This is the exact procedure used to launch all three local services in this repo.

## Goal

Bring up all endpoints at the same time:

- Frontend: http://127.0.0.1:5174
- TS runtime: http://127.0.0.1:9020
- Supabase Edge Functions: http://127.0.0.1:54321

## Preconditions

- OS: Windows (PowerShell)
- Working directory: repository root
- Docker must be running for local Supabase Edge Functions

## Launch Method (Same as used here)

Use the existing workspace task:

1. Run the VS Code task named: Start local dev stack
2. Internally, this executes:

```powershell
./start-dev.ps1
```

Expected task output includes:

- Starting TS runtime on http://127.0.0.1:9020 ...
- Starting Supabase Edge Functions on http://127.0.0.1:54321 ...
- Starting frontend on http://127.0.0.1:5174 ...
- Done. Frontend: http://127.0.0.1:5174  TS runtime: http://127.0.0.1:9020  Edge Functions: http://127.0.0.1:54321

## Verification (Same style used here)

Run this probe command from PowerShell:

```powershell
$urls = @('http://127.0.0.1:5174','http://127.0.0.1:9020','http://127.0.0.1:54321')
foreach ($u in $urls) {
  try {
    $r = Invoke-WebRequest -Uri $u -Method Get -TimeoutSec 8 -UseBasicParsing
    Write-Output "$u OK HTTP $($r.StatusCode)"
  } catch {
    if ($_.Exception.Response) {
      Write-Output "$u OK HTTP $([int]$_.Exception.Response.StatusCode)"
    } else {
      Write-Output "$u FAIL $($_.Exception.Message)"
    }
  }
}
```

Expected healthy results:

- http://127.0.0.1:5174 returns HTTP 200
- http://127.0.0.1:9020 may return HTTP 404 at root (still indicates service is up)
- http://127.0.0.1:54321 may return HTTP 404 at root (still indicates service is up)

## Common Failure Mode

If you see:

- Skipping local Supabase Edge Functions because Docker is unavailable.

Then TS runtime and frontend can still start, but Edge Functions will not. Start Docker, then rerun the same task.

## One-Paragraph Prompt for Another LLM

Use the Out-of-Touch-DND repo root on Windows. Launch the app by running the VS Code task Start local dev stack (equivalent to ./start-dev.ps1). Confirm all three endpoints are up: frontend at http://127.0.0.1:5174, TS runtime at http://127.0.0.1:9020, and Supabase Edge Functions at http://127.0.0.1:54321. Verify with PowerShell Invoke-WebRequest and treat 200 on frontend plus 404-at-root on TS runtime and Supabase as healthy service availability.
