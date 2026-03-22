import { Jimp } from 'jimp'
import type { TraversalCell, TraversalGrid, TraversalTag } from './types.js'

type CvExtractionInput = {
  imageUrl: string
  gridWidthCells: number
  gridHeightCells: number
  cellSizeWorld: number
  preferAutoGrid?: boolean
  includePreviewArtifacts?: boolean
}

type CvPreviewArtifacts = {
  collisionMaskPngBase64: string
  costMapPngBase64: string
}

export type CvExtractionResult = {
  grid: TraversalGrid
  imageWidthPx: number
  imageHeightPx: number
  gridWidthCells: number
  gridHeightCells: number
  cellSizePxX: number
  cellSizePxY: number
  detectedCellSizePxX?: number
  detectedCellSizePxY?: number
  gridDetectionConfidence: number
  previewArtifacts?: CvPreviewArtifacts
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function pixelIndex(x: number, y: number, width: number): number {
  return y * width + x
}

function rgbaToGrayscale(data: Uint8Array, width: number, height: number): Uint8Array {
  const out = new Uint8Array(width * height)
  for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    out[p] = Math.round(0.299 * r + 0.587 * g + 0.114 * b)
  }
  return out
}

function histogramEqualize(gray: Uint8Array): Uint8Array {
  const hist = new Uint32Array(256)
  for (const v of gray) hist[v] += 1

  const cdf = new Uint32Array(256)
  let cumulative = 0
  for (let i = 0; i < 256; i += 1) {
    cumulative += hist[i]
    cdf[i] = cumulative
  }

  let cdfMin = 0
  for (let i = 0; i < 256; i += 1) {
    if (cdf[i] > 0) {
      cdfMin = cdf[i]
      break
    }
  }

  const total = gray.length
  if (total <= cdfMin) {
    return gray.slice()
  }

  const lut = new Uint8Array(256)
  for (let i = 0; i < 256; i += 1) {
    const normalized = ((cdf[i] - cdfMin) / (total - cdfMin)) * 255
    lut[i] = clamp(Math.round(normalized), 0, 255)
  }

  const out = new Uint8Array(total)
  for (let i = 0; i < total; i += 1) {
    out[i] = lut[gray[i]]
  }
  return out
}

function boxBlur(gray: Uint8Array, width: number, height: number, radius = 1): Uint8Array {
  const out = new Uint8Array(width * height)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let sum = 0
      let count = 0
      for (let ky = -radius; ky <= radius; ky += 1) {
        for (let kx = -radius; kx <= radius; kx += 1) {
          const px = clamp(x + kx, 0, width - 1)
          const py = clamp(y + ky, 0, height - 1)
          sum += gray[pixelIndex(px, py, width)]
          count += 1
        }
      }
      out[pixelIndex(x, y, width)] = Math.round(sum / count)
    }
  }
  return out
}

function sobelMagnitude(gray: Uint8Array, width: number, height: number): Uint8Array {
  const out = new Uint8Array(width * height)
  const gx = [-1, 0, 1, -2, 0, 2, -1, 0, 1]
  const gy = [-1, -2, -1, 0, 0, 0, 1, 2, 1]

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      let sx = 0
      let sy = 0
      let i = 0
      for (let ky = -1; ky <= 1; ky += 1) {
        for (let kx = -1; kx <= 1; kx += 1) {
          const value = gray[pixelIndex(x + kx, y + ky, width)]
          sx += value * gx[i]
          sy += value * gy[i]
          i += 1
        }
      }
      const magnitude = Math.sqrt((sx * sx) + (sy * sy))
      out[pixelIndex(x, y, width)] = clamp(Math.round(magnitude / 4), 0, 255)
    }
  }

  return out
}

