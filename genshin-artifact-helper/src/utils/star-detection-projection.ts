/**
 * Projection-based (column/row histogram) star detection algorithm
 */

import {
  isStarColor,
  type StarDetectorFn,
  type StarDetectionSettings,
} from '@/utils/star-detection-types'

// ─── Projection algorithm helpers ─────────────────────────────────────────────

/**
 * Find contiguous runs where histogram[i] >= minPixels.
 */
function detectRegions(
  histogram: number[],
  minPixels: number,
): Array<{ start: number; end: number }> {
  const regions: Array<{ start: number; end: number }> = []
  let inRegion = false
  let start = 0
  for (let i = 0; i < histogram.length; i++) {
    if (!inRegion && (histogram[i] ?? 0) >= minPixels) {
      inRegion = true
      start = i
    } else if (inRegion && (histogram[i] ?? 0) < minPixels) {
      regions.push({ start, end: i - 1 })
      inRegion = false
    }
  }
  if (inRegion) regions.push({ start, end: histogram.length - 1 })
  return regions
}

/**
 * Compute star-colored pixel count per column (column histogram only).
 * When `bounds` is provided (pixel coords), only the bounded region is scanned —
 * columns outside the range have value 0 and are filtered out by detectRegions.
 */
function computeColumnHistogramOnly(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  settings: StarDetectionSettings,
  bounds?: { xMin: number; xMax: number; yMin: number; yMax: number },
): number[] {
  const colHist = new Array<number>(width).fill(0)
  const xStart = bounds?.xMin ?? 0
  const xEnd = bounds?.xMax ?? width
  const yStart = bounds?.yMin ?? 0
  const yEnd = bounds?.yMax ?? height
  for (let y = yStart; y < yEnd; y++) {
    for (let x = xStart; x < xEnd; x++) {
      const idx = (y * width + x) * 4
      if (isStarColor(data[idx] ?? 0, data[idx + 1] ?? 0, data[idx + 2] ?? 0, settings)) {
        colHist[x] = (colHist[x] ?? 0) + 1
      }
    }
  }
  return colHist
}

/**
 * Count star-colored pixels per row, but only within the given column regions.
 */
function computeConstrainedRowHistogram(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  columnRegions: Array<{ start: number; end: number }>,
  settings: StarDetectionSettings,
): number[] {
  const rowHist = new Array<number>(height).fill(0)
  for (let y = 0; y < height; y++) {
    for (const col of columnRegions) {
      for (let x = col.start; x <= col.end && x < width; x++) {
        const idx = (y * width + x) * 4
        if (isStarColor(data[idx] ?? 0, data[idx + 1] ?? 0, data[idx + 2] ?? 0, settings)) {
          rowHist[y] = (rowHist[y] ?? 0) + 1
        }
      }
    }
  }
  return rowHist
}

/**
 * Return the index of the highest histogram value within the given valid regions.
 * Returns null if validRange is empty.
 */
function findHistogramPeak(
  histogram: number[],
  validRange: Array<{ start: number; end: number }>,
): number | null {
  if (validRange.length === 0) return null
  let bestVal = -1
  let bestIdx = 0
  for (const region of validRange) {
    for (let i = region.start; i <= region.end; i++) {
      const v = histogram[i] ?? 0
      if (v > bestVal) {
        bestVal = v
        bestIdx = i
      }
    }
  }
  return bestIdx
}

/**
 * Check whether any star-colored pixel exists within a column band [xStart, xEnd]
 * at rows [yMin, yMax].
 */
function hasStarInBand(
  data: Uint8ClampedArray,
  width: number,
  xStart: number,
  xEnd: number,
  yMin: number,
  yMax: number,
  settings: StarDetectionSettings,
): boolean {
  for (let y = yMin; y <= yMax; y++) {
    for (let x = xStart; x <= xEnd && x < width; x++) {
      const idx = (y * width + x) * 4
      if (isStarColor(data[idx] ?? 0, data[idx + 1] ?? 0, data[idx + 2] ?? 0, settings)) return true
    }
  }
  return false
}

/**
 * Given candidate star column regions, find the largest subset with consistent
 * center-to-center spacing (within projSpacingTolerance of starDistancePercent * screenHeight).
 */
