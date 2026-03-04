# Supabase Rewrite Workspace

This folder contains scaffolding for the Supabase-only rewrite path.

Current status:

- Initial event-sourced core schema migration
- Edge Function stubs for session actions, DM actions, and voice
- Frontend Supabase client adapter support

## Suggested workflow

1. Install Supabase CLI.
2. Link this repo to your Supabase project.
3. Run migrations in `supabase/migrations`.
4. Deploy functions in `supabase/functions`.

This scaffold does not replace the current FastAPI backend yet.