function laplacianMagnitude(gray: Uint8Array, width: number, height: number): Uint8Array {
  const out = new Uint8Array(width * height)
  const kernel = [0, 1, 0, 1, -4, 1, 0, 1, 0]

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      let v = 0
      let i = 0
      for (let ky = -1; ky <= 1; ky += 1) {
        for (let kx = -1; kx <= 1; kx += 1) {
          const value = gray[pixelIndex(x + kx, y + ky, width)]
          v += value * kernel[i]
          i += 1
        }
      }
      out[pixelIndex(x, y, width)] = clamp(Math.abs(v), 0, 255)
    }
  }

  return out
}

function thresholdToMask(values: Uint8Array, threshold: number): Uint8Array {
  const out = new Uint8Array(values.length)
  for (let i = 0; i < values.length; i += 1) {
    out[i] = values[i] >= threshold ? 1 : 0
  }
  return out
}

function invertThresholdToMask(values: Uint8Array, threshold: number): Uint8Array {
  const out = new Uint8Array(values.length)
  for (let i = 0; i < values.length; i += 1) {
    out[i] = values[i] <= threshold ? 1 : 0
  }
  return out
}

function combineMasksOr(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length)
  for (let i = 0; i < a.length; i += 1) {
    out[i] = a[i] || b[i] ? 1 : 0
  }
  return out
}

function dilate(mask: Uint8Array, width: number, height: number, iterations = 1): Uint8Array {
  let current = mask
  for (let iter = 0; iter < iterations; iter += 1) {
    const out = new Uint8Array(mask.length)
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        let anySet = false
        for (let ky = -1; ky <= 1 && !anySet; ky += 1) {
          for (let kx = -1; kx <= 1; kx += 1) {
            const px = clamp(x + kx, 0, width - 1)
            const py = clamp(y + ky, 0, height - 1)
            if (current[pixelIndex(px, py, width)] === 1) {
              anySet = true
              break
            }
          }
        }
        out[pixelIndex(x, y, width)] = anySet ? 1 : 0
      }
    }
    current = out
  }
  return current
}

function markOutsideWalkable(blocked: Uint8Array, width: number, height: number): Uint8Array {
  const outside = new Uint8Array(width * height)
  const queueX: number[] = []
  const queueY: number[] = []

  function enqueueIfWalkable(x: number, y: number): void {
    const idx = pixelIndex(x, y, width)
    if (outside[idx] === 1 || blocked[idx] === 1) {
      return
    }
    outside[idx] = 1
    queueX.push(x)
    queueY.push(y)
  }

  for (let x = 0; x < width; x += 1) {
    enqueueIfWalkable(x, 0)
    enqueueIfWalkable(x, height - 1)
  }
  for (let y = 0; y < height; y += 1) {
    enqueueIfWalkable(0, y)
    enqueueIfWalkable(width - 1, y)
  }

  let head = 0
  while (head < queueX.length) {
    const x = queueX[head]
    const y = queueY[head]
    head += 1

    const rightX = x + 1
    if (rightX < width) {
      enqueueIfWalkable(rightX, y)
    }

    const leftX = x - 1
    if (leftX >= 0) {
      enqueueIfWalkable(leftX, y)
    }

    const downY = y + 1
    if (downY < height) {
      enqueueIfWalkable(x, downY)
    }

    const upY = y - 1
    if (upY >= 0) {
      enqueueIfWalkable(x, upY)
    }
  }

  return outside
}

function normalizeToUnit(values: Uint8Array): Float32Array {
  let max = 0
  for (const value of values) {
    if (value > max) max = value
  }
  const out = new Float32Array(values.length)
  if (max <= 0) {
    return out
  }
  for (let i = 0; i < values.length; i += 1) {
    out[i] = values[i] / max
  }
  return out
}

function buildAxisProjection(mask: Uint8Array, width: number, height: number, axis: 'x' | 'y'): Float32Array {
  const length = axis === 'x' ? width : height
  const out = new Float32Array(length)

  if (axis === 'x') {
    for (let y = 0; y < height; y += 1) {
      const rowBase = y * width
      for (let x = 0; x < width; x += 1) {
        out[x] += mask[rowBase + x]
      }
    }
    return out
  }

  for (let y = 0; y < height; y += 1) {
    const rowBase = y * width
    let sum = 0
    for (let x = 0; x < width; x += 1) {
      sum += mask[rowBase + x]
    }
    out[y] = sum
  }
  return out
}

