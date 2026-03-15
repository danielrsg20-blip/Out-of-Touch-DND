# Supabase Rewrite Workspace

This folder contains scaffolding for the Supabase-only rewrite path.

Current status:

- Initial event-sourced core schema migration
- Edge Function stubs for session actions, DM actions, and voice
- Frontend Supabase client adapter support
- Backend API proxy function for campaign/overlay routes when `VITE_API_URL` is not set

## Suggested workflow

1. Install Supabase CLI.
2. Link this repo to your Supabase project.
3. Run migrations in `supabase/migrations`.
4. Deploy functions in `supabase/functions`.

## Backend Proxy Function

The `backend-proxy` edge function forwards selected backend API paths (`/api/campaign/*` and `/api/overlays/*`) to a deployed FastAPI backend.

Required secret:

- `BACKEND_API_URL`: Base URL for the deployed backend (example: `https://your-backend.example.com`)

Example setup/deploy commands:

```bash
supabase secrets set BACKEND_API_URL=https://your-backend.example.com
supabase functions deploy backend-proxy
```

This scaffold does not replace the current FastAPI backend yet.

## Python-Free Local DM Mode

You can run DM narration without Python by using the `dm-action` edge function with an LLM provider key.

Required secrets:

- `ANTHROPIC_API_KEY`: API key used by `dm-action` for narrative generation
- Optional `OPENAI_API_KEY`: API key when provider is `openai`
- Optional `GROQ_API_KEY`: API key when provider is `groq`
- Optional `OTDND_DM_PROVIDER` (default `anthropic`, supports `anthropic`, `openai`, `groq`)
- Optional `OTDND_DM_MODEL` (default `claude-sonnet-4-20250514`)
- Optional `OTDND_DM_MAX_TOKENS` (default `220`)
- Optional `OTDND_DM_TIMEOUT_MS` (default `12000`)

Example:

```bash
supabase secrets set ANTHROPIC_API_KEY=<your_key>
supabase secrets set OTDND_DM_PROVIDER=anthropic
supabase secrets set OTDND_DM_MODEL=claude-sonnet-4-20250514
```

Frontend local configuration:

- Set `VITE_DM_ACTION_TARGET=edge` to prefer Supabase `dm-action` before local `/api/action`.
- Keep `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` configured.

This mode keeps combat/session state in Supabase function flows and does not require a running Python backend for DM action narration.