# Supabase-Only Rewrite: Phase 1 Scaffold

This phase establishes migration scaffolding without breaking the current FastAPI runtime.

## Added in this phase

- Event-sourced core schema migration:
  - `supabase/migrations/0001_core_event_model.sql`
- Edge Function stubs:
  - `supabase/functions/session-actions/index.ts`
  - `supabase/functions/dm-action/index.ts`
  - `supabase/functions/voice-stt/index.ts`
  - `supabase/functions/voice-tts/index.ts`
- Frontend Supabase adapter:
  - `frontend/src/lib/supabaseClient.ts`
- Frontend Supabase Auth integration:
  - `frontend/src/stores/authStore.ts`
  - `frontend/src/components/AuthScreen.tsx`
- Session compatibility routing (non-breaking fallback):
  - `frontend/src/stores/sessionStore.ts`

## How to apply this phase

1. Run Supabase migration in your Supabase project.
2. Deploy Edge Function stubs.
3. Configure frontend Supabase env:

```env
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key>
```

4. Optionally enable session cutover toggle:

```env
VITE_USE_SUPABASE_SESSIONS=true
```

5. Keep current FastAPI backend active while parity migration proceeds.

Auth migration note:

- Frontend login/register is now handled by Supabase Auth.
- The username field maps to a deterministic alias email (`<normalized-username>@example.com`) with `user_metadata.username` preserved for display.
- Legacy accounts from pre-Supabase auth must re-register once.

## Next implementation target

Phase 2 target now partially implemented:

- `create_session`, `join_session`, and `get_session` actions are available in `session-actions`.
- On Supabase errors, frontend automatically falls back to existing FastAPI endpoints to keep the app working.

Realtime publish path:

- `session-actions` now writes `session_created` and `player_joined` records to `public.game_events`.
- Supabase Realtime can stream these event inserts for session-channel UX migration.
- `frontend/src/stores/sessionStore.ts` now subscribes to `game_events` inserts for the active session and refreshes lobby/session player lists on join events.

Migration note:

- Current `game_events` select policy is intentionally permissive for compatibility while auth/session rewrite is in progress.
- Tighten this policy once Supabase Auth-backed membership is fully in place.

Suggested first parity endpoints to replace:

- ✅ `POST /api/session/create`
- ✅ `POST /api/session/join`
- ✅ `GET /api/session/{room_code}`

Current frontend integration points for this next phase:

- `frontend/src/stores/sessionStore.ts`
- `frontend/src/components/SessionLobby.tsx`

Recent migration progress:

- `dm-action` now handles Supabase-backed actions for:
  - `get_spell_options`
  - `create_character`
  - `level_up_prepared_spells`
  - `get_castable_spells`
  - `cast_spell`
  - `player_action`
  - `move_token`
- Frontend `CharacterCreator`, `CharacterSheet`, `ActionBar`, and `useWebSocket` now route through Supabase functions/realtime instead of legacy `/api` or direct backend websockets.