function detectDominantPeriod(projection: Float32Array): { period: number; confidence: number } | null {
  const n = projection.length
  if (n < 24) {
    return null
  }

  const minLag = 8
  const maxLag = Math.min(128, Math.floor(n / 2))
  let bestLag = 0
  let bestScore = -1
  let secondScore = -1

  for (let lag = minLag; lag <= maxLag; lag += 1) {
    let num = 0
    let denA = 0
    let denB = 0
    for (let i = 0; i < n - lag; i += 1) {
      const a = projection[i]
      const b = projection[i + lag]
      num += a * b
      denA += a * a
      denB += b * b
    }

    if (denA <= 0 || denB <= 0) {
      continue
    }

    const score = num / Math.sqrt(denA * denB)
    if (score > bestScore) {
      secondScore = bestScore
      bestScore = score
      bestLag = lag
    } else if (score > secondScore) {
      secondScore = score
    }
  }

  if (bestLag <= 0) {
    return null
  }

  const confidence = clamp(bestScore - Math.max(0, secondScore), 0, 1)
  return { period: bestLag, confidence }
}

function buildTraversalGrid(
  blockedMask: Uint8Array,
  costMap: Float32Array,
  width: number,
  height: number,
  gridWidthCells: number,
  gridHeightCells: number,
  cellSizeWorld: number,
  derivationVersion: string,
): TraversalGrid {
  const cells: TraversalCell[] = []
  const cellWidthPx = width / gridWidthCells
  const cellHeightPx = height / gridHeightCells

  const xStarts = new Int32Array(gridWidthCells)
  const xEnds = new Int32Array(gridWidthCells)
  for (let x = 0; x < gridWidthCells; x += 1) {
    const x0 = Math.floor(x * cellWidthPx)
    const x1 = Math.max(x0 + 1, Math.ceil((x + 1) * cellWidthPx))
    const clampedX0 = clamp(x0, 0, width - 1)
    xStarts[x] = clampedX0
    xEnds[x] = clamp(x1, clampedX0 + 1, width)
  }

  const yStarts = new Int32Array(gridHeightCells)
  const yEnds = new Int32Array(gridHeightCells)
  for (let y = 0; y < gridHeightCells; y += 1) {
    const y0 = Math.floor(y * cellHeightPx)
    const y1 = Math.max(y0 + 1, Math.ceil((y + 1) * cellHeightPx))
    const clampedY0 = clamp(y0, 0, height - 1)
    yStarts[y] = clampedY0
    yEnds[y] = clamp(y1, clampedY0 + 1, height)
  }

  for (let y = 0; y < gridHeightCells; y += 1) {
    const clampedY0 = yStarts[y]
    const clampedY1 = yEnds[y]
    for (let x = 0; x < gridWidthCells; x += 1) {
      const clampedX0 = xStarts[x]
      const clampedX1 = xEnds[x]

      let total = 0
      let blocked = 0
      let costSum = 0

      for (let py = clampedY0; py < clampedY1; py += 1) {
        const rowBase = py * width
        for (let px = clampedX0; px < clampedX1; px += 1) {
          const idx = rowBase + px
          total += 1
          if (blockedMask[idx] === 1) {
            blocked += 1
          }
          costSum += costMap[idx]
        }
      }

      const walkableRatio = total > 0 ? (total - blocked) / total : 0
      const traversable = walkableRatio >= 0.5
      const avgCost = total > 0 ? costSum / total : 0
      const movementCost = traversable
        ? Number((1 + (avgCost * 1.5)).toFixed(2))
        : 9999

      const confidenceBase = Math.abs(walkableRatio - 0.5) * 2
      const confidence = Number(clamp(confidenceBase, 0.05, 0.99).toFixed(3))

      let tags: TraversalTag[]
      let movementBlockingTags: string[]
      if (!traversable) {
        tags = ['blocked', 'wall']
        movementBlockingTags = ['blocked', 'wall']
      } else if (movementCost >= 2) {
        tags = ['difficult', 'rubble']
        movementBlockingTags = []
      } else {
        tags = ['open_ground', 'floor']
        movementBlockingTags = []
      }

      cells.push({
        x,
        y,
        traversable,
        movement_cost: movementCost,
        movement_blocking_tags: movementBlockingTags,
        tags,
        confidence,
      })
    }
  }

  return {
    width_cells: gridWidthCells,
    height_cells: gridHeightCells,
    cell_size_world: cellSizeWorld,
    derivation_version: derivationVersion,
    cells,
  }
}

