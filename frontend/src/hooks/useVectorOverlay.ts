/**
 * useVectorOverlay.ts
 *
 * React hook for managing vector overlay state, undo/redo, and API calls.
 * Provides state management for the overlay system and integrates with the backend.
 */

import { useCallback, useRef } from 'react'
import type {
  Overlay,
  OverlayLayer,
  OverlayElement,
  Region,
  Path,
  Decal,
  OverlayCommand,
} from '../types'
import { exportOverlayAsSVG } from '../lib/VectorOverlayRenderer'
import { useOverlayStore } from '../stores/overlayStore'
import { callBackendApi } from '../lib/backendApi'

interface UseVectorOverlayOptions {
  maxUndoSteps?: number
}

export function useVectorOverlay(options: UseVectorOverlayOptions = {}) {
  const maxUndoSteps = options.maxUndoSteps ?? 50

  const overlay = useOverlayStore((s) => s.overlay)
  const setOverlay = useOverlayStore((s) => s.setOverlay)
  const selectedElementId = useOverlayStore((s) => s.selectedElementId)
  const setSelectedElementId = useOverlayStore((s) => s.setSelectedElementId)
  const undoStackRef = useRef<OverlayCommand[]>([])
  const redoStackRef = useRef<OverlayCommand[]>([])

  /**
   * Execute a command and push it to undo stack
   */
  const executeCommand = useCallback(
    (command: OverlayCommand) => {
      command.execute()
      undoStackRef.current.push(command)

      // Limit undo stack size
      if (undoStackRef.current.length > maxUndoSteps) {
        undoStackRef.current.shift()
      }

      // Clear redo stack on new command
      redoStackRef.current = []
    },
    [maxUndoSteps]
  )

  /**
   * Undo last command
   */
  const undo = useCallback(() => {
    if (undoStackRef.current.length === 0) return

    const command = undoStackRef.current.pop()!
    command.undo()
    redoStackRef.current.push(command)
  }, [])

  /**
   * Redo last undone command
   */
  const redo = useCallback(() => {
    if (redoStackRef.current.length === 0) return

    const command = redoStackRef.current.pop()!
    command.execute()
    undoStackRef.current.push(command)
  }, [])

  /**
   * Create or load an overlay
   */
  const loadOverlay = useCallback((newOverlay: Overlay) => {
    setOverlay(newOverlay)
    undoStackRef.current = []
    redoStackRef.current = []
  }, [setOverlay])

  /**
   * Create a new region in the overlay
   */
  const createRegion = useCallback(
    (layerName: string, region: Region) => {
      if (!overlay) return

      const command: OverlayCommand = {
        type: 'createRegion',
        execute: () => {
          setOverlay((prev) => {
            if (!prev) return prev
            const updated = JSON.parse(JSON.stringify(prev))
            const layer = updated.layers.find((l: OverlayLayer) => l.name === layerName)
            if (layer) {
              layer.elements.push(region)
            }
            return updated
          })
        },
        undo: () => {
          setOverlay((prev) => {
            if (!prev) return prev
            const updated = JSON.parse(JSON.stringify(prev))
            const layer = updated.layers.find((l: OverlayLayer) => l.name === layerName)
            if (layer) {
              layer.elements = layer.elements.filter((e: OverlayElement) => e.id !== region.id)
            }
            return updated
          })
        },
      }

      executeCommand(command)
    },
    [overlay, executeCommand]
  )

  /**
   * Create a new path in the overlay
   */
  const createPath = useCallback(
    (layerName: string, path: Path) => {
      if (!overlay) return

      const command: OverlayCommand = {
        type: 'createPath',
        execute: () => {
          setOverlay((prev) => {
            if (!prev) return prev
            const updated = JSON.parse(JSON.stringify(prev))
            const layer = updated.layers.find((l: OverlayLayer) => l.name === layerName)
            if (layer) {
              layer.elements.push(path)
            }
            return updated
          })
        },
        undo: () => {
          setOverlay((prev) => {
            if (!prev) return prev
            const updated = JSON.parse(JSON.stringify(prev))
            const layer = updated.layers.find((l: OverlayLayer) => l.name === layerName)
            if (layer) {
              layer.elements = layer.elements.filter((e: OverlayElement) => e.id !== path.id)
            }
            return updated
          })
        },
      }

      executeCommand(command)
    },
    [overlay, executeCommand]
  )

  /**
   * Stamp decals at multiple positions
   */
  const stampDecals = useCallback(
    (layerName: string, decals: Decal[]) => {
      if (!overlay) return

      const command: OverlayCommand = {
        type: 'stampDecals',
        execute: () => {
          setOverlay((prev) => {
            if (!prev) return prev
            const updated = JSON.parse(JSON.stringify(prev))
            const layer = updated.layers.find((l: OverlayLayer) => l.name === layerName)
            if (layer) {
              layer.elements.push(...decals)
            }
            return updated
          })
        },
        undo: () => {
          setOverlay((prev) => {
            if (!prev) return prev
            const updated = JSON.parse(JSON.stringify(prev))
            const layer = updated.layers.find((l: OverlayLayer) => l.name === layerName)
            if (layer) {
              const decalIds = new Set(decals.map((d) => d.id))
              layer.elements = layer.elements.filter((e: OverlayElement) => !decalIds.has(e.id))
            }
            return updated
          })
        },
      }

      executeCommand(command)
    },
    [overlay, executeCommand]
  )

  /**
   * Delete an element by ID
   */
  const deleteElement = useCallback(
    (elementId: string) => {
      if (!overlay) return

      const command: OverlayCommand = {
        type: 'deleteElement',
        execute: () => {
          setOverlay((prev) => {
            if (!prev) return prev
            const updated = JSON.parse(JSON.stringify(prev))
            for (const layer of updated.layers) {
              const idx = layer.elements.findIndex((e: OverlayElement) => e.id === elementId)
              if (idx >= 0) {
                layer.elements.splice(idx, 1)
                break
              }
            }
            return updated
          })
          setSelectedElementId(null)
        },
        undo: () => {
          // TODO: store removed element for undo
        },
      }

      executeCommand(command)
    },
    [overlay, executeCommand]
  )

  /**
   * Update an element's properties
   */
  const updateElement = useCallback(
    (elementId: string, updates: Partial<OverlayElement>) => {
      if (!overlay) return

      const command: OverlayCommand = {
        type: 'updateElement',
        execute: () => {
          setOverlay((prev) => {
            if (!prev) return prev
            const updated = JSON.parse(JSON.stringify(prev))
            for (const layer of updated.layers) {
              const element = layer.elements.find((e: OverlayElement) => e.id === elementId)
              if (element) {
                Object.assign(element, updates)
                break
              }
            }
            return updated
          })
        },
        undo: () => {
          // TODO: store previous state for undo
        },
      }

      executeCommand(command)
    },
    [overlay, executeCommand]
  )

  /**
   * Create a new layer
   */
  const createLayer = useCallback(
    (name: string, z_index: number) => {
      if (!overlay) return

      const newLayer: OverlayLayer = {
        id: `layer_${Date.now()}`,
        name,
        z_index,
        visible: true,
        blend_mode: 'normal',
        opacity: 1.0,
        elements: [],
      }

      const command: OverlayCommand = {
        type: 'createLayer',
        execute: () => {
          setOverlay((prev) => {
            if (!prev) return prev
            const updated = JSON.parse(JSON.stringify(prev))
            updated.layers.push(newLayer)
            updated.layers.sort((a: OverlayLayer, b: OverlayLayer) => a.z_index - b.z_index)
            return updated
          })
        },
        undo: () => {
          setOverlay((prev) => {
            if (!prev) return prev
            const updated = JSON.parse(JSON.stringify(prev))
            updated.layers = updated.layers.filter((l: OverlayLayer) => l.id !== newLayer.id)
            return updated
          })
        },
      }

      executeCommand(command)
    },
    [overlay, executeCommand]
  )

  /**
   * Set layer visibility
   */
  const setLayerVisibility = useCallback(
    (layerId: string, visible: boolean) => {
      if (!overlay) return

      setOverlay((prev) => {
        if (!prev) return prev
        const updated = JSON.parse(JSON.stringify(prev))
        const layer = updated.layers.find((l: OverlayLayer) => l.id === layerId)
        if (layer) {
          layer.visible = visible
        }
        return updated
      })
    },
    [overlay]
  )

  /**
   * Save overlay to JSON file
   */
  const saveOverlay = useCallback(() => {
    if (!overlay) return

    const json = JSON.stringify(overlay, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${overlay.id}_overlay.json`
    a.click()
    URL.revokeObjectURL(url)
  }, [overlay])

  /**
   * Load overlay from JSON file
   */
  const loadFromFile = useCallback((file: File) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string
        const loaded = JSON.parse(content) as Overlay
        loadOverlay(loaded)
      } catch (err) {
        console.error('Failed to load overlay:', err)
      }
    }
    reader.readAsText(file)
  }, [loadOverlay])

  /**
   * Export overlay as SVG
   */
  const exportAsSVG = useCallback(
    (width: number = 1024, height: number = 1024) => {
      if (!overlay) return

      // Simple SVG export (delegates to VectorOverlayRenderer)
      const svg = exportOverlayAsSVG(overlay, width, height)

      const blob = new Blob([svg], { type: 'image/svg+xml' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${overlay.id}_overlay.svg`
      a.click()
      URL.revokeObjectURL(url)
    },
    [overlay]
  )

  const createOverlayRemote = useCallback(async (overlayId: string, name: string, mapId?: string) => {
    const res = await callBackendApi('/api/overlays/create', {
      method: 'POST',
      body: { overlay_id: overlayId, name, map_id: mapId },
    })
    const data = res.data
    if (!res.ok) {
      throw new Error((data.error as string) || 'Failed to create overlay')
    }
    const created = data.overlay as Overlay | undefined
    if (created) {
      loadOverlay(created)
    }
    return created ?? null
  }, [loadOverlay])

  const fetchOverlayRemote = useCallback(async (overlayId: string) => {
    const res = await callBackendApi(`/api/overlays/${overlayId}`)
    const data = res.data
    if (!res.ok) {
      throw new Error((data.error as string) || 'Failed to fetch overlay')
    }
    const fetched = data.overlay as Overlay | undefined
    if (fetched) {
      loadOverlay(fetched)
    }
    return fetched ?? null
  }, [loadOverlay])

  const saveCurrentOverlayRemote = useCallback(async () => {
    if (!overlay) return null
    const res = await callBackendApi(`/api/overlays/${overlay.id}/export`)
    const text = res.text
    if (!res.ok) {
      throw new Error('Failed to export overlay from backend')
    }
    return text
  }, [overlay])

  const generateFromNarrativeRemote = useCallback(
    async (args: {
      narrative: string
      overlayId?: string
      overlayName?: string
      roomCode?: string
      mapId?: string
      mapWidth?: number
      mapHeight?: number
      tileSize?: number
      styleId?: string
      seed?: number
      replace?: boolean
    }) => {
      const res = await callBackendApi('/api/overlays/generate', {
        method: 'POST',
        body: {
          narrative: args.narrative,
          overlay_id: args.overlayId,
          overlay_name: args.overlayName,
          room_code: args.roomCode,
          map_id: args.mapId,
          map_width: args.mapWidth,
          map_height: args.mapHeight,
          tile_size: args.tileSize ?? 32,
          style_id: args.styleId ?? 'default',
          seed: args.seed,
          replace: args.replace ?? true,
        },
      })
      const data = res.data
      if (!res.ok) {
        throw new Error((data.error as string) || 'Failed to generate overlay from narrative')
      }
      const generated = data.overlay as Overlay | undefined
      if (generated) {
        loadOverlay(generated)
      }
      return generated ?? null
    },
    [loadOverlay]
  )

  return {
    overlay,
    selectedElementId,
    setSelectedElementId,
    loadOverlay,
    createRegion,
    createPath,
    stampDecals,
    deleteElement,
    updateElement,
    createLayer,
    setLayerVisibility,
    undo,
    redo,
    canUndo: undoStackRef.current.length > 0,
    canRedo: redoStackRef.current.length > 0,
    saveOverlay,
    loadFromFile,
    exportAsSVG,
    createOverlayRemote,
    fetchOverlayRemote,
    saveCurrentOverlayRemote,
    generateFromNarrativeRemote,
  }
}

export type UseVectorOverlayReturn = ReturnType<typeof useVectorOverlay>
