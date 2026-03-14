# Phase 0 Local Workflow

This workflow validates parity harness setup before TypeScript backend endpoints are implemented.

## 1) Start Python baseline backend

```powershell
Set-Location backend
. ..\.venv\Scripts\Activate.ps1
uvicorn app.main:app --reload --host 0.0.0.0 --port 8010
```

## 2) Start TypeScript candidate backend

Run your candidate service on a separate port (example: 9010).

## 3) Run parity harness

From repo root:

```powershell
$env:PYTHON_BASE_URL='http://127.0.0.1:8010'
$env:TS_BASE_URL='http://127.0.0.1:9010'
node scripts/parity/contract-parity.mjs
```

## 4) Expected behavior now

Before TypeScript overlay endpoints exist, parity check should fail for TS responses.
Once endpoint parity is implemented, fixtures should pass.
