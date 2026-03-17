/**
 * Star detection utilities
 */

import type { StarDetectionResult, Rectangle } from '@/types/ocr-regions'

export interface StarCenterFinderContext {
  data: Uint8ClampedArray
  width: number
  height: number
  cellX: number
  cellY: number
  gridSize: number
  firstMatchX: number
  firstMatchY: number
  settings: StarDetectionSettings
}

export type StarCenterFinderFn = (ctx: StarCenterFinderContext) => { x: number; y: number } | null

export type StarDetectorFn = (
  data: Uint8ClampedArray,
  width: number,
  height: number,
  screenHeight: number,
  settings: StarDetectionSettings,
) => { center: { x: number; y: number }; count: number } | null

export interface StarDetectionSettings {
  starColorR: number
  starColorG: number
  starColorB: number
  colorTolerance: number
  gridSizePercent: number
  starSizePercent: number
  starDistancePercent: number
  pass1SamplePercent: number
  pass1MatchThreshold: number
  pass2SamplePercent: number
  pass2MatchThreshold: number
  pass3SamplePercent: number
  pass3MatchThreshold: number
  confirmThreshold: number
  // Projection algorithm thresholds (all widths/heights as % of screenHeight)
  projColMinPercent: number
  projColMaxPercent: number
  projColMinPixels: number
  projRowMinPercent: number
  projRowMaxPercent: number
  projSpacingTolerance: number
  projYWindowPx: number
}

export const defaultStarDetectionSettings: StarDetectionSettings = {
  starColorR: 255,
  starColorG: 204,
  starColorB: 50,
  colorTolerance: 5,
  gridSizePercent: 0.0305,
  starSizePercent: 0.025,
  starDistancePercent: 0.03,
  pass1SamplePercent: 0.20,
  pass1MatchThreshold: 0.13,
  pass2SamplePercent: 0.50,
  pass2MatchThreshold: 0.44,
  pass3SamplePercent: 1,
  pass3MatchThreshold: 1,
  confirmThreshold: 0.92,
  projColMinPercent: 0.020,
  projColMaxPercent: 0.050,
  projColMinPixels: 2,
  projRowMinPercent: 0.018,
  projRowMaxPercent: 0.038,
  projSpacingTolerance: 0.20,
  projYWindowPx: 2,
}

// ─── Color helpers ─────────────────────────────────────────────────────────────

/**
 * Check if a color matches the star color within tolerance
 */
function isStarColor(r: number, g: number, b: number, settings: StarDetectionSettings): boolean {
  return (
    Math.abs(r - settings.starColorR) <= settings.colorTolerance &&
    Math.abs(g - settings.starColorG) <= settings.colorTolerance &&
    Math.abs(b - settings.starColorB) <= settings.colorTolerance
  )
}

// ─── Legacy grid sampling helpers ─────────────────────────────────────────────

/**
 * Sample a grid cell and count pixels matching the star color.
 * Returns the match count and the coordinates of the first matched pixel.
 */
function sampleGridCell(
  data: Uint8ClampedArray,
  canvas_width: number,
  canvas_height: number,
  start_x: number,
  start_y: number,
  gridSize: number,
  samplePercent: number,
  settings: StarDetectionSettings,
): { matchRatio: number; firstMatch: { x: number; y: number } } {
  let matchCount = 0
  let totalCount = 0
  const firstMatch = { x: -1, y: -1 }
  const step = 1 / samplePercent

  for (let cell_y = 0; cell_y < gridSize; cell_y += step) {
    for (let cell_x = 0; cell_x < gridSize; cell_x += step) {
      const canvas_x = Math.round(start_x + cell_x)
      const canvas_y = Math.round(start_y + cell_y)
      if (canvas_x >= canvas_width || canvas_y >= canvas_height) continue
      const idx = (canvas_y * canvas_width + canvas_x) * 4
      totalCount++
      if (isStarColor(data[idx] ?? 0, data[idx + 1] ?? 0, data[idx + 2] ?? 0, settings)) {
        matchCount++
        if (firstMatch.x === -1) {
          firstMatch.x = canvas_x
          firstMatch.y = canvas_y
        }
      }
    }
  }

  const matchRatio = matchCount / totalCount
  return { matchRatio, firstMatch }
}

