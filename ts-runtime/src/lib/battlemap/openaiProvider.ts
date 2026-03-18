import {
  TRAVERSAL_TAG_WHITELIST,
  type TraversalTag,
  type TraversalCell,
  type TraversalGrid,
} from './types.js'
import { resolveImageQualityForMode, resolveImageSizeForQuality } from './qualityPolicy.js'
import type {
  BattlemapProvider,
  GeneratedBattlemapImage,
  ImageGenerationPayload,
  TraversalGenerationInput,
  TraversalGenerationResult,
} from './provider.js'

type JsonRecord = Record<string, unknown>

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : null
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function normalizeCellTag(tag: string): TraversalTag | null {
  return TRAVERSAL_TAG_WHITELIST.includes(tag as TraversalTag) ? (tag as TraversalTag) : null
}

function defaultTagForCell(cellType: string): TraversalTag {
  if (cellType === 'blocked') return 'blocked'
  if (cellType === 'difficult') return 'difficult'
  return 'open_ground'
}

function parseTraversalGrid(data: JsonRecord, input: TraversalGenerationInput): TraversalGenerationResult {
  const containsTextOrWatermark = data.contains_text_or_watermark === true
  const rows = Array.isArray(data.rows) ? data.rows : []

  const expectedCells = input.gridWidthCells * input.gridHeightCells
  const cells: TraversalCell[] = []

  for (let y = 0; y < input.gridHeightCells; y += 1) {
    const row = y < rows.length && Array.isArray(rows[y]) ? rows[y] : []
    for (let x = 0; x < input.gridWidthCells; x += 1) {
      const cellRecord = x < row.length ? asRecord(row[x]) : null
      const kind = asString(cellRecord?.kind) ?? 'walkable'
      const traversable = kind !== 'blocked'
      const movementCostRaw = asNumber(cellRecord?.movement_cost)
      const movementCost = movementCostRaw && movementCostRaw > 0 ? movementCostRaw : kind === 'difficult' ? 2 : 1
      const confidenceRaw = asNumber(cellRecord?.confidence)
      const confidence = confidenceRaw && confidenceRaw >= 0 && confidenceRaw <= 1 ? confidenceRaw : undefined
      const rawTags = Array.isArray(cellRecord?.tags) ? cellRecord?.tags : []
      const tags: TraversalTag[] = []
      for (const item of rawTags) {
        if (typeof item !== 'string') continue
        const normalized = normalizeCellTag(item)
        if (normalized) tags.push(normalized)
      }
      if (tags.length === 0) {
        tags.push(defaultTagForCell(kind))
      }

      cells.push({
        x,
        y,
        traversable,
        movement_cost: movementCost,
        movement_blocking_tags: traversable ? [] : ['blocked'],
        tags,
        confidence,
      })
    }
  }

  if (cells.length !== expectedCells) {
    throw new Error(`Traversal grid size mismatch: expected ${expectedCells}, got ${cells.length}`)
  }

  const grid: TraversalGrid = {
    width_cells: input.gridWidthCells,
    height_cells: input.gridHeightCells,
    cell_size_world: input.cellSizeWorld,
    derivation_version: 'openai-gpt4o-mini-v1',
    cells,
  }

  return {
    grid,
    containsTextOrWatermark,
  }
}

async function fetchOpenAiJson<T>(apiKey: string, endpoint: string, payload: unknown): Promise<T> {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`OpenAI HTTP ${res.status}: ${text.slice(0, 350)}`)
  }

  return (await res.json()) as T
}

function decodeBase64ToBytes(base64: string): Uint8Array {
  const buffer = Buffer.from(base64, 'base64')
  return new Uint8Array(buffer)
}

function resolveImageQuality(qualityMode: ImageGenerationPayload['qualityMode']): 'standard' | 'hd' {
  const allowHd = String(process.env.BATTLEMAP_FINAL_HD_ENABLED ?? '').trim().toLowerCase()
  const hdEnabled = allowHd === '1' || allowHd === 'true' || allowHd === 'yes' || allowHd === 'on'
  return resolveImageQualityForMode(qualityMode, hdEnabled)
}

