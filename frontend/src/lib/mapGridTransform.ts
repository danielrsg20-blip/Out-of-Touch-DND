import type { MapData, MapMode } from '../types'
import { MAP_MODE_AI, resolveMapMode } from './battlemapState'

const DEFAULT_CELL_SIZE_PX = 32

type GridTransformInput = {
  mode: MapMode
  mapWidthCells: number
  mapHeightCells: number
  mapWidthPx: number
  mapHeightPx: number
  cellWidthPx: number
  cellHeightPx: number
}

export type MapGridTransform = GridTransformInput & {
  cellToPixelRect: (gx: number, gy: number, wCells?: number, hCells?: number) => { x: number; y: number; width: number; height: number }
  cellToPixelCenter: (gx: number, gy: number, wCells?: number, hCells?: number) => { x: number; y: number }
  pixelToCell: (px: number, py: number) => { gx: number; gy: number }
}

function sanitizePositive(value: unknown, fallback: number): number {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

export function createMapGridTransform(map: MapData | null | undefined): MapGridTransform {
  const mapWidthCells = Math.max(1, Math.trunc(Number(map?.width ?? 1)))
  const mapHeightCells = Math.max(1, Math.trunc(Number(map?.height ?? 1)))
  const mode = resolveMapMode(map)
  const metadata = map?.metadata

  const metadataCellSize = sanitizePositive(metadata?.grid_cell_size_px, DEFAULT_CELL_SIZE_PX)
  const imageWidthPx = sanitizePositive(metadata?.image_width_px, mapWidthCells * metadataCellSize)
  const imageHeightPx = sanitizePositive(metadata?.image_height_px, mapHeightCells * metadataCellSize)

  const mapWidthPx = mode === MAP_MODE_AI
    ? imageWidthPx
    : mapWidthCells * metadataCellSize
  const mapHeightPx = mode === MAP_MODE_AI
    ? imageHeightPx
    : mapHeightCells * metadataCellSize

  const cellWidthPx = mapWidthPx / mapWidthCells
  const cellHeightPx = mapHeightPx / mapHeightCells

  return {
    mode,
    mapWidthCells,
    mapHeightCells,
    mapWidthPx,
    mapHeightPx,
    cellWidthPx,
    cellHeightPx,
    cellToPixelRect: (gx, gy, wCells = 1, hCells = 1) => ({
      x: gx * cellWidthPx,
      y: gy * cellHeightPx,
      width: wCells * cellWidthPx,
      height: hCells * cellHeightPx,
    }),
    cellToPixelCenter: (gx, gy, wCells = 1, hCells = 1) => ({
      x: (gx + wCells / 2) * cellWidthPx,
      y: (gy + hCells / 2) * cellHeightPx,
    }),
    pixelToCell: (px, py) => ({
      gx: Math.floor(px / cellWidthPx),
      gy: Math.floor(py / cellHeightPx),
    }),
  }
}