/**
 * Check whether any pixel in a square region around (targetX, centerY) matches the star color.
 */
function hasStarInRegion(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  targetX: number,
  centerY: number,
  searchRadius: number,
  settings: StarDetectionSettings,
): boolean {
  for (let dy = -searchRadius; dy <= searchRadius; dy++) {
    for (let dx = -searchRadius; dx <= searchRadius; dx++) {
      const nx = targetX + dx
      const ny = centerY + dy
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue
      const idx = (ny * width + nx) * 4
      if (isStarColor(data[idx] ?? 0, data[idx + 1] ?? 0, data[idx + 2] ?? 0, settings)) return true
    }
  }
  return false
}

/**
 * Second-pass confirmation: sample a cell 2× larger in area centered on (cx, cy).
 * Scans every second pixel. Returns the cell center if the matched ratio exceeds
 * settings.confirmThreshold, else null.
 */
function confirmStarCell(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  cx: number,
  cy: number,
  gridSize: number,
  settings: StarDetectionSettings,
): { x: number; y: number } | null {
  // Side of a square whose area is 2× gridSize²:  s = gridSize * √2
  const half = Math.round((gridSize * Math.SQRT2) / 2)
  const x0 = Math.max(0, cx - half)
  const y0 = Math.max(0, cy - half)
  const x1 = Math.min(width - 1, cx + half)
  const y1 = Math.min(height - 1, cy + half)

  let total = 0
  let matched = 0

  for (let py = y0; py <= y1; py += 2) {
    for (let px = x0; px <= x1; px += 2) {
      const idx = (py * width + px) * 4
      total++
      if (isStarColor(data[idx] ?? 0, data[idx + 1] ?? 0, data[idx + 2] ?? 0, settings)) {
        matched++
      }
    }
  }

  if (total === 0 || matched / total <= settings.confirmThreshold) return null
  return { x: cx, y: cy }
}

// ─── Star center finder implementations ───────────────────────────────────────

/**
 * Legacy finder: scans outward from the first matched pixel (original behavior).
 */
export const legacyStarCenterFinder: StarCenterFinderFn = (ctx) =>
  findStarCenter(ctx.data, ctx.width, ctx.height, ctx.firstMatchX, ctx.firstMatchY, ctx.settings)

/**
 * Region finder: exhaustive row scan of a 3×3 cell region, picks the longest
 * continuous run of star-colored pixels and returns its center.
 */
export const regionStarCenterFinder: StarCenterFinderFn = (ctx) => {
  const { data, width, height, cellX, cellY, gridSize, settings } = ctx
  const rx0 = Math.max(0, cellX - gridSize)
  const ry0 = Math.max(0, cellY - gridSize)
  const rx1 = Math.min(width, cellX + 2 * gridSize)
  const ry1 = Math.min(height, cellY + 2 * gridSize)

  let bestLen = 0
  let bestCenter: { x: number; y: number } | null = null

  for (let py = ry0; py < ry1; py++) {
    let segStart = -1
    let segLen = 0
    for (let px = rx0; px < rx1; px++) {
      const idx = (py * width + px) * 4
      if (isStarColor(data[idx] ?? 0, data[idx + 1] ?? 0, data[idx + 2] ?? 0, settings)) {
        if (segStart === -1) segStart = px
        segLen++
      } else {
        if (segLen > bestLen) {
          bestLen = segLen
          bestCenter = { x: segStart + Math.floor(segLen / 2), y: py }
        }
        segStart = -1
        segLen = 0
      }
    }
    if (segLen > bestLen) {
      bestLen = segLen
      bestCenter = { x: (segStart ?? rx0) + Math.floor(segLen / 2), y: py }
    }
  }
  return bestLen >= 2 ? bestCenter : null
}

