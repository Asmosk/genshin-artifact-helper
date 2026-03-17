/**
 * Star detection utilities — barrel re-exporting all public symbols.
 */

import type { StarDetectionResult, Rectangle } from '@/types/ocr-regions'
import {
  defaultStarDetectionSettings,
  type StarDetectionSettings,
  type StarDetectorFn,
} from '@/utils/star-detection-types'
import { projectionStarDetector } from '@/utils/star-detection-projection'

export type {
  StarCenterFinderContext,
  StarCenterFinderFn,
  StarDetectorFn,
  StarDetectionSettings,
  StarDetectionDebugBlock,
  StarDetectionDebugData,
} from '@/utils/star-detection-types'
export { defaultStarDetectionSettings } from '@/utils/star-detection-types'

export {
  legacyStarCenterFinder,
  regionStarCenterFinder,
  makeLegacyDetector,
  legacyStarDetector,
} from '@/utils/star-detection-legacy'

export { projectionStarDetector } from '@/utils/star-detection-projection'

export { debugDetectStars } from '@/utils/star-detection-debug'

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
  const numStars = Math.max(1, Math.min(5, detection.count)) as 1 | 2 | 3 | 4 | 5

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
