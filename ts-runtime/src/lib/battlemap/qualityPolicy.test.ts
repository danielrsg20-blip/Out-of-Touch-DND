import assert from 'node:assert/strict'
import test from 'node:test'
import {
  defaultGridCellSizeWorldForQuality,
  parseGenerateQualityMode,
  parseRegenerateQualityMode,
  resolveBattlemapQualityMode,
  resolveImageQualityForMode,
  resolveImageSizeForQuality,
} from './qualityPolicy.js'

test('parseGenerateQualityMode defaults to final when omitted', () => {
  assert.equal(parseGenerateQualityMode(undefined), 'final')
})

test('parseGenerateQualityMode accepts valid values and rejects invalid values', () => {
  assert.equal(parseGenerateQualityMode('fast'), 'fast')
  assert.equal(parseGenerateQualityMode('final'), 'final')
  assert.throws(() => parseGenerateQualityMode('turbo'), /quality_mode must be one of/i)
})

test('parseRegenerateQualityMode handles optional override semantics', () => {
  assert.equal(parseRegenerateQualityMode(undefined), undefined)
  assert.equal(parseRegenerateQualityMode('fast'), 'fast')
  assert.equal(parseRegenerateQualityMode('final'), 'final')
  assert.throws(() => parseRegenerateQualityMode('turbo'), /quality_mode must be one of/i)
})

test('resolveBattlemapQualityMode falls back safely for legacy assets', () => {
  assert.equal(resolveBattlemapQualityMode('fast'), 'fast')
  assert.equal(resolveBattlemapQualityMode('final'), 'final')
  assert.equal(resolveBattlemapQualityMode(undefined), 'final')
  assert.equal(resolveBattlemapQualityMode('legacy-unknown', 'fast'), 'fast')
})

test('default grid policy is coarser in fast mode', () => {
  assert.equal(defaultGridCellSizeWorldForQuality('fast'), 10)
  assert.equal(defaultGridCellSizeWorldForQuality('final'), 5)
})

test('image policy resolves expected size and quality for fast/final', () => {
  assert.equal(resolveImageSizeForQuality('fast'), '1024x1024')
  assert.equal(resolveImageSizeForQuality('final', { orientation: 'portrait' }), '1024x1792')
  assert.equal(resolveImageSizeForQuality('final', { orientation: 'landscape' }), '1792x1024')
  assert.equal(resolveImageSizeForQuality('final', { orientation: 'square' }), '1024x1024')

  assert.equal(resolveImageQualityForMode('fast', false), 'standard')
  assert.equal(resolveImageQualityForMode('final', false), 'standard')
  assert.equal(resolveImageQualityForMode('final', true), 'hd')
})
