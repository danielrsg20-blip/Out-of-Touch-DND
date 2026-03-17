import type { BattlemapProvider } from './provider.js'
import { OpenAiBattlemapProvider } from './openaiProvider.js'

export type BattlemapProviderId = 'openai'

export function createBattlemapProvider(providerId: BattlemapProviderId = 'openai'): BattlemapProvider {
  if (providerId === 'openai') {
    return new OpenAiBattlemapProvider(process.env.OPENAI_API_KEY ?? '')
  }
  throw new Error(`Unsupported battlemap provider: ${providerId}`)
}
