import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeApiSeed, parseGenerateVectorMapApiRequest } from './apiRequest.js'

test('normalizeApiSeed accepts numbers, numeric strings, and deterministic text seeds', () => {
  assert.equal(normalizeApiSeed(123), 123)
  assert.equal(normalizeApiSeed('456'), 456)
  assert.equal(normalizeApiSeed('alpha-seed'), normalizeApiSeed('alpha-seed'))
  assert.equal(normalizeApiSeed(''), null)
})

test('parseGenerateVectorMapApiRequest resolves preset defaults and grid resolution policy', () => {
  const parsed = parseGenerateVectorMapApiRequest(
    {
      seed: 'alpha-seed',
      preset_id: 'river_bridge_ford',
      grid_config: { resolution_scale: 2 },
      style_options: { max_saturation: 0.5 },
    },
    true,
  )

  assert.equal(parsed.preset_id, 'river_bridge_ford')
  assert.equal(parsed.biome, 'forest')
  assert.match(parsed.story_prompt ?? '', /bridge|ford/i)
  assert.equal(parsed.grid_config?.resolution_scale, 2)
  assert.equal(parsed.style_options?.max_saturation, 0.5)
})

test('parseGenerateVectorMapApiRequest forces single resolution when v2 grid flag is off', () => {
  const parsed = parseGenerateVectorMapApiRequest(
    {
      seed: 999,
      preset_id: 'tavern_inn_floorplan',
      grid_config: { resolution_scale: 2 },
    },
    false,
  )

  assert.equal(parsed.grid_config?.resolution_scale, 1)
})