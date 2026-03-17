import type {
  BattlemapStyleConfig,
  SceneSpec,
  TraversalGrid,
} from './types.js'

export type ImageGenerationPayload = {
  prompt: string
  seed?: string | number
  style?: BattlemapStyleConfig
}

export type GeneratedBattlemapImage = {
  bytes: Uint8Array
  mimeType: string
  widthPx: number
  heightPx: number
  model: string
  modelVersion: string
  revisedPrompt?: string
  seedSupported: boolean
}

export type TraversalGenerationInput = {
  imageUrl: string
  sceneSpec: SceneSpec
  gridWidthCells: number
  gridHeightCells: number
  cellSizeWorld: number
}

export type TraversalGenerationResult = {
  grid: TraversalGrid
  containsTextOrWatermark: boolean
}

export interface BattlemapProvider {
  readonly providerId: 'openai'

  generateBattlemapImage(payload: ImageGenerationPayload): Promise<GeneratedBattlemapImage>

  generateTraversalData(payload: TraversalGenerationInput): Promise<TraversalGenerationResult>
}
