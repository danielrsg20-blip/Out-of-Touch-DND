# Exact Dashboard Clicks: Vercel + Railway + Supabase

Use this checklist in order.

## 1) Supabase (create DB + copy connection string)

1. Open Supabase dashboard.
2. Click **New project**.
3. Set project name, database password, region, then click **Create new project**.
4. In the left sidebar, click **Project Settings**.
5. Click **Database**.
6. In **Connection string**, choose **URI**.
7. Copy the connection string.
8. Convert URL for backend if needed:
   - Use `postgresql+asyncpg://...`
   - Keep `?sslmode=require`

## 2) Railway (deploy FastAPI backend)

1. Open Railway dashboard.
2. Click **New Project**.
3. Click **Deploy from GitHub repo**.
4. Select this repository.
5. Open the created service.
6. Click **Variables** and add:
   - `DATABASE_URL` = Supabase URL from step 1
   - `JWT_SECRET_KEY` = long random value
   - `JWT_ALGORITHM` = `HS256`
   - `ACCESS_TOKEN_EXPIRE_MINUTES` = `10080`
   - `CORS_ALLOW_ORIGINS` = `https://<your-vercel-domain>`
   - `ANTHROPIC_API_KEY` = your key (or set `LOCAL_MOCK_MODE=true`)
   - `OPENAI_API_KEY` = optional
   - `LOCAL_MOCK_MODE` = `false`
   - `MAP_PACK_VALIDATION_MODE` = `warn`
7. Click **Settings** for the service.
8. Confirm start command is:
   - `cd backend && uvicorn app.main:app --host 0.0.0.0 --port $PORT`
   (the repo `Procfile` already provides this)
9. Click **Deployments** and wait for green status.
10. In **Settings** or **Networking**, copy backend public URL.
11. Open `<backend-url>/api/health` and confirm JSON status is ok.

## 3) Supabase Edge (backend proxy for campaign/overlay routes)

1. Open a terminal in the repo root.
2. Run:
   - `supabase secrets set BACKEND_API_URL=https://<your-railway-backend-domain>`
   - `supabase functions deploy backend-proxy`
3. Confirm deploy succeeded in Supabase dashboard under **Edge Functions**.

## 4) Vercel (frontend env)

1. Open Vercel dashboard.
2. Select your frontend project.
3. Click **Settings**.
4. Click **Environment Variables**.
5. Add:
   - `VITE_SUPABASE_URL` = `https://<your-project-ref>.supabase.co`
   - `VITE_SUPABASE_ANON_KEY` = `<your-supabase-anon-key>`
6. For proxy mode, do not set `VITE_API_URL`/`VITE_WS_URL`.
   - Optional direct mode: set them only if you want frontend to call Railway directly.
7. Set each variable for **Production** (and **Preview** if desired).
8. Click **Save**.
9. Go to **Deployments**.
10. Click latest deployment menu (**...**) → **Redeploy**.
11. Wait for deployment to finish.

## 5) Final checks

1. Open your Vercel app URL.
2. Register a user.
3. Login.
4. Create or join a session.
5. Confirm map/actions update in real time.
6. Generate overlay from narrative and verify hosted output includes forest/clearing/path/water features.

## 6) If something fails quickly

- Supabase Auth troubleshooting (anon key, existing username/email alias, bad credentials): see [docs/deploy-vercel-railway-supabase.md](docs/deploy-vercel-railway-supabase.md#3-configure-vercel-frontend).
- `405`/auth parse errors: Vercel env vars missing or no redeploy after setting env vars.
- CORS errors: add Vercel domain to `CORS_ALLOW_ORIGINS` in Railway variables and redeploy.
- DB connection errors: verify Supabase URL uses `postgresql+asyncpg` and includes `sslmode=require`.
- Campaign/overlay calls failing in hosted mode: confirm `backend-proxy` is deployed and `BACKEND_API_URL` is set in Supabase secrets.