// ─── Legacy detector (multi-pass grid) ────────────────────────────────────────

/**
 * Internal helper: Detect stars in image data using grid-based sampling
 * Returns the star center coordinates and count if found
 */
function detectStarsInImageData(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  screenHeight: number,
  settings: StarDetectionSettings,
  centerFinder: StarCenterFinderFn = legacyStarCenterFinder,
): { center: { x: number; y: number }; count: number } | null {
  const gridSize = Math.max(1, Math.round(screenHeight * settings.gridSizePercent))

  for (let y = 0; y < height; y += gridSize) {
    for (let x = 0; x < width; x += gridSize) {
      // Pass 1
      const { matchRatio: p1Ratio } = sampleGridCell(data, width, height, x, y, gridSize, settings.pass1SamplePercent, settings)
      if (p1Ratio < settings.pass1MatchThreshold) continue

      // Pass 2 — 3×3 sub-cells
      const thirdGrid = Math.max(1, Math.floor(gridSize / 3))
      const p2Size = Math.max(1, Math.round(thirdGrid * 1.75))
      for (let sy = 0; sy < 3; sy++) {
        for (let sx = 0; sx < 3; sx++) {
          const subCX = x + sx * thirdGrid + Math.floor(thirdGrid / 2)
          const subCY = y + sy * thirdGrid + Math.floor(thirdGrid / 2)
          const subX = subCX - Math.floor(p2Size / 2)
          const subY = subCY - Math.floor(p2Size / 2)
          const { matchRatio: p2Ratio } = sampleGridCell(data, width, height, subX, subY, p2Size, settings.pass2SamplePercent, settings)
          if (p2Ratio < settings.pass2MatchThreshold) continue

          // Pass 3 — 3×3 sub-sub-cells
          const ninthGrid = Math.max(1, Math.floor(thirdGrid / 3))
          const p3Size = Math.max(1, Math.round(ninthGrid * 1.75))
          for (let ty = 0; ty < 3; ty++) {
            for (let tx = 0; tx < 3; tx++) {
              const subSubCX = x + sx * thirdGrid + tx * ninthGrid + Math.floor(ninthGrid / 2)
              const subSubCY = y + sy * thirdGrid + ty * ninthGrid + Math.floor(ninthGrid / 2)
              const subSubX = subSubCX - Math.floor(p3Size / 2)
              const subSubY = subSubCY - Math.floor(p3Size / 2)
              const { matchRatio: p3Ratio, firstMatch } = sampleGridCell(data, width, height, subSubX, subSubY, p3Size, settings.pass3SamplePercent, settings)
              if (p3Ratio < settings.pass3MatchThreshold) continue
              if (firstMatch.x === -1) continue

              if (!confirmStarCell(data, width, height, firstMatch.x, firstMatch.y, p3Size, settings)) continue

              const center = centerFinder({ data, width, height, cellX: subSubX, cellY: subSubY, gridSize: p3Size, firstMatchX: firstMatch.x, firstMatchY: firstMatch.y, settings })
              if (center) {
                return { center, count: countNeighborStars(data, width, height, center.x, center.y, screenHeight, settings) }
              }
            }
          }
        }
      }
    }
  }

  return null
}

/**
 * Create a StarDetectorFn that wraps the legacy multi-pass grid algorithm
 * with the given center finder strategy.
 */
export function makeLegacyDetector(centerFinder: StarCenterFinderFn): StarDetectorFn {
  return (data, width, height, screenHeight, settings) =>
    detectStarsInImageData(data, width, height, screenHeight, settings, centerFinder)
}

/** Default legacy detector using the legacy center finder */
export const legacyStarDetector: StarDetectorFn = makeLegacyDetector(legacyStarCenterFinder)

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
 */