async function encodeRgbaPngBase64(rgba: Uint8Array, width: number, height: number): Promise<string> {
  const image = Jimp.fromBitmap({
    data: Buffer.from(rgba),
    width,
    height,
  })
  const png = await image.getBuffer('image/png')
  return png.toString('base64')
}

function downscaleRgbaNearest(
  rgba: Uint8Array,
  width: number,
  height: number,
  maxDimension: number,
): { rgba: Uint8Array; width: number; height: number } {
  const longest = Math.max(width, height)
  if (longest <= maxDimension) {
    return { rgba, width, height }
  }

  const scale = maxDimension / longest
  const targetWidth = Math.max(1, Math.round(width * scale))
  const targetHeight = Math.max(1, Math.round(height * scale))
  const out = new Uint8Array(targetWidth * targetHeight * 4)

  for (let y = 0; y < targetHeight; y += 1) {
    const srcY = clamp(Math.floor((y / targetHeight) * height), 0, height - 1)
    for (let x = 0; x < targetWidth; x += 1) {
      const srcX = clamp(Math.floor((x / targetWidth) * width), 0, width - 1)
      const srcBase = (srcY * width + srcX) * 4
      const dstBase = (y * targetWidth + x) * 4
      out[dstBase] = rgba[srcBase]
      out[dstBase + 1] = rgba[srcBase + 1]
      out[dstBase + 2] = rgba[srcBase + 2]
      out[dstBase + 3] = rgba[srcBase + 3]
    }
  }

  return {
    rgba: out,
    width: targetWidth,
    height: targetHeight,
  }
}

async function buildPreviewArtifacts(
  blockedMask: Uint8Array,
  costMap: Float32Array,
  width: number,
  height: number,
): Promise<CvPreviewArtifacts> {
  const collisionRgba = new Uint8Array(width * height * 4)
  const costRgba = new Uint8Array(width * height * 4)

  for (let i = 0; i < blockedMask.length; i += 1) {
    const base = i * 4

    const blocked = blockedMask[i] === 1
    const collisionValue = blocked ? 0 : 255
    collisionRgba[base] = collisionValue
    collisionRgba[base + 1] = collisionValue
    collisionRgba[base + 2] = collisionValue
    collisionRgba[base + 3] = 255

    const c = clamp(Math.round(costMap[i] * 255), 0, 255)
    costRgba[base] = c
    costRgba[base + 1] = c
    costRgba[base + 2] = c
    costRgba[base + 3] = 255
  }

  const maxPreviewDimension = 256
  const collisionScaled = downscaleRgbaNearest(collisionRgba, width, height, maxPreviewDimension)
  const costScaled = downscaleRgbaNearest(costRgba, width, height, maxPreviewDimension)

  const [collisionMaskPngBase64, costMapPngBase64] = await Promise.all([
    encodeRgbaPngBase64(collisionScaled.rgba, collisionScaled.width, collisionScaled.height),
    encodeRgbaPngBase64(costScaled.rgba, costScaled.width, costScaled.height),
  ])

  return {
    collisionMaskPngBase64,
    costMapPngBase64,
  }
}

