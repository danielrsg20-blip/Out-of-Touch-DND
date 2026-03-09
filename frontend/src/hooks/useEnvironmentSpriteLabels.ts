import { useEffect, useState } from 'react'
import {
  getEnvironmentSpriteLabels,
  getEnvironmentSpriteLabelsSync,
} from '../data/environmentSpriteAtlas'

export interface EnvironmentSpriteLabelsState {
  labels: string[]
  isLoading: boolean
  error: string | null
}

export function useEnvironmentSpriteLabels(): EnvironmentSpriteLabelsState {
  const [labels, setLabels] = useState<string[]>(() => getEnvironmentSpriteLabelsSync())
  const [isLoading, setIsLoading] = useState<boolean>(labels.length === 0)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    if (labels.length === 0) {
      setIsLoading(true)
    }

    void getEnvironmentSpriteLabels()
      .then((nextLabels) => {
        if (cancelled) {
          return
        }
        setLabels(nextLabels)
        setError(null)
      })
      .catch((err: unknown) => {
        if (cancelled) {
          return
        }
        const message = err instanceof Error ? err.message : 'Failed to load environment sprite labels'
        setError(message)
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  return { labels, isLoading, error }
}
