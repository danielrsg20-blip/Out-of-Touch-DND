export interface SpritePipelineHarnessOptions {
  legacyEnabled: boolean
  throwOnFailure?: boolean
}

export interface SpritePipelineHarnessSnapshot {
  legacyEnabled: boolean
  hits: number
  lastReason: string | null
  assertions: number
  failures: number
}

const COUNTER_KEY = '__otdndSpritePipelineHits'
const HARNESS_KEY = '__otdndSpritePipelineHarness'

type HarnessWindow = Window & {
  __otdndSpritePipelineHits?: number
  __otdndSpritePipelineHarness?: {
    getSnapshot: () => SpritePipelineHarnessSnapshot
    assertNoLegacyHits: (context?: string) => boolean
    reset: () => void
  }
}

export interface SpritePipelineHarness {
  bootstrap: () => void
  recordLegacyHit: (reason: string) => void
  assertNoLegacyHits: (context?: string) => boolean
  getSnapshot: () => SpritePipelineHarnessSnapshot
  reset: () => void
}

export function createSpritePipelineAssertHarness(options: SpritePipelineHarnessOptions): SpritePipelineHarness {
  const throwOnFailure = Boolean(options.throwOnFailure)

  let snapshot: SpritePipelineHarnessSnapshot = {
    legacyEnabled: options.legacyEnabled,
    hits: 0,
    lastReason: null,
    assertions: 0,
    failures: 0,
  }

  const publish = () => {
    if (typeof window === 'undefined') {
      return
    }
    const w = window as HarnessWindow
    w[COUNTER_KEY] = snapshot.hits
    w[HARNESS_KEY] = {
      getSnapshot,
      assertNoLegacyHits,
      reset,
    }
  }

  const getSnapshot = (): SpritePipelineHarnessSnapshot => ({ ...snapshot })

  const reset = () => {
    snapshot = {
      ...snapshot,
      hits: 0,
      lastReason: null,
      assertions: 0,
      failures: 0,
    }
    publish()
  }

  const bootstrap = () => {
    publish()
    if (!snapshot.legacyEnabled) {
      console.info('[sprite-pipeline] Hard-disabled: vector renderer is authoritative and legacy sprite rendering must not execute')
    }
  }

  const recordLegacyHit = (reason: string) => {
    snapshot = {
      ...snapshot,
      hits: snapshot.hits + 1,
      lastReason: reason,
    }
    publish()
    console.warn(`[sprite-pipeline] Legacy sprite branch executed (${reason}). hit=${snapshot.hits}`)
  }

  const assertNoLegacyHits = (context = 'runtime'): boolean => {
    snapshot = {
      ...snapshot,
      assertions: snapshot.assertions + 1,
    }

    if (snapshot.legacyEnabled || snapshot.hits === 0) {
      publish()
      return true
    }

    snapshot = {
      ...snapshot,
      failures: snapshot.failures + 1,
    }
    publish()

    const msg = `[sprite-pipeline] ASSERTION FAILED (${context}): legacy sprite path executed ${snapshot.hits} times while disabled; last=${snapshot.lastReason ?? 'unknown'}`
    console.error(msg)
    if (throwOnFailure) {
      throw new Error(msg)
    }
    return false
  }

  return {
    bootstrap,
    recordLegacyHit,
    assertNoLegacyHits,
    getSnapshot,
    reset,
  }
}