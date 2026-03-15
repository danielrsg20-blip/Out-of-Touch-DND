import type {
  GridValidationReport,
  OverlayElement,
  OverlayPayload,
  PayloadValidationReport,
  Point,
  TraversalGrid,
} from './types.js'
import { BLOCKING_TAG_WHITELIST } from './types.js'

const MAX_VERTICES = 1024
const MIN_POLYGON_VERTICES = 3

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}

function samePoint(a: Point, b: Point): boolean {
  return a.x === b.x && a.y === b.y
}

function validatePoint(point: Point): boolean {
  return isFiniteNumber(point.x) && isFiniteNumber(point.y)
}

function clampPoint(point: Point, minX: number, minY: number, maxX: number, maxY: number): Point {
  return {
    x: clamp(point.x, minX, maxX),
    y: clamp(point.y, minY, maxY),
  }
}

function validateElementGeometry(element: OverlayElement): boolean {
  if (element.type === 'polygon' || element.type === 'polyline') {
    if (!Array.isArray(element.points) || element.points.length === 0 || element.points.length > MAX_VERTICES) {
      return false
    }
    return element.points.every(validatePoint)
  }
  if (element.type === 'decal') {
    return validatePoint(element.position)
  }
  if (element.type === 'text') {
    return validatePoint(element.position)
  }
  return true
}

export function validateOverlayPayload(
  overlay: OverlayPayload,
  validationMode: 'strict' | 'fixup',
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
): PayloadValidationReport {
  const report: PayloadValidationReport = {
    fixed_geometries: 0,
    rejected_elements: 0,
    duplicate_ids: 0,
    out_of_bounds_clamped: 0,
    warnings: [],
  }

  const seen = new Set<string>()

  for (const layer of overlay.layers) {
    const kept: OverlayElement[] = []
    for (const element of layer.elements) {
      if (seen.has(element.id)) {
        report.duplicate_ids += 1
        if (validationMode === 'strict') {
          report.rejected_elements += 1
          continue
        }
        report.warnings.push(`duplicate id auto-kept first only: ${element.id}`)
        report.rejected_elements += 1
        continue
      }
      seen.add(element.id)

      if (!validateElementGeometry(element)) {
        report.rejected_elements += 1
        report.warnings.push(`invalid geometry rejected: ${element.id}`)
        continue
      }

      if (element.type === 'polygon') {
        if (element.points.length < MIN_POLYGON_VERTICES) {
          report.rejected_elements += 1
          report.warnings.push(`polygon too small rejected: ${element.id}`)
          continue
        }
        if (!samePoint(element.points[0]!, element.points[element.points.length - 1]!)) {
          if (validationMode === 'strict') {
            report.rejected_elements += 1
            report.warnings.push(`open polygon rejected in strict mode: ${element.id}`)
            continue
          }
          element.points = [...element.points, { ...element.points[0]! }]
          report.fixed_geometries += 1
        }
      }

      if (element.type === 'polygon' || element.type === 'polyline') {
        const clamped = element.points.map((point) => clampPoint(point, bounds.minX, bounds.minY, bounds.maxX, bounds.maxY))
        const changed = clamped.some((point, idx) => point.x !== element.points[idx]!.x || point.y !== element.points[idx]!.y)
        if (changed) {
          if (validationMode === 'strict') {
            report.rejected_elements += 1
            report.warnings.push(`out-of-bounds geometry rejected in strict mode: ${element.id}`)
            continue
          }
          element.points = clamped
          report.out_of_bounds_clamped += 1
          report.fixed_geometries += 1
        }
      }

      kept.push(element)
    }
    layer.elements = kept
  }

  return report
}

export function validateTraversalGrid(grid: TraversalGrid): GridValidationReport {
  const tagCounts: Record<string, number> = {}
  const unknownBlocking = new Set<string>()
  let blocked = 0
  let mismatch = 0

  const whitelist = new Set<string>(BLOCKING_TAG_WHITELIST)
  for (const cell of grid.cells) {
    for (const tag of cell.tags) {
      tagCounts[tag] = (tagCounts[tag] ?? 0) + 1
    }
    for (const tag of cell.movement_blocking_tags) {
      if (!whitelist.has(tag)) {
        unknownBlocking.add(tag)
      }
    }
    if (!cell.traversable) {
      blocked += 1
    }
    if (cell.movement_blocking_tags.length > 0 && cell.traversable) {
      mismatch += 1
    }
  }

  return {
    unknown_blocking_tags: Array.from(unknownBlocking).sort(),
    blocked_percent: grid.cells.length === 0 ? 0 : (blocked / grid.cells.length) * 100,
    tag_counts: tagCounts,
    blocked_tag_mismatch_count: mismatch,
  }
}
