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