function computeColumnHistogramOnly(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  settings: StarDetectionSettings,
): number[] {
  const colHist = new Array<number>(width).fill(0)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
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
 */
function findHistogramPeak(
  histogram: number[],
  validRange: Array<{ start: number; end: number }>,
): number {
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
): { center: { x: number; y: number }; count: number } | null {
  const colMinW = Math.round(screenHeight * settings.projColMinPercent)
  const colMaxW = Math.round(screenHeight * settings.projColMaxPercent)
  const rowMinH = Math.round(screenHeight * settings.projRowMinPercent)
  const rowMaxH = Math.round(screenHeight * settings.projRowMaxPercent)

  // Step 1: column histogram
  const colHist = computeColumnHistogramOnly(data, width, height, settings)

  // Steps 2–3: detect + filter column regions by width
  const colRegions = detectRegions(colHist, settings.projColMinPixels)
    .filter(r => {
      const w = r.end - r.start + 1
      return w >= colMinW && w <= colMaxW
    })
  if (colRegions.length === 0) return null

  // Step 4: row histogram constrained to passing column regions
  const rowHist = computeConstrainedRowHistogram(data, width, height, colRegions, settings)

  // Step 5: detect + filter row regions by height
  const rowRegions = detectRegions(rowHist, 1)
    .filter(r => {
      const h = r.end - r.start + 1
      return h >= rowMinH && h <= rowMaxH
    })
  if (rowRegions.length === 0) return null

  // Step 6: peak Y within filtered row regions
  const peakY = findHistogramPeak(rowHist, rowRegions)

  // Step 7: keep column regions with ≥1 star pixel at peakY ± projYWindowPx
  const yMin = Math.max(0, peakY - settings.projYWindowPx)
  const yMax = Math.min(height - 1, peakY + settings.projYWindowPx)
  const starRegions = colRegions.filter(r =>
    hasStarInBand(data, width, r.start, r.end, yMin, yMax, settings)
  )
  if (starRegions.length === 0) return null

  // Step 8: validate spacing between star regions, reject outliers
  const validatedRegions = validateStarSpacing(starRegions, screenHeight, settings)
  if (validatedRegions.length === 0) return null

  const count = Math.max(3, Math.min(5, validatedRegions.length))

  // Step 9: center of first (leftmost) region = X
  const first = validatedRegions[0]!
  const centerX = first.start + Math.floor((first.end - first.start) / 2)

  return { center: { x: centerX, y: peakY }, count }
}

/** Projection-based (column/row histogram) star detector */
export const projectionStarDetector: StarDetectorFn = projectionStarDetectorImpl

// ─── Public detection API ──────────────────────────────────────────────────────

/**
 * Detect stars in the full screen capture and return both the star detection result
 * and the rarity region bounds where the stars were found.
 *
 * This is used for automatic rarity region detection on the whole game window.
 *
 * @param canvas - The full game window capture canvas
 * @param screenHeight - Screen height to calculate absolute dimensions
 * @param settings - Optional detection settings (defaults to defaultStarDetectionSettings)
 * @param detector - Star detector strategy (defaults to projectionStarDetector)
 * @returns Object containing star detection result and region bounds, or null if not found
 */
export function detectStarsInFullScreen(
  canvas: HTMLCanvasElement,
  screenHeight: number,
  settings: StarDetectionSettings = defaultStarDetectionSettings,
  detector: StarDetectorFn = projectionStarDetector,
): { stars: StarDetectionResult; regionBounds: Rectangle } | null {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null

  const width = canvas.width
  const height = canvas.height
  const imageData = ctx.getImageData(0, 0, width, height)
  const data = imageData.data

  const detection = detector(data, width, height, screenHeight, settings)
  if (!detection) return null

  const starSize = Math.round(screenHeight * settings.starSizePercent)
  const starDistance = Math.round(screenHeight * settings.starDistancePercent)
  const numStars = Math.max(3, Math.min(5, detection.count)) as 3 | 4 | 5

  // Calculate the rarity region bounds based on the detected stars
  // The region should encompass all stars with some padding
  const regionWidth = (numStars - 1) * starDistance + starSize * 2
  const regionHeight = starSize * 2
  const regionX = Math.max(0, detection.center.x - starDistance * Math.floor((numStars - 1) / 2) - starSize / 2)
  const regionY = Math.max(0, detection.center.y - starSize / 2)

  const stars: StarDetectionResult = {
    count: numStars,
    position: { x: detection.center.x, y: detection.center.y },
    confidence: 0.9,
    bounds: {
      width: starSize,
      height: starSize,
    },
  }

  const regionBounds: Rectangle = {
    x: regionX,
    y: regionY,
    width: regionWidth,
    height: regionHeight,
  }

  return { stars, regionBounds }
}

// ─── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Find the center of a star starting from a matched pixel
 */
function findStarCenter(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  startX: number,
  startY: number,
  settings: StarDetectionSettings,
): { x: number; y: number } | null {
  // Sample neighboring pixels in straight lines
  const horizontalLine = getLongestColorLine(data, width, height, startX, startY, true, settings)
  const verticalLine = getLongestColorLine(data, width, height, startX, startY, false, settings)

  const longestLine = horizontalLine.length > verticalLine.length ? horizontalLine : verticalLine

  if (longestLine.length < 2) return null

  // Calculate center based on which line was longest
  if (horizontalLine.length > verticalLine.length) {
    // Horizontal line is longest - center is in the middle of the horizontal span
    return {
      x: Math.round(horizontalLine.start + horizontalLine.length / 2),
      y: startY,
    }
  } else {
    // Vertical line is longest - center is in the middle of the vertical span
    return {
      x: startX,
      y: Math.round(verticalLine.start + verticalLine.length / 2),
    }
  }
}

function getLongestColorLine(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
  horizontal: boolean,
  settings: StarDetectionSettings,
): { start: number; length: number } {
  let start = horizontal ? x : y
  const limit = horizontal ? width : height

  // Scan backwards
  while (start > 0) {
    const px = horizontal ? start - 1 : x
    const py = horizontal ? y : start - 1
    const idx = (py * width + px) * 4
    if (!isStarColor(data[idx] ?? 0, data[idx + 1] ?? 0, data[idx + 2] ?? 0, settings)) break
    start--
  }

  let end = horizontal ? x : y
  // Scan forwards
  while (end < limit - 1) {
    const px = horizontal ? end + 1 : x
    const py = horizontal ? y : end + 1
    const idx = (py * width + px) * 4
    if (!isStarColor(data[idx] ?? 0, data[idx + 1] ?? 0, data[idx + 2] ?? 0, settings)) break
    end++
  }

  return { start, length: end - start + 1 }
}

/**
 * Count neighboring stars to the left and right
 * Samples a small region around the expected star position for robustness
 */
function countNeighborStars(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  centerX: number,
  centerY: number,
  screenHeight: number,
  settings: StarDetectionSettings,
): number {
  const dist = Math.round(screenHeight * settings.starDistancePercent)
  const searchRadius = Math.max(3, Math.round(screenHeight * 0.005)) // 0.5% search radius
  let count = 1 // The one we found

  for (const dir of [1, -1]) {
    for (let i = 1; i < 5; i++) {
      const targetX = centerX + dir * i * dist
      if (targetX < 0 || targetX >= width) break
      if (hasStarInRegion(data, width, height, targetX, centerY, searchRadius, settings)) {
        count++
      } else {
        break
      }
    }
  }

  return Math.max(3, Math.min(5, count))
}

// ─── Debug exports ─────────────────────────────────────────────────────────────

export interface StarDetectionDebugBlock {
  x: number
  y: number
  size: number
  matchRatio: number
  isPass1Match: boolean
  isPass2Match: boolean
  isPass3Match: boolean
  isConfirmed: boolean
}

export interface StarDetectionDebugData {
  detectedCenter: { x: number; y: number } | null
  starCount: number | null
  /** legacy: grid cell size; projection: 0 */
  gridSize: number
  /** legacy: grid blocks; projection: [] */
  blocks: StarDetectionDebugBlock[]
  /** Star-colored pixel count per column (length = image width) */
  columnHistogram: number[]
  /** Star-colored pixel count per row (length = image height) */
  rowHistogram: number[]
  // Projection-specific (null when using legacy detector)
  projColumnRegions: Array<{ start: number; end: number }> | null
  projConstrainedRowHistogram: number[] | null
  projRowRegions: Array<{ start: number; end: number }> | null
  projPeakY: number | null
  /** Final star regions after step 7 confirmation + spacing validation */
  projStarRegions: Array<{ start: number; end: number }> | null
}

function computeColorProjections(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  settings: StarDetectionSettings,
): { columnHistogram: number[]; rowHistogram: number[] } {
  const columnHistogram = new Array<number>(width).fill(0)
  const rowHistogram = new Array<number>(height).fill(0)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4
      if (isStarColor(data[idx] ?? 0, data[idx + 1] ?? 0, data[idx + 2] ?? 0, settings)) {
        columnHistogram[x] = (columnHistogram[x] ?? 0) + 1
        rowHistogram[y] = (rowHistogram[y] ?? 0) + 1
      }
    }
  }
  return { columnHistogram, rowHistogram }
}

