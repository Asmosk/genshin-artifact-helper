/**
 * Star detection utilities for Genshin Impact artifacts
 * Implements the grid-based pixel sampling and center confirmation algorithm
 */

import type { StarDetectionResult, Rectangle } from '@/types/ocr-regions'

/**
 * Constants for star detection based on the provided plan
 * All percentages are relative to screen height
 */
const STAR_COLOR = { r: 0xff, g: 0xcc, b: 0x32 } // #ffcc32
const COLOR_TOLERANCE = 30 // RGB distance tolerance

const GRID_SIZE_PERCENT = 0.0125 // 1.25% of screen height
const STAR_SIZE_PERCENT = 0.025 // 2.5% of screen height
const STAR_CENTER_SQUARE_PERCENT = 0.01 // 1% of screen height
const STAR_DISTANCE_PERCENT = 0.03 // 3% of screen height

/**
 * Check if a color matches the star color within tolerance
 */
function isStarColor(r: number, g: number, b: number): boolean {
  return (
    Math.abs(r - STAR_COLOR.r) <= COLOR_TOLERANCE &&
    Math.abs(g - STAR_COLOR.g) <= COLOR_TOLERANCE &&
    Math.abs(b - STAR_COLOR.b) <= COLOR_TOLERANCE
  )
}

/**
 * Internal helper: Detect stars in image data using grid-based sampling
 * Returns the star center coordinates and count if found
 */
function detectStarsInImageData(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  screenHeight: number,
): { center: { x: number; y: number }; count: number } | null {
  const gridSize = Math.max(1, Math.round(screenHeight * GRID_SIZE_PERCENT))

  // 1. Grid-based sampling
  for (let y = 0; y < height; y += gridSize) {
    for (let x = 0; x < width; x += gridSize) {
      // 2. Sample multiple pixels from each grid cell
      let matchCount = 0
      const firstMatch = { x: -1, y: -1 }
      const step = Math.max(1, Math.floor(gridSize / 3))

      for (let sy = 0; sy < gridSize; sy += step) {
        for (let sx = 0; sx < gridSize; sx += step) {
          const px = x + sx
          const py = y + sy
          if (px >= width || py >= height) continue

          const idx = (py * width + px) * 4
          if (isStarColor(data[idx] ?? 0, data[idx + 1] ?? 0, data[idx + 2] ?? 0)) {
            matchCount++
            if (firstMatch.x === -1) {
              firstMatch.x = px
              firstMatch.y = py
            }
          }
        }
      }

      // 3. If enough pixels match, consider this a possible match
      if (matchCount >= 4) {
        // 4. Confirm match by finding star center
        const center = findStarCenter(data, width, height, firstMatch.x, firstMatch.y)
        if (center) {
          // 5. Star found, count neighbors
          const starCount = countNeighborStars(data, width, height, center.x, center.y, screenHeight)
          return { center, count: starCount }
        }
      }
    }
  }

  return null
}

/**
 * Detect stars in the full screen capture and return both the star detection result
 * and the rarity region bounds where the stars were found.
 *
 * This is used for automatic rarity region detection on the whole game window.
 *
 * @param canvas - The full game window capture canvas
 * @param screenHeight - Screen height to calculate absolute dimensions
 * @returns Object containing star detection result and region bounds, or null if not found
 */
