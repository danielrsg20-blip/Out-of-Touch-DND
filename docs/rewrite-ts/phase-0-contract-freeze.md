# Phase 0 Contract Freeze

This document freezes the API and websocket contracts that TypeScript implementations must match.

## HTTP Contracts (Critical)

- POST /api/session/create
- POST /api/session/join
- GET /api/session/{room_code}
- POST /api/campaign/save
- GET /api/campaign/list
- POST /api/campaign/load
- POST /api/campaign/resume
- GET /api/campaign/{campaign_id}/characters
- POST /api/overlays/create
- GET /api/overlays/{overlay_id}
- GET /api/overlays/{overlay_id}/export
- POST /api/overlays/generate

## WebSocket Contracts (Critical)

Path:

- /ws/{room_code}/{player_id}

Inbound message types:

- player_action
- cast_spell
- next_turn
- move_token
- attack

Outbound message types:

- connected
- player_connected
- player_disconnected
- character_created
- state_sync
- overlay_update
- dice_result
- error

## Contract Rules

- Field names and types must match exactly.
- Timestamps and generated IDs may differ and must be normalized in parity tests.
- For seeded deterministic routes, payload equivalence is strict after normalization.

## Parity Harness Inputs

Fixture files in [contracts/fixtures](../../contracts/fixtures):

- overlay-generate-forest.json
- overlay-generate-battle.json
- campaign-save-load.json

## Exit Criteria

- Python baseline and TypeScript candidate produce equivalent normalized responses for all fixture-driven contract tests.
- No contract-breaking drift in CI.
