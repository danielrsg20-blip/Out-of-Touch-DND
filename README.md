# Out-of-Touch-DND

An LLM-powered Dungeons & Dragons 5th Edition campaign engine where Claude acts as the Dungeon Master. Features a top-down grid map with tokens, hybrid voice + click interaction, and support for both local and virtual play.

## Quick Start

### Prerequisites

- Python 3.12+
- Node.js 18+
- An Anthropic API key

### Backend Setup

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate  # Windows
# source .venv/bin/activate  # macOS/Linux

pip install -r requirements.txt
```

Create a `.env` file in the project root (copy from `.env.example`):

```
ANTHROPIC_API_KEY=sk-ant-your-actual-key-here
```

For local development without external API keys, enable mock mode:

```
LOCAL_MOCK_MODE=true
SRD_RULES_VERSION=2024
```

When mock mode is enabled, the backend forces deterministic local DM + voice behavior and does not call Anthropic/OpenAI APIs.

### Map Packs & Attribution Validation

The automated map catalog uses open-license pack metadata from `backend/app/maps/data/map_library.json`.
Sprite-source import policy metadata is tracked in `backend/app/maps/data/assets_manifest.json`.

Current starter pack metadata targets a Kenney CC0-licensed source and maps to local static assets under `frontend/public/maps/kenney`.

Validate map pack licensing/attribution metadata:

```bash
cd backend
python scripts/validate_map_packs.py
```

The same command validates both map manifests and sprite asset import policy metadata.

Validate generated environment sprite labels against the atlas (release gate):

```bash
cd backend
python scripts/check_atlas_resolution.py
```

This command exits non-zero if any generated `env:` sprite label fails to resolve to a valid atlas frame.

Startup validation mode is controlled by `MAP_PACK_VALIDATION_MODE`:

- `off`: skip validation
- `warn`: log issues and continue startup (default)
- `error`: fail startup when validation errors exist

### SRD Content (2024)

The backend loads versioned SRD spell/class data from `backend/app/rules/data`.

To refresh 2024 SRD datasets from open API sources:

```bash
cd backend
python scripts/import_srd_2024.py
```

If 2024 upstream endpoints are unavailable, you can import currently available open SRD content with explicit fallback:

```bash
cd backend
python scripts/import_srd_2024.py --allow-2014-fallback
```

Imported records include `source_rules_version` metadata so you can distinguish true 2024 source data from fallback content.

This updates:
- `backend/app/rules/data/spells.2024.json`
- `backend/app/rules/data/class_spell_lists.2024.json`
- `backend/app/rules/data/class_features.2024.json`

Start the server:

```bash
cd backend
uvicorn app.main:app --reload --host 0.0.0.0 --port 8010
```

### Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5174` in your browser.

Or use the root helper script to start both services:

```bash
./start-dev.ps1
```

Frontend: `http://127.0.0.1:5174`  Backend docs: `http://127.0.0.1:8010/docs`

## Deployment (Vercel + Railway + Supabase)

This app is designed for split deployment:

- **Frontend (Vite SPA)** on Vercel
- **Backend (FastAPI + WebSocket)** on Railway
- **Database** on Supabase Postgres

Use the production runbook:

- `docs/deploy-vercel-railway-supabase.md`

Exact dashboard-click checklist:

- `docs/deploy-dashboard-clicks-vercel-railway-supabase.md`

Local fallback runbook (optional):

- `docs/deploy-local-cloudflare-tunnel.md`

Supabase-only rewrite scaffold (work in progress):

- `docs/supabase-rewrite-phase-1.md`

### Required backend env vars

- `DATABASE_URL` (Supabase Postgres direct URL recommended for production)
- `JWT_SECRET_KEY`
- `CORS_ALLOW_ORIGINS` (set to your Vercel frontend URL)
- `ANTHROPIC_API_KEY` (or use `LOCAL_MOCK_MODE=true` for mock mode)
- `OPENAI_API_KEY` (optional depending on features)

Health endpoint: `/api/health`

Atlas health endpoint (returns `503` when unresolved labels are detected): `/api/health/atlas`

### Vercel frontend env vars

- `VITE_SUPABASE_URL=https://<your-project-ref>.supabase.co`
- `VITE_SUPABASE_ANON_KEY=<your-supabase-anon-key>`

Legacy compatibility only (not needed for Supabase-only backend mode):

- `VITE_API_URL=https://<your-railway-backend-domain>`
- `VITE_WS_URL=wss://<your-railway-backend-domain>`

Auth note:

- Frontend login/register now uses Supabase Auth with username-style UX.
- Existing legacy accounts from pre-migration auth must re-register once.

### Supabase Auth troubleshooting

- **Invalid anon key / auth not configured**
	- Confirm `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set in Vercel project env vars and redeploy.
	- Ensure the values are from the same Supabase project.
- **Email already registered**
	- Registration uses a username alias email (`<normalized-username>@example.com`).
	- If taken, sign in with that username or choose a different username.
- **Bad credentials (invalid login credentials)**
	- Check username/password exactly; usernames are normalized (trimmed/lowercased).
	- If this is a pre-migration account, re-register once under Supabase Auth.

### Verify

- Frontend loads from Vercel URL
- `GET https://<your-railway-backend-domain>/api/health` returns status ok
- Create/login account works
- Create/join session works
- WebSocket actions and map updates work

### Playing

1. Click **Create Session** and enter your name
2. Share the room code with friends (they click **Join Session**)
3. Each player creates a character (race, class, ability scores)
4. Start playing! Type your actions in the chat and interact with the map

## Architecture

- **Backend**: Python / FastAPI / WebSockets
- **Frontend**: React + TypeScript + Vite + HTML5 Canvas
- **LLM**: Anthropic Claude with tool use (dice rolls, map generation, combat)
- **Map**: Top-down 2D grid rendered on canvas with pan/zoom and draggable tokens

## Cost

With Claude Sonnet and prompt caching, a typical 3-4 hour session costs ~$4-15 depending on activity level.
