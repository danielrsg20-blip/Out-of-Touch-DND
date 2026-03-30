import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = join(__dirname, '..', '..', 'data')
const PERSIST_PATH = join(DATA_DIR, 'campaigns.json')

type JsonRecord = Record<string, unknown>

export type PlayerCharacterSummary = {
  name: string
  class: string
  level: number
  char_id: string
}

export type SavedCampaignRecord = {
  id: string
  name: string
  updated_at: string
  session_count: number
  owner_id: string | null
  player_characters: Record<string, PlayerCharacterSummary>
  characters: Record<string, JsonRecord>
  map: JsonRecord | null
  conversation: unknown[]
  overlay: JsonRecord | null
}

const campaigns = new Map<string, SavedCampaignRecord>()

function loadFromDisk(): void {
  if (!existsSync(PERSIST_PATH)) return
  try {
    const raw = readFileSync(PERSIST_PATH, 'utf-8')
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return
    for (const entry of parsed) {
      if (entry && typeof entry === 'object' && typeof entry.id === 'string') {
        campaigns.set(entry.id, entry as SavedCampaignRecord)
      }
    }
  } catch {
    // Corrupt file — start fresh
  }
}

function saveToDisk(): void {
  try {
    mkdirSync(DATA_DIR, { recursive: true })
    writeFileSync(PERSIST_PATH, JSON.stringify([...campaigns.values()], null, 2), 'utf-8')
  } catch {
    // Non-critical — in-memory state is still valid
  }
}

// Boot: load persisted data
loadFromDisk()

export function getCampaign(campaignId: string): SavedCampaignRecord | null {
  return campaigns.get(campaignId) ?? null
}

export function saveCampaign(record: SavedCampaignRecord): SavedCampaignRecord {
  campaigns.set(record.id, record)
  saveToDisk()
  return record
}

export function listCampaigns(): SavedCampaignRecord[] {
  return [...campaigns.values()].sort((left, right) => right.updated_at.localeCompare(left.updated_at))
}

export function deleteCampaign(campaignId: string): boolean {
  if (!campaigns.has(campaignId)) return false
  campaigns.delete(campaignId)
  saveToDisk()
  return true
}

export function clearCampaigns(): void {
  campaigns.clear()
  saveToDisk()
}

export type SessionSnapshotForSave = {
  room_code: string
  players: Array<{ id: string; name: string; character_id: string | null; user_id: string | null }>
  game_state: {
    characters: Record<string, JsonRecord>
    map: JsonRecord | null
    combat: JsonRecord | null
    narrative_history: unknown[]
  }
  overlay: JsonRecord | null
}

function resolveCharClass(char: JsonRecord): string {
  if (typeof char.char_class === 'string') return char.char_class
  if (typeof char.class === 'string') return char.class
  return 'Unknown'
}

export function autoSaveSessionToCampaign(snapshot: SessionSnapshotForSave, campaignName?: string): void {
  const roomCode = snapshot.room_code.toUpperCase()
  const existing = getCampaign(roomCode)
  const ownerId = existing?.owner_id ?? snapshot.players.find((p) => p.user_id)?.user_id ?? null

  const playerCharacters: Record<string, PlayerCharacterSummary> = {}
  for (const player of snapshot.players) {
    if (!player.user_id || !player.character_id) continue
    const char = snapshot.game_state.characters[player.character_id]
    if (!char) continue
    playerCharacters[player.user_id] = {
      name: typeof char.name === 'string' ? char.name : 'Unknown',
      class: resolveCharClass(char),
      level: typeof char.level === 'number' ? char.level : 1,
      char_id: player.character_id,
    }
  }

  saveCampaign({
    id: roomCode,
    name: campaignName ?? existing?.name ?? roomCode,
    updated_at: new Date().toISOString(),
    session_count: (existing?.session_count ?? 0) + 1,
    owner_id: ownerId,
    player_characters: { ...existing?.player_characters, ...playerCharacters },
    characters: snapshot.game_state.characters,
    map: snapshot.game_state.map,
    conversation: snapshot.game_state.narrative_history.slice(-20),
    overlay: snapshot.overlay,
  })
}
