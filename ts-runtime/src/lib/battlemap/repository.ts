import type { BattlemapAsset } from './types.js'
import { getBattlemapBucketName, getSupabaseServiceClient } from './supabase.js'

function mapRowToAsset(row: Record<string, unknown>): BattlemapAsset {
  return {
    id: String(row.id ?? ''),
    campaign_id: String(row.campaign_id ?? ''),
    scene_spec: row.scene_spec as BattlemapAsset['scene_spec'],
    image_url: String(row.image_url ?? ''),
    image_width_px: Number(row.image_width_px ?? 0),
    image_height_px: Number(row.image_height_px ?? 0),
    grid_overlay_config: row.grid_overlay_config as BattlemapAsset['grid_overlay_config'],
    traversal_grid: row.traversal_grid as BattlemapAsset['traversal_grid'],
    generation_audit: row.generation_audit as BattlemapAsset['generation_audit'],
    created_at: String(row.created_at ?? new Date().toISOString()),
    updated_at: String(row.updated_at ?? new Date().toISOString()),
  }
}

export async function uploadBattlemapImage(campaignId: string, assetId: string, imageBytes: Uint8Array, mimeType: string): Promise<string> {
  const supabase = getSupabaseServiceClient()
  const bucket = getBattlemapBucketName()
  const path = `${campaignId}/${assetId}.png`

  const { error } = await supabase.storage.from(bucket).upload(path, imageBytes, {
    upsert: true,
    contentType: mimeType,
  })

  if (error) {
    throw new Error(`Failed to upload battlemap image: ${error.message}`)
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(path)
  if (!data.publicUrl) {
    throw new Error('Failed to resolve public URL for uploaded battlemap image')
  }

  return data.publicUrl
}

export async function deleteBattlemapImage(campaignId: string, assetId: string): Promise<void> {
  const supabase = getSupabaseServiceClient()
  const bucket = getBattlemapBucketName()
  const path = `${campaignId}/${assetId}.png`

  const { error } = await supabase.storage.from(bucket).remove([path])

  if (error) {
    throw new Error(`Failed to delete battlemap image: ${error.message}`)
  }
}

export async function insertBattlemapAsset(asset: BattlemapAsset): Promise<BattlemapAsset> {
  const supabase = getSupabaseServiceClient()

  const payload = {
    id: asset.id,
    campaign_id: asset.campaign_id,
    scene_spec: asset.scene_spec,
    image_url: asset.image_url,
    image_width_px: asset.image_width_px,
    image_height_px: asset.image_height_px,
    grid_overlay_config: asset.grid_overlay_config,
    traversal_grid: asset.traversal_grid,
    generation_audit: asset.generation_audit,
  }

  const { data, error } = await supabase
    .from('battlemap_assets')
    .insert(payload)
    .select('*')
    .single()

  if (error) {
    throw new Error(`Failed to insert battlemap asset: ${error.message}`)
  }

  const row = data as Record<string, unknown>
  return mapRowToAsset(row)
}

export async function getBattlemapAssetById(assetId: string): Promise<BattlemapAsset | null> {
  const supabase = getSupabaseServiceClient()
  const { data, error } = await supabase
    .from('battlemap_assets')
    .select('*')
    .eq('id', assetId)
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to fetch battlemap asset: ${error.message}`)
  }

  if (!data || typeof data !== 'object') {
    return null
  }

  return mapRowToAsset(data as Record<string, unknown>)
}

export async function updateBattlemapAsset(asset: BattlemapAsset): Promise<BattlemapAsset> {
  const supabase = getSupabaseServiceClient()

  const payload = {
    image_url: asset.image_url,
    image_width_px: asset.image_width_px,
    image_height_px: asset.image_height_px,
    grid_overlay_config: asset.grid_overlay_config,
    traversal_grid: asset.traversal_grid,
    generation_audit: asset.generation_audit,
    updated_at: asset.updated_at,
  }

  const { data, error } = await supabase
    .from('battlemap_assets')
    .update(payload)
    .eq('id', asset.id)
    .select('*')
    .single()

  if (error) {
    throw new Error(`Failed to update battlemap asset: ${error.message}`)
  }

  return mapRowToAsset(data as Record<string, unknown>)
}
