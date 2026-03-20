import { create } from 'zustand'
import type { MapCorrectionPreviewArtifacts, MapCorrectionTool } from '../types'

const CORRECTION_TOOL_ORDER: MapCorrectionTool[] = [
  'inspect',
  'paint_blocked',
  'paint_walkable',
  'paint_cost',
  'mark_door',
]

interface MapEditorState {
  correctionModeEnabled: boolean
  activeTool: MapCorrectionTool
  brushSizeCells: number
  brushMovementCost: number
  hasUnsavedChanges: boolean
  previewBusy: boolean
  applyBusy: boolean
  showCollisionMaskLayer: boolean
  showCostMapLayer: boolean
  artifactLayerOpacity: number
  previewArtifacts: {
    collisionMaskPngBase64: string | null
    costMapPngBase64: string | null
  }

  setCorrectionModeEnabled: (enabled: boolean) => void
  cycleTool: () => void
  setActiveTool: (tool: MapCorrectionTool) => void
  cycleBrushSize: () => void
  setBrushMovementCost: (cost: number) => void
  setPreviewBusy: (busy: boolean) => void
  setApplyBusy: (busy: boolean) => void
  toggleCollisionMaskLayer: () => void
  toggleCostMapLayer: () => void
  setArtifactLayerOpacity: (opacity: number) => void
  setPreviewArtifacts: (artifacts: MapCorrectionPreviewArtifacts | null | undefined) => void
  markDirty: () => void
  clearDirty: () => void
  resetEditor: () => void
}

export const useMapEditorStore = create<MapEditorState>((set) => ({
  correctionModeEnabled: false,
  activeTool: 'inspect',
  brushSizeCells: 1,
  brushMovementCost: 2,
  hasUnsavedChanges: false,
  previewBusy: false,
  applyBusy: false,
  showCollisionMaskLayer: false,
  showCostMapLayer: false,
  artifactLayerOpacity: 0.58,
  previewArtifacts: {
    collisionMaskPngBase64: null,
    costMapPngBase64: null,
  },

  setCorrectionModeEnabled: (enabled) => set({ correctionModeEnabled: enabled }),

  cycleTool: () => set((state) => {
    const index = CORRECTION_TOOL_ORDER.indexOf(state.activeTool)
    const next = index < 0 ? CORRECTION_TOOL_ORDER[0] : CORRECTION_TOOL_ORDER[(index + 1) % CORRECTION_TOOL_ORDER.length]
    return { activeTool: next }
  }),

  setActiveTool: (tool) => set({ activeTool: tool }),

  cycleBrushSize: () => set((state) => ({
    brushSizeCells: state.brushSizeCells >= 4 ? 1 : state.brushSizeCells + 1,
  })),

  setBrushMovementCost: (cost) => set({
    brushMovementCost: Number.isFinite(cost) ? Math.min(6, Math.max(0.5, Number(cost.toFixed(2)))) : 2,
  }),

  setPreviewBusy: (busy) => set({ previewBusy: busy }),
  setApplyBusy: (busy) => set({ applyBusy: busy }),
  toggleCollisionMaskLayer: () => set((state) => ({ showCollisionMaskLayer: !state.showCollisionMaskLayer })),
  toggleCostMapLayer: () => set((state) => ({ showCostMapLayer: !state.showCostMapLayer })),
  setArtifactLayerOpacity: (opacity) => set({
    artifactLayerOpacity: Number.isFinite(opacity)
      ? Math.min(1, Math.max(0, Number(opacity.toFixed(2))))
      : 0.58,
  }),

  setPreviewArtifacts: (artifacts) => set({
    previewArtifacts: {
      collisionMaskPngBase64: artifacts?.collision_mask_png_base64 ?? null,
      costMapPngBase64: artifacts?.cost_map_png_base64 ?? null,
    },
  }),

  markDirty: () => set({ hasUnsavedChanges: true }),
  clearDirty: () => set({ hasUnsavedChanges: false }),

  resetEditor: () => set({
    correctionModeEnabled: false,
    activeTool: 'inspect',
    brushSizeCells: 1,
    brushMovementCost: 2,
    hasUnsavedChanges: false,
    previewBusy: false,
    applyBusy: false,
    showCollisionMaskLayer: false,
    showCostMapLayer: false,
    artifactLayerOpacity: 0.58,
    previewArtifacts: {
      collisionMaskPngBase64: null,
      costMapPngBase64: null,
    },
  }),
}))