export function detectStarsInFullScreen(
  canvas: HTMLCanvasElement,
  screenHeight: number,
): { stars: StarDetectionResult; regionBounds: Rectangle } | null {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null

  const width = canvas.width
  const height = canvas.height
  const imageData = ctx.getImageData(0, 0, width, height)
  const data = imageData.data

  const detection = detectStarsInImageData(data, width, height, screenHeight)
  if (!detection) return null

  const starSize = Math.round(screenHeight * STAR_SIZE_PERCENT)
  const starDistance = Math.round(screenHeight * STAR_DISTANCE_PERCENT)
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

/**
 * Detect stars in a given canvas (usually the 'rarity' region)
 * @param canvas - The cropped rarity region canvas
 * @param screenHeight - Original screen height to calculate absolute dimensions
 */
export function detectStars(
  canvas: HTMLCanvasElement,
  screenHeight: number,
): StarDetectionResult | null {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null

  const width = canvas.width
  const height = canvas.height
  const imageData = ctx.getImageData(0, 0, width, height)
  const data = imageData.data

  const detection = detectStarsInImageData(data, width, height, screenHeight)
  if (!detection) return null

  return {
    count: Math.max(3, Math.min(5, detection.count)) as 3 | 4 | 5,
    position: { x: detection.center.x, y: detection.center.y },
    confidence: 0.9, // Heuristic confidence
    bounds: {
      width: Math.round(screenHeight * STAR_SIZE_PERCENT),
      height: Math.round(screenHeight * STAR_SIZE_PERCENT),
    },
  }
}

/**
 * Find the center of a star starting from a matched pixel
 */
function findStarCenter(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  startX: number,
  startY: number,
): { x: number; y: number } | null {
  // Sample neighboring pixels in straight lines
  const horizontalLine = getLongestColorLine(data, width, height, startX, startY, true)
  const verticalLine = getLongestColorLine(data, width, height, startX, startY, false)

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
): { start: number; length: number } {
  let start = horizontal ? x : y
  const limit = horizontal ? width : height

  // Scan backwards
  while (start > 0) {
    const px = horizontal ? start - 1 : x
    const py = horizontal ? y : start - 1
    const idx = (py * width + px) * 4
    if (!isStarColor(data[idx] ?? 0, data[idx + 1] ?? 0, data[idx + 2] ?? 0)) break
    start--
  }

  let end = horizontal ? x : y
  // Scan forwards
  while (end < limit - 1) {
    const px = horizontal ? end + 1 : x
    const py = horizontal ? y : end + 1
    const idx = (py * width + px) * 4
    if (!isStarColor(data[idx] ?? 0, data[idx + 1] ?? 0, data[idx + 2] ?? 0)) break
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
): number {
  const dist = Math.round(screenHeight * STAR_DISTANCE_PERCENT)
  const searchRadius = Math.max(3, Math.round(screenHeight * 0.005)) // 0.5% search radius
  let count = 1 // The one we found

  // Check right
  for (let i = 1; i < 5; i++) {
    const targetX = centerX + i * dist
    if (targetX >= width) break

    // Sample multiple pixels around the expected position
    let foundStar = false
    for (let dy = -searchRadius; dy <= searchRadius && !foundStar; dy++) {
      for (let dx = -searchRadius; dx <= searchRadius && !foundStar; dx++) {
        const nx = targetX + dx
        const ny = centerY + dy
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue

        const idx = (ny * width + nx) * 4
        if (isStarColor(data[idx] ?? 0, data[idx + 1] ?? 0, data[idx + 2] ?? 0)) {
          foundStar = true
        }
      }
    }

    if (foundStar) {
      count++
    } else {
      break
    }
  }

  // Check left
  for (let i = 1; i < 5; i++) {
    const targetX = centerX - i * dist
    if (targetX < 0) break

    // Sample multiple pixels around the expected position
    let foundStar = false
    for (let dy = -searchRadius; dy <= searchRadius && !foundStar; dy++) {
      for (let dx = -searchRadius; dx <= searchRadius && !foundStar; dx++) {
        const nx = targetX + dx
        const ny = centerY + dy
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue

        const idx = (ny * width + nx) * 4
        if (isStarColor(data[idx] ?? 0, data[idx + 1] ?? 0, data[idx + 2] ?? 0)) {
          foundStar = true
        }
      }
    }

    if (foundStar) {
      count++
    } else {
      break
    }
  }

  return Math.max(3, Math.min(5, count))
}
