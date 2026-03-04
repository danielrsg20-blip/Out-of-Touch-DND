# Vercel Frontend + Railway FastAPI + Supabase Postgres

This is the recommended production path for this project.

If you want the shortest UI-only guide, use:

- `docs/deploy-dashboard-clicks-vercel-railway-supabase.md`

## Architecture

- Frontend: Vercel (from `frontend/`)
- Backend: Railway (single FastAPI service)
- Database: Supabase Postgres (direct connection URL)

## 1) Create Supabase Postgres

1. Create a Supabase project.
2. In Supabase, open Project Settings → Database.
3. Copy the direct Postgres connection string.

Use it as `DATABASE_URL` in Railway with async driver format:

```env
DATABASE_URL=postgresql+asyncpg://<user>:<pass>@<host>:5432/<db>?sslmode=require
```

Notes:

- If your copied URL starts with `postgres://`, backend config normalizes it.
- Keep `sslmode=require` for hosted Postgres.

## 2) Deploy backend to Railway

1. Create a new Railway project from this repo.
2. Configure service root as repository root.
3. Start command is already defined in the repository `Procfile`.

If you set it manually in Railway, use:

```bash
cd backend && uvicorn app.main:app --host 0.0.0.0 --port $PORT
```

4. Set Railway environment variables:

- `DATABASE_URL` (Supabase direct URL)
- `JWT_SECRET_KEY` (long random secret)
- `JWT_ALGORITHM=HS256`
- `ACCESS_TOKEN_EXPIRE_MINUTES=10080`
- `CORS_ALLOW_ORIGINS=https://<your-vercel-domain>`
- `ANTHROPIC_API_KEY` (or set `LOCAL_MOCK_MODE=true`)
- `OPENAI_API_KEY` (optional)
- `LOCAL_MOCK_MODE=false` (or true for testing)
- `MAP_PACK_VALIDATION_MODE=warn`

5. Deploy and copy backend URL (example: `https://your-backend.up.railway.app`).

Health check:

```text
GET https://<your-backend>/api/health
```

## 3) Configure Vercel frontend

In Vercel Project → Settings → Environment Variables:

- `VITE_API_URL=https://<your-backend>`
- `VITE_WS_URL=wss://<your-backend>`

Then redeploy Vercel so build-time env vars are applied.

## 4) Verify end-to-end

- Register/login succeeds
- Create/join session succeeds
- WebSocket updates work in play session
- Campaign save/load succeeds

## Reliability notes

- Keep backend at a single instance for now.
- Active session and WebSocket room state is process-local, so multi-instance scaling can break real-time room behavior until shared state is implemented.