export class OpenAiBattlemapProvider implements BattlemapProvider {
  readonly providerId = 'openai' as const
  private readonly apiKey: string

  constructor(apiKey: string) {
    if (!apiKey.trim()) {
      throw new Error('OPENAI_API_KEY not set')
    }
    this.apiKey = apiKey.trim()
  }

  async generateBattlemapImage(payload: ImageGenerationPayload): Promise<GeneratedBattlemapImage> {
    type OpenAiImageResponse = {
      data?: Array<{ b64_json?: string; revised_prompt?: string }>
      created?: number
    }

    const size = resolveImageSizeForQuality(payload.qualityMode, payload.style)
    const quality = resolveImageQuality(payload.qualityMode)
    const model = String(process.env.BATTLEMAP_IMAGE_MODEL ?? 'dall-e-3').trim() || 'dall-e-3'

    const response = await fetchOpenAiJson<OpenAiImageResponse>(
      this.apiKey,
      'https://api.openai.com/v1/images/generations',
      {
        model,
        prompt: payload.prompt,
        quality,
        size,
        response_format: 'b64_json',
      },
    )

    const first = Array.isArray(response.data) ? response.data[0] : null
    const b64 = first?.b64_json
    if (!b64 || typeof b64 !== 'string') {
      throw new Error('OpenAI image response did not include b64_json data')
    }

    const [width, height] = size.split('x').map((v) => Number(v))
    if (!Number.isFinite(width) || !Number.isFinite(height)) {
      throw new Error(`Invalid generated image size: ${size}`)
    }

    return {
      bytes: decodeBase64ToBytes(b64),
      mimeType: 'image/png',
      widthPx: width,
      heightPx: height,
      model,
      modelVersion: '2023-11-06',
      revisedPrompt: typeof first?.revised_prompt === 'string' ? first.revised_prompt : undefined,
      seedSupported: false,
    }
  }

  async generateTraversalData(payload: TraversalGenerationInput): Promise<TraversalGenerationResult> {
    type OpenAiChatResponse = {
      choices?: Array<{ message?: { content?: string } }>
    }

    const traversalPrompt = [
      'You are a tactical map traversal classifier.',
      `Classify a top-down battlemat into a ${payload.gridWidthCells}x${payload.gridHeightCells} square grid.`,
      'Return strict JSON only with the shape:',
      '{"contains_text_or_watermark": boolean, "rows": [[{"kind":"walkable|blocked|difficult","movement_cost":number,"tags":string[],"confidence":number}]]}',
      'Rules:',
      '- blocked: walls, buildings, deep water, cliffs, and hard barriers.',
      '- difficult: mud, rubble, shallow water, heavy undergrowth.',
      '- walkable: open ground, floor, paths, bridges.',
      '- keep confidence between 0 and 1.',
      '- tags must be concise lowercase strings.',
      '- rows length must equal grid height and each row length must equal grid width.',
      `Scene location: ${payload.sceneSpec.location}; biome: ${payload.sceneSpec.biome}; encounter: ${payload.sceneSpec.encounter_type}.`,
      `Notable features: ${payload.sceneSpec.notable_features.join(', ') || 'none'}.`,
    ].join('\n')

    const traversalModel = String(process.env.BATTLEMAP_TRAVERSAL_MODEL ?? 'gpt-4o-mini').trim() || 'gpt-4o-mini'

    const response = await fetchOpenAiJson<OpenAiChatResponse>(
      this.apiKey,
      'https://api.openai.com/v1/chat/completions',
      {
        model: traversalModel,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: 'Return only valid JSON.' },
          {
            role: 'user',
            content: [
              { type: 'text', text: traversalPrompt },
              {
                type: 'image_url',
                image_url: { url: payload.imageUrl },
              },
            ],
          },
        ],
      },
    )

    const text = response.choices?.[0]?.message?.content
    if (!text || typeof text !== 'string') {
      throw new Error('OpenAI traversal response was empty')
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch {
      throw new Error('OpenAI traversal response was not valid JSON')
    }

    const parsedRecord = asRecord(parsed)
    if (!parsedRecord) {
      throw new Error('OpenAI traversal response must be a JSON object')
    }

    return parseTraversalGrid(parsedRecord, payload)
  }
}
