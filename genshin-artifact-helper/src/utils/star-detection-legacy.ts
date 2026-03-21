/**
 * Legacy multi-pass grid sampling algorithm for star detection
 */

import {
  isStarColor,
  type StarCenterFinderContext,
  type StarCenterFinderFn,
  type StarDetectorFn,
  type StarDetectionSettings,
  type StarDetectionDebugBlock,
} from '@/utils/star-detection-types'

// ─── Grid sampling helpers ─────────────────────────────────────────────────────

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

  return Math.max(1, Math.min(5, count))
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
  // bounds is accepted for interface compatibility but ignored — the legacy algorithm
  // does not support constrained scanning (use projectionStarDetector for that)
  return (data, width, height, screenHeight, settings, _bounds?) =>
    detectStarsInImageData(data, width, height, screenHeight, settings, centerFinder)
}

/** Default legacy detector using the legacy center finder */
export const legacyStarDetector: StarDetectorFn = makeLegacyDetector(legacyStarCenterFinder)

// ─── Legacy debug helper ───────────────────────────────────────────────────────

/**
 * Run the legacy grid algorithm in debug mode.
 * Traverses all grid blocks and collects debug info, plus runs the detector for the final result.
 */
export function debugLegacyDetect(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  screenHeight: number,
  settings: StarDetectionSettings,
  detector: StarDetectorFn,
): { gridSize: number; blocks: StarDetectionDebugBlock[]; detectedCenter: { x: number; y: number } | null; starCount: number | null } {
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

  return { gridSize, blocks, detectedCenter, starCount }
}