/**
 * Run the projection algorithm in debug mode, returning all intermediate state.
 */
function debugProjectionDetect(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  screenHeight: number,
  settings: StarDetectionSettings,
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

  const colHist = computeColumnHistogramOnly(data, width, height, settings)
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

  const count = Math.max(3, Math.min(5, validatedRegions.length))
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

/**
 * Run the star-detection algorithm in full debug mode.
 * Returns all grid blocks that contained at least one star-coloured pixel,
 * plus the first confirmed star-centre and neighbour count.
 * When using the projection detector, returns projection-specific debug data instead.
 */
export function debugDetectStars(
  canvas: HTMLCanvasElement,
  screenHeight: number,
  settings: StarDetectionSettings = defaultStarDetectionSettings,
  detector: StarDetectorFn = legacyStarDetector,
): StarDetectionDebugData {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  const emptyResult: StarDetectionDebugData = {
    gridSize: 0,
    blocks: [],
    detectedCenter: null,
    starCount: null,
    columnHistogram: [],
    rowHistogram: [],
    projColumnRegions: null,
    projConstrainedRowHistogram: null,
    projRowRegions: null,
    projPeakY: null,
    projStarRegions: null,
  }
  if (!ctx) return emptyResult

  const width = canvas.width
  const height = canvas.height
  const imageData = ctx.getImageData(0, 0, width, height)
  const data = imageData.data

  const { columnHistogram, rowHistogram } = computeColorProjections(data, width, height, settings)

  // ── Projection path ──────────────────────────────────────────────────────────
  if (detector === projectionStarDetector) {
    const proj = debugProjectionDetect(data, width, height, screenHeight, settings)
    return {
      gridSize: 0,
      blocks: [],
      detectedCenter: proj.result?.center ?? null,
      starCount: proj.result?.count ?? null,
      columnHistogram,
      rowHistogram,
      projColumnRegions: proj.colRegions,
      projConstrainedRowHistogram: proj.constrainedRowHist,
      projRowRegions: proj.rowRegions,
      projPeakY: proj.peakY,
      projStarRegions: proj.validatedRegions,
    }
  }

  // ── Legacy grid debug path ───────────────────────────────────────────────────
  const gridSize = Math.max(1, Math.round(screenHeight * settings.gridSizePercent))
  const blocks: StarDetectionDebugBlock[] = []

  // Run detector for the actual result
  const detectorResult = detector(data, width, height, screenHeight, settings)
  const detectedCenter = detectorResult?.center ?? null
  const starCount = detectorResult?.count ?? null

  for (let y = 0; y < height; y += gridSize) {
    for (let x = 0; x < width; x += gridSize) {
      // Pass 1
      const { matchRatio: p1Ratio } = sampleGridCell(
        data, width, height, x, y, gridSize, settings.pass1SamplePercent, settings,
      )
      if (p1Ratio < settings.pass1MatchThreshold) continue

      blocks.push({ x, y, size: gridSize, matchRatio: p1Ratio, isPass1Match: true, isPass2Match: false, isPass3Match: false, isConfirmed: false })

      // Pass 2 — subdivide into 9 sub-cells (3×3), each sampled at ~3× area around the same center
      const thirdGrid = Math.max(1, Math.floor(gridSize / 3))
      const p2Size = Math.max(1, Math.round(thirdGrid * 1.75))
      for (let sy = 0; sy < 3; sy++) {
        for (let sx = 0; sx < 3; sx++) {
          // Center of the logical sub-cell
          const subCX = x + sx * thirdGrid + Math.floor(thirdGrid / 2)
          const subCY = y + sy * thirdGrid + Math.floor(thirdGrid / 2)
          // Top-left of enlarged sampling region
          const subX = subCX - Math.floor(p2Size / 2)
          const subY = subCY - Math.floor(p2Size / 2)
          const { matchRatio: p2Ratio } = sampleGridCell(
            data, width, height, subX, subY, p2Size, settings.pass2SamplePercent, settings,
          )
          if (p2Ratio < settings.pass2MatchThreshold) continue

          blocks.push({ x: subX, y: subY, size: p2Size, matchRatio: p2Ratio, isPass1Match: false, isPass2Match: true, isPass3Match: false, isConfirmed: false })

          // Pass 3 — subdivide into 9 sub-sub-cells (3×3), each sampled at ~3× area around the same center
          const ninthGrid = Math.max(1, Math.floor(thirdGrid / 3))
          const p3Size = Math.max(1, Math.round(ninthGrid * 1.75))
          for (let ty = 0; ty < 3; ty++) {
            for (let tx = 0; tx < 3; tx++) {
              // Center of the logical sub-sub-cell (relative to original grid cell, not enlarged p2 region)
              const subSubCX = x + sx * thirdGrid + tx * ninthGrid + Math.floor(ninthGrid / 2)
              const subSubCY = y + sy * thirdGrid + ty * ninthGrid + Math.floor(ninthGrid / 2)
              // Top-left of enlarged sampling region
              const subSubX = subSubCX - Math.floor(p3Size / 2)
              const subSubY = subSubCY - Math.floor(p3Size / 2)
              const { matchRatio: p3Ratio, firstMatch: p3Match } = sampleGridCell(
                data, width, height, subSubX, subSubY, p3Size, settings.pass3SamplePercent, settings,
              )
              if (p3Ratio < settings.pass3MatchThreshold) continue

              const confirmed = p3Match.x !== -1
                ? confirmStarCell(data, width, height, p3Match.x, p3Match.y, p3Size, settings) !== null
                : false

              blocks.push({ x: subSubX, y: subSubY, size: p3Size, matchRatio: p3Ratio, isPass1Match: false, isPass2Match: false, isPass3Match: true, isConfirmed: confirmed })
            }
          }
        }
      }
    }
  }

  return {
    gridSize,
    blocks,
    detectedCenter,
    starCount,
    columnHistogram,
    rowHistogram,
    projColumnRegions: null,
    projConstrainedRowHistogram: null,
    projRowRegions: null,
    projPeakY: null,
    projStarRegions: null,
  }
}
