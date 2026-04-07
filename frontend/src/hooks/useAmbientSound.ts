import { useEffect, useRef, useState } from 'react'
import {
  triggerAmbientFromMap,
  stopAmbient,
  setAmbientVolume,
  getAmbientVolume,
} from '../lib/ambientAudio'

/**
 * Manages procedural ambient soundscapes tied to map metadata.
 *
 * @param location - map.metadata.location (e.g. 'tavern', 'dungeon', 'forest')
 * @param biome    - map.metadata.biome (e.g. 'temperate', 'underground')
 */
export function useAmbientSound(
  location: string | undefined,
  biome: string | undefined,
) {
  const [enabled, setEnabled] = useState(true)
  const [volume, setVolume] = useState(() => getAmbientVolume())
  const prevKey = useRef<string>('')

  useEffect(() => {
    const key = `${location ?? ''}::${biome ?? ''}`
    if (!enabled) {
      stopAmbient()
      prevKey.current = ''
      return
    }
    if (key === prevKey.current) return
    prevKey.current = key
    triggerAmbientFromMap(location, biome)
  }, [location, biome, enabled])

  // Stop on unmount
  useEffect(() => () => { stopAmbient() }, [])

  const toggle = () => setEnabled(prev => !prev)

  const applyVolume = (vol: number) => {
    setAmbientVolume(vol)
    setVolume(vol)
  }

  return { enabled, toggle, volume, setVolume: applyVolume }
}
