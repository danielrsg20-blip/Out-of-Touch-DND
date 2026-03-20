import { createBattlemapProvider } from './providerFactory.js'
import { defaultGridCellSizeWorldForQuality, resolveBattlemapQualityMode } from './qualityPolicy.js'
import { extractTraversalGridFromImageUrl } from './cvExtractor.js'
import type {
  BattlemapImportPreviewRequest,
  BattlemapImportPreviewResult,
  ExtractionStageReport,
  TraversalGrid,
  TraversalQualitySummary,
} from './types.js'

function ensureFinitePositiveInt(value: number, name: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a finite positive number`)
  }
  return Math.floor(value)
}

function summarizeTraversalGrid(grid: TraversalGrid): TraversalQualitySummary {
  const totalCells = grid.cells.length
  const blockedCells = grid.cells.filter((cell) => !cell.traversable).length
  const blockedRatio = totalCells > 0 ? blockedCells / totalCells : 0

  const traversableCells = grid.cells.filter((cell) => cell.traversable)
  const avgMovementCost = traversableCells.length > 0
    ? traversableCells.reduce((sum, cell) => sum + cell.movement_cost, 0) / traversableCells.length
    : 0

  const highCostCells = traversableCells.filter((cell) => cell.movement_cost >= 2).length
  const highCostRatio = traversableCells.length > 0 ? highCostCells / traversableCells.length : 0

  return {
    total_cells: totalCells,
    blocked_cells: blockedCells,
    blocked_ratio: Number(blockedRatio.toFixed(4)),
    avg_movement_cost: Number(avgMovementCost.toFixed(4)),
    high_cost_cells: highCostCells,
    high_cost_ratio: Number(highCostRatio.toFixed(4)),
  }
}

function getExtractionStages(): ExtractionStageReport[] {
  return [
    {
      name: 'vision_traversal_inference',
      status: 'placeholder',
      detail: 'Provider vision inference is kept as fallback when CV extraction cannot produce a valid grid.',
    },
    {
      name: 'cv_preprocessing',
      status: 'implemented',
      detail: 'Runs grayscale, histogram equalization, blur, wall-mask dilation, and flood-fill segmentation.',
    },
    {
      name: 'grid_auto_detection',
      status: 'implemented',
      detail: 'Estimates dominant grid spacing from edge projections and can auto-select grid dimensions with confidence diagnostics.',
    },
    {
      name: 'manual_correction_editor',
      status: 'placeholder',
      detail: 'Planned frontend brush-based correction workflow before finalizing traversal data.',
    },
  ]
}

export async function generateBattlemapImportPreview(
  request: BattlemapImportPreviewRequest,
): Promise<BattlemapImportPreviewResult> {
  const imageUrl = request.image_url.trim()
  if (!imageUrl) {
    throw new Error('image_url is required')
  }

  const qualityMode = resolveBattlemapQualityMode(request.quality_mode)
  const cellSizeWorld = request.grid_settings?.cell_size_world ?? defaultGridCellSizeWorldForQuality(qualityMode)
  if (!Number.isFinite(cellSizeWorld) || cellSizeWorld <= 0) {
    throw new Error('grid_settings.cell_size_world must be a positive number')
  }

  const gridWidthCells = request.grid_width_cells != null
    ? ensureFinitePositiveInt(request.grid_width_cells, 'grid_width_cells')
    : ensureFinitePositiveInt(request.scene_spec.map_width_feet / cellSizeWorld, 'derived grid_width_cells')

  const gridHeightCells = request.grid_height_cells != null
    ? ensureFinitePositiveInt(request.grid_height_cells, 'grid_height_cells')
    : ensureFinitePositiveInt(request.scene_spec.map_height_feet / cellSizeWorld, 'derived grid_height_cells')

  const cvStages = getExtractionStages()
  const preferAutoGrid = request.grid_width_cells == null && request.grid_height_cells == null
  const includePreviewArtifacts = request.include_preview_artifacts === true

  try {
    const cv = await extractTraversalGridFromImageUrl({
      imageUrl,
      gridWidthCells,
      gridHeightCells,
      cellSizeWorld,
      preferAutoGrid,
      includePreviewArtifacts,
    })

    return {
      traversal_grid: cv.grid,
      diagnostics: {
        source: 'cv',
        quality_summary: summarizeTraversalGrid(cv.grid),
        grid_width_cells: cv.gridWidthCells,
        grid_height_cells: cv.gridHeightCells,
        cell_size_world: cellSizeWorld,
        grid_detection_confidence: cv.gridDetectionConfidence,
        image_width_px: cv.imageWidthPx,
        image_height_px: cv.imageHeightPx,
        cell_size_px_x: Number(cv.cellSizePxX.toFixed(4)),
        cell_size_px_y: Number(cv.cellSizePxY.toFixed(4)),
        detected_cell_size_px_x: cv.detectedCellSizePxX,
        detected_cell_size_px_y: cv.detectedCellSizePxY,
        preview_artifacts: cv.previewArtifacts
          ? {
              collision_mask_png_base64: cv.previewArtifacts.collisionMaskPngBase64,
              cost_map_png_base64: cv.previewArtifacts.costMapPngBase64,
            }
          : undefined,
      },
      extraction_pipeline: {
        mode: 'cv_baseline',
        version: 'import_preview_v2',
        stages: cvStages,
      },
    }
  } catch (cvError) {
    const provider = createBattlemapProvider('openai')
    const traversal = await provider.generateTraversalData({
      imageUrl,
      sceneSpec: request.scene_spec,
      gridWidthCells,
      gridHeightCells,
      cellSizeWorld,
    })

    const cvFailureMessage = cvError instanceof Error ? cvError.message : 'unknown CV extraction error'
    const fallbackStages: ExtractionStageReport[] = [
      {
        name: 'vision_traversal_inference',
        status: 'implemented',
        detail: 'Provider vision inference generated traversal grid after CV extraction fallback.',
      },
      {
        name: 'cv_preprocessing',
        status: 'implemented',
        detail: `CV extraction attempted but failed: ${cvFailureMessage}`,
      },
      {
        name: 'grid_auto_detection',
        status: 'placeholder',
        detail: 'CV auto-calibration diagnostics unavailable because fallback path was used.',
      },
      {
        name: 'manual_correction_editor',
        status: 'placeholder',
        detail: 'Planned frontend brush-based correction workflow before finalizing traversal data.',
      },
    ]

    return {
      traversal_grid: traversal.grid,
      diagnostics: {
        source: 'vision_fallback',
        quality_summary: summarizeTraversalGrid(traversal.grid),
        grid_width_cells: gridWidthCells,
        grid_height_cells: gridHeightCells,
        cell_size_world: cellSizeWorld,
      },
      extraction_pipeline: {
        mode: 'vision_baseline',
        version: 'import_preview_v2',
        stages: fallbackStages,
      },
    }
  }
}