export async function extractTraversalGridFromImageUrl(input: CvExtractionInput): Promise<CvExtractionResult> {
  const response = await fetch(input.imageUrl)
  if (!response.ok) {
    throw new Error(`Image download failed (${response.status})`)
  }

  const bytes = Buffer.from(await response.arrayBuffer())
  const image = await Jimp.read(bytes)
  const width = image.bitmap.width
  const height = image.bitmap.height
  if (width <= 0 || height <= 0) {
    throw new Error('Image dimensions are invalid')
  }

  const gray = rgbaToGrayscale(image.bitmap.data, width, height)
  const equalized = histogramEqualize(gray)
  const blurred = boxBlur(equalized, width, height, 1)

  const edges = sobelMagnitude(blurred, width, height)
  const edgeMask = thresholdToMask(edges, 90)

  const projectionX = buildAxisProjection(edgeMask, width, height, 'x')
  const projectionY = buildAxisProjection(edgeMask, width, height, 'y')
  const periodX = detectDominantPeriod(projectionX)
  const periodY = detectDominantPeriod(projectionY)

  const detectedCellSizePxX = periodX?.period
  const detectedCellSizePxY = periodY?.period
  const gridDetectionConfidence = Number(
    (
      ((periodX?.confidence ?? 0) + (periodY?.confidence ?? 0)) / 2
    ).toFixed(4),
  )

  let gridWidthCells = input.gridWidthCells
  let gridHeightCells = input.gridHeightCells
  let derivationVersion = 'cv_import_v2'

  if (input.preferAutoGrid && detectedCellSizePxX && detectedCellSizePxY) {
    const autoGridW = clamp(Math.round(width / detectedCellSizePxX), 8, 256)
    const autoGridH = clamp(Math.round(height / detectedCellSizePxY), 8, 256)
    const widthRatio = autoGridW / Math.max(1, input.gridWidthCells)
    const heightRatio = autoGridH / Math.max(1, input.gridHeightCells)
    const confidenceThreshold = 0.08
    const ratioWithinBounds = widthRatio >= 0.7 && widthRatio <= 1.3 && heightRatio >= 0.7 && heightRatio <= 1.3

    if (autoGridW > 0 && autoGridH > 0 && gridDetectionConfidence >= confidenceThreshold && ratioWithinBounds) {
      gridWidthCells = autoGridW
      gridHeightCells = autoGridH
      derivationVersion = 'cv_import_v2_auto_grid'
    }
  }

  const darkMask = invertThresholdToMask(equalized, 85)
  const combinedWalls = combineMasksOr(edgeMask, darkMask)
  const thickWalls = dilate(combinedWalls, width, height, 2)

  const outsideWalkable = markOutsideWalkable(thickWalls, width, height)
  const blockedMask = new Uint8Array(width * height)

  let walkablePixels = 0
  for (let i = 0; i < blockedMask.length; i += 1) {
    const blocked = thickWalls[i] === 1 || outsideWalkable[i] === 1
    blockedMask[i] = blocked ? 1 : 0
    if (!blocked) {
      walkablePixels += 1
    }
  }

  // If flood-fill over-removed interior, fall back to wall-only mask.
  if ((walkablePixels / blockedMask.length) < 0.03) {
    for (let i = 0; i < blockedMask.length; i += 1) {
      blockedMask[i] = thickWalls[i]
    }
  }

  const laplacian = laplacianMagnitude(blurred, width, height)
  const costMap = normalizeToUnit(laplacian)

  const grid = buildTraversalGrid(
    blockedMask,
    costMap,
    width,
    height,
    gridWidthCells,
    gridHeightCells,
    input.cellSizeWorld,
    derivationVersion,
  )

  const previewArtifacts = input.includePreviewArtifacts
    ? await buildPreviewArtifacts(blockedMask, costMap, width, height)
    : undefined

  return {
    grid,
    imageWidthPx: width,
    imageHeightPx: height,
    gridWidthCells,
    gridHeightCells,
    cellSizePxX: width / gridWidthCells,
    cellSizePxY: height / gridHeightCells,
    detectedCellSizePxX,
    detectedCellSizePxY,
    gridDetectionConfidence,
    previewArtifacts,
  }
}
