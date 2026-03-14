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

export function getCampaign(campaignId: string): SavedCampaignRecord | null {
  return campaigns.get(campaignId) ?? null
}

export function saveCampaign(record: SavedCampaignRecord): SavedCampaignRecord {
  campaigns.set(record.id, record)
  return record
}

export function listCampaigns(): SavedCampaignRecord[] {
  return [...campaigns.values()].sort((left, right) => right.updated_at.localeCompare(left.updated_at))
}

export function clearCampaigns(): void {
  campaigns.clear()
}