function validateStarSpacing(
  regions: Array<{ start: number; end: number }>,
  screenHeight: number,
  settings: StarDetectionSettings,
): Array<{ start: number; end: number }> {
  if (regions.length <= 1) return regions

  const expectedDist = screenHeight * settings.starDistancePercent
  const tolerance = settings.projSpacingTolerance
  const centers = regions.map(r => r.start + Math.floor((r.end - r.start) / 2))

  let bestIndices: number[] = []

  // Building chains forward-only is sufficient: since startIdx iterates over
  // every possible chain start, the optimal chain will always be found in the
  // iteration where startIdx equals its actual first element.
  for (let startIdx = 0; startIdx < regions.length - 1; startIdx++) {
    for (let secondIdx = startIdx + 1; secondIdx < regions.length; secondIdx++) {
      const refDist = (centers[secondIdx]! - centers[startIdx]!)
      if (Math.abs(refDist - expectedDist) / expectedDist > tolerance) continue

      // Build chain with consistent spacing from this pair
      const chain = [startIdx, secondIdx]
      for (let j = secondIdx + 1; j < regions.length; j++) {
        const lastCenter = centers[chain[chain.length - 1]!]!
        const dist = centers[j]! - lastCenter
        if (Math.abs(dist - expectedDist) / expectedDist <= tolerance) {
          chain.push(j)
        }
      }

      if (chain.length > bestIndices.length) bestIndices = chain
    }
  }

  if (bestIndices.length === 0) return []
  return bestIndices.map(i => regions[i]!)
}

// ─── Projection detector implementation ───────────────────────────────────────

function projectionStarDetectorImpl(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  screenHeight: number,
  settings: StarDetectionSettings,
  bounds?: { xMin: number; xMax: number; yMin: number; yMax: number },
): { center: { x: number; y: number }; count: number } | null {
  return debugProjectionDetect(data, width, height, screenHeight, settings, bounds).result
}

/** Projection-based (column/row histogram) star detector */
export const projectionStarDetector: StarDetectorFn = projectionStarDetectorImpl

// ─── Projection debug helper ───────────────────────────────────────────────────

/**
 * Run the projection algorithm in debug mode, returning all intermediate state.
 */
export function debugProjectionDetect(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  screenHeight: number,
  settings: StarDetectionSettings,
  bounds?: { xMin: number; xMax: number; yMin: number; yMax: number },
): {
  result: { center: { x: number; y: number }; count: number } | null
  colHist: number[]
  colRegions: Array<{ start: number; end: number }>
  constrainedRowHist: number[]
  rowRegions: Array<{ start: number; end: number }>
  peakY: number | null
  starRegions: Array<{ start: number; end: number }>
  validatedRegions: Array<{ start: number; end: number }>
} {
  const colMinW = Math.round(screenHeight * settings.projColMinPercent)
  const colMaxW = Math.round(screenHeight * settings.projColMaxPercent)
  const rowMinH = Math.round(screenHeight * settings.projRowMinPercent)
  const rowMaxH = Math.round(screenHeight * settings.projRowMaxPercent)

  const colHist = computeColumnHistogramOnly(data, width, height, settings, bounds)
  const colRegions = detectRegions(colHist, settings.projColMinPixels)
    .filter(r => {
      const w = r.end - r.start + 1
      return w >= colMinW && w <= colMaxW
    })

  if (colRegions.length === 0) {
    return { result: null, colHist, colRegions, constrainedRowHist: [], rowRegions: [], peakY: null, starRegions: [], validatedRegions: [] }
  }

  const constrainedRowHist = computeConstrainedRowHistogram(data, width, height, colRegions, settings)
  const rowRegions = detectRegions(constrainedRowHist, 1)
    .filter(r => {
      const h = r.end - r.start + 1
      return h >= rowMinH && h <= rowMaxH
    })

  if (rowRegions.length === 0) {
    return { result: null, colHist, colRegions, constrainedRowHist, rowRegions, peakY: null, starRegions: [], validatedRegions: [] }
  }

  const peakY = findHistogramPeak(constrainedRowHist, rowRegions)
  if (peakY === null) {
    return { result: null, colHist, colRegions, constrainedRowHist, rowRegions, peakY: null, starRegions: [], validatedRegions: [] }
  }
  const yMin = Math.max(0, peakY - settings.projYWindowPx)
  const yMax = Math.min(height - 1, peakY + settings.projYWindowPx)
  const starRegions = colRegions.filter(r =>
    hasStarInBand(data, width, r.start, r.end, yMin, yMax, settings)
  )

  if (starRegions.length === 0) {
    return { result: null, colHist, colRegions, constrainedRowHist, rowRegions, peakY, starRegions, validatedRegions: [] }
  }

  const validatedRegions = validateStarSpacing(starRegions, screenHeight, settings)

  if (validatedRegions.length === 0) {
    return { result: null, colHist, colRegions, constrainedRowHist, rowRegions, peakY, starRegions, validatedRegions }
  }

  const count = Math.max(1, Math.min(5, validatedRegions.length))
  const first = validatedRegions[0]!
  const centerX = first.start + Math.floor((first.end - first.start) / 2)

  return {
    result: { center: { x: centerX, y: peakY }, count },
    colHist,
    colRegions,
    constrainedRowHist,
    rowRegions,
    peakY,
    starRegions,
    validatedRegions,
  }
}
