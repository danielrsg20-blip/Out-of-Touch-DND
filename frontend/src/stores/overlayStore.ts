import { create } from 'zustand'
import type { Overlay } from '../types'

interface OverlayState {
  overlay: Overlay | null
  selectedElementId: string | null
  setOverlay: (overlay: Overlay | null | ((prev: Overlay | null) => Overlay | null)) => void
  setSelectedElementId: (id: string | null) => void
  clearOverlay: () => void
}

export const useOverlayStore = create<OverlayState>((set) => ({
  overlay: null,
  selectedElementId: null,
  setOverlay: (overlay) =>
    set((state) => ({
      overlay: typeof overlay === 'function' ? overlay(state.overlay) : overlay,
    })),
  setSelectedElementId: (id) => set({ selectedElementId: id }),
  clearOverlay: () => set({ overlay: null, selectedElementId: null }),
}))
