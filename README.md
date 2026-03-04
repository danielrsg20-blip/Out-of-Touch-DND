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

Current starter pack metadata targets a Kenney CC0-licensed source and maps to local static assets under `frontend/public/maps/kenney`.

Validate map pack licensing/attribution metadata:

```bash
cd backend
python scripts/validate_map_packs.py
```

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

## Deployment (Vercel + Render)

This app is designed for split deployment:

- **Frontend (Vite SPA)** on Vercel
- **Backend (FastAPI + WebSocket)** on Render

### 1) Deploy backend to Render

Use the included `render.yaml` blueprint or manual setup.

Required backend env vars:

- `DATABASE_URL` (recommended: managed Postgres)
- `JWT_SECRET_KEY`
- `CORS_ALLOW_ORIGINS` (set to your Vercel frontend URL)
- `ANTHROPIC_API_KEY` (or use `LOCAL_MOCK_MODE=true` for mock mode)
- `OPENAI_API_KEY` (optional depending on features)

Health endpoint: `/api/health`

### 2) Deploy frontend to Vercel

The repo includes `vercel.json` that builds from `frontend/`.

Set frontend env vars in Vercel project settings:

- `VITE_API_URL=https://<your-render-backend-domain>`
- `VITE_WS_URL=wss://<your-render-backend-domain>`

### 3) Verify

- Frontend loads from Vercel URL
- `GET https://<backend>/api/health` returns status ok
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
