import { create } from 'zustand'
import type { Overlay, FrontendTraversalGrid, GridOverlayConfig, GridOverlayMode } from '../types'
import { DEFAULT_GRID_OVERLAY_CONFIG } from '../types'

interface OverlayState {
  overlay: Overlay | null
  /** Traversal grid from the most recent generate_vector_map call. Used by the grid overlay renderer. */
  traversalGrid: FrontendTraversalGrid | null
  /** Configuration for the toggleable grid debug overlay. */
  gridOverlayConfig: GridOverlayConfig
  selectedElementId: string | null
  setOverlay: (overlay: Overlay | null | ((prev: Overlay | null) => Overlay | null)) => void
  setTraversalGrid: (grid: FrontendTraversalGrid | null) => void
  /**
   * Partially update the grid overlay config.
   * Programmatic API: overlayStore.getState().setGridOverlayConfig({ visible: true, mode: 'blocked' })
   */
  setGridOverlayConfig: (config: Partial<GridOverlayConfig>) => void
  setSelectedElementId: (id: string | null) => void
  clearOverlay: () => void
}

export const useOverlayStore = create<OverlayState>((set) => ({
  overlay: null,
  traversalGrid: null,
  gridOverlayConfig: { ...DEFAULT_GRID_OVERLAY_CONFIG },
  selectedElementId: null,
  setOverlay: (overlay) =>
    set((state) => ({
      overlay: typeof overlay === 'function' ? overlay(state.overlay) : overlay,
    })),
  setTraversalGrid: (grid) => set({ traversalGrid: grid }),
  setGridOverlayConfig: (config) =>
    set((state) => ({
      gridOverlayConfig: { ...state.gridOverlayConfig, ...config },
    })),
  setSelectedElementId: (id) => set({ selectedElementId: id }),
  clearOverlay: () => set({ overlay: null, selectedElementId: null }),
}))

// ---------------------------------------------------------------------------
// Convenience accessor for non-React callers (console, tests, external tools)
// ---------------------------------------------------------------------------

/**
 * Show the grid overlay with the given mode and opacity.
 * Can be called from anywhere (outside React component tree).
 *
 * @example
 *   import { showGridOverlay } from '../stores/overlayStore'
 *   showGridOverlay('movement_cost', 0.7)
 */
export function showGridOverlay(mode: GridOverlayMode, opacity = 0.55): void {
  useOverlayStore.getState().setGridOverlayConfig({ visible: true, mode, opacity })
}

/**
 * Hide the grid overlay.
 */
export function hideGridOverlay(): void {
  useOverlayStore.getState().setGridOverlayConfig({ visible: false })
}
