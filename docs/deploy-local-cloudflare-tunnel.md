# Local Backend + Cloudflare Named Tunnel (Vercel Frontend)

This setup keeps the frontend on Vercel and exposes your local FastAPI backend through a stable Cloudflare Tunnel hostname.

## Prerequisites

- Local backend runs on `http://127.0.0.1:8010`
- Cloudflare account + domain in Cloudflare DNS
- `cloudflared` installed

## 1) Run the backend locally

From repo root:

```powershell
./start-dev.ps1
```

Or backend-only:

```powershell
Set-Location backend
uvicorn app.main:app --host 0.0.0.0 --port 8010
```

Check health:

```powershell
Invoke-WebRequest -Uri "http://127.0.0.1:8010/api/health" -UseBasicParsing | Select-Object -ExpandProperty Content
```

## 2) Create a named tunnel

Login and create tunnel:

```powershell
cloudflared tunnel login
cloudflared tunnel create out-of-touch-dnd
```

Route a DNS hostname (example: `api.yourdomain.com`):

```powershell
cloudflared tunnel route dns out-of-touch-dnd api.yourdomain.com
```

Create `%USERPROFILE%\\.cloudflared\\config.yml`:

```yaml
tunnel: out-of-touch-dnd
credentials-file: C:\\Users\\<you>\\.cloudflared\\<tunnel-id>.json

ingress:
  - hostname: api.yourdomain.com
    service: http://127.0.0.1:8010
  - service: http_status:404
```

Run tunnel (from repo root):

```powershell
./start-tunnel.ps1
```

Stop tunnel (from repo root):

```powershell
./stop-tunnel.ps1
```

Or run directly:

```powershell
cloudflared tunnel run out-of-touch-dnd
```

## 3) Configure backend CORS

In root `.env`:

```env
CORS_ALLOW_ORIGINS=http://localhost:5174,http://127.0.0.1:5174,https://<your-vercel-frontend-domain>
```

Restart backend after env changes.

## 4) Configure Vercel frontend env vars

Set in Vercel Project Settings → Environment Variables:

- `VITE_API_URL=https://api.yourdomain.com`
- `VITE_WS_URL=wss://api.yourdomain.com`

Redeploy frontend after changing env vars.

## 5) Verify end-to-end

- Open Vercel site
- Register/login works
- Create/join session works
- WebSocket updates and map actions work

If auth fails with a generic backend URL message, verify the Vercel env vars and redeploy.