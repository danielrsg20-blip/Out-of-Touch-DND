import { createHash } from 'node:crypto'
import { PythonRandom } from '../pythonRandom.js'
import type { JsonRecord } from './types.js'

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableSerialize(entry)).join(',')}]`
  }

  const obj = value as JsonRecord
  const keys = Object.keys(obj).sort()
  const body = keys
    .map((key) => `${JSON.stringify(key)}:${stableSerialize(obj[key])}`)
    .join(',')
  return `{${body}}`
}

export function canonicalHash(value: unknown): string {
  return createHash('sha256').update(stableSerialize(value), 'utf8').digest('hex')
}

export function stableSeed(seed: number, payload: unknown, version = 'vector-gen-1.0.0'): number {
  const digest = canonicalHash({ seed, payload, version })
  return Number.parseInt(digest.slice(0, 8), 16)
}

export function splitSeed(rootSeed: number, namespace: string): number {
  const digest = canonicalHash({ rootSeed, namespace })
  return Number.parseInt(digest.slice(0, 8), 16)
}

export function createRng(seed: number): PythonRandom {
  return new PythonRandom(seed)
}

export function deterministicId(prefix: string, parts: unknown[]): string {
  const digest = canonicalHash(parts)
  return `${prefix}_${digest.slice(0, 12)}`
}

export function nowIsoUtc(): string {
  return new Date().toISOString()
}
