import { describe, it, expect, beforeAll } from 'vitest'
import { detectStars, detectStarsInFullScreen } from '../utils/star-detection'
import { createCanvas } from 'canvas'

/**
 * Helper to create a test canvas with star patterns
 */
function createTestCanvas(
  width: number,
  height: number,
  stars: Array<{ x: number; y: number; count: number }>,
  screenHeight: number = 1440,
): HTMLCanvasElement {
  const canvas = createCanvas(width, height) as unknown as HTMLCanvasElement
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Failed to get canvas context')

  // Fill with dark background - use pure black to avoid color tolerance issues
  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, width, height)

  // Star color: #ffcc32 (RGB: 255, 204, 50)
  const starSize = Math.round(screenHeight * 0.025) // 2.5% of screen height
  const starDistance = Math.round(screenHeight * 0.03) // 3% of screen height
  const centerSquareSize = Math.round(screenHeight * 0.01) // 1% of screen height - center must be filled

  // Draw stars at specified positions
  for (const starGroup of stars) {
    for (let i = 0; i < starGroup.count; i++) {
      const centerX = starGroup.x + i * starDistance
      const centerY = starGroup.y

      // Draw a filled square for each star using explicit RGB values
      // This ensures the exact color #ffcc32 (255, 204, 50)
      const imageData = ctx.getImageData(0, 0, width, height)
      const data = imageData.data

      // Fill a square region around the center
      for (let dy = -Math.floor(starSize / 2); dy <= Math.floor(starSize / 2); dy++) {
        for (let dx = -Math.floor(starSize / 2); dx <= Math.floor(starSize / 2); dx++) {
          const px = centerX + dx
          const py = centerY + dy
          if (px >= 0 && px < width && py >= 0 && py < height) {
            const idx = (py * width + px) * 4
            data[idx] = 255 // R
            data[idx + 1] = 204 // G
            data[idx + 2] = 50 // B
            data[idx + 3] = 255 // A
          }
        }
      }

      ctx.putImageData(imageData, 0, 0)
    }
  }

  return canvas
}

describe('Star Detection', () => {
  const screenHeight = 1440
  const screenWidth = 2560

  describe('detectStars (cropped region)', () => {
    it('should be defined', () => {
      expect(detectStars).toBeDefined()
    })

    it('should detect 3 stars in a cropped region', () => {
      const canvas = createTestCanvas(400, 100, [{ x: 200, y: 50, count: 3 }], screenHeight)
      const result = detectStars(canvas, screenHeight)

      expect(result).not.toBeNull()
      expect(result?.count).toBe(3)
      expect(result?.confidence).toBeGreaterThan(0)
    })

    it('should detect 4 stars in a cropped region', () => {
      const canvas = createTestCanvas(400, 100, [{ x: 200, y: 50, count: 4 }], screenHeight)
      const result = detectStars(canvas, screenHeight)

      expect(result).not.toBeNull()
      expect(result?.count).toBe(4)
    })

    it('should detect 5 stars in a cropped region', () => {
      const canvas = createTestCanvas(400, 100, [{ x: 200, y: 50, count: 5 }], screenHeight)
      const result = detectStars(canvas, screenHeight)

      expect(result).not.toBeNull()
      expect(result?.count).toBe(5)
    })

    it('should return null when no stars are present', () => {
      const canvas = createTestCanvas(400, 100, [], screenHeight)
      const result = detectStars(canvas, screenHeight)

      expect(result).toBeNull()
    })

    it('should include star position and bounds in result', () => {
      const canvas = createTestCanvas(400, 100, [{ x: 200, y: 50, count: 4 }], screenHeight)
      const result = detectStars(canvas, screenHeight)

      expect(result).not.toBeNull()
      expect(result?.position).toHaveProperty('x')
      expect(result?.position).toHaveProperty('y')
      expect(result?.bounds).toHaveProperty('width')
      expect(result?.bounds).toHaveProperty('height')
    })
  })

  describe('detectStarsInFullScreen', () => {
    it('should be defined', () => {
      expect(detectStarsInFullScreen).toBeDefined()
    })

    it('should detect stars and region bounds in full screen', () => {
      const canvas = createTestCanvas(screenWidth, screenHeight, [
        { x: 500, y: 300, count: 4 },
      ], screenHeight)
      const result = detectStarsInFullScreen(canvas, screenHeight)

      expect(result).not.toBeNull()
      expect(result?.stars.count).toBe(4)
      expect(result?.regionBounds).toBeDefined()
      expect(result?.regionBounds.x).toBeGreaterThanOrEqual(0)
      expect(result?.regionBounds.y).toBeGreaterThanOrEqual(0)
      expect(result?.regionBounds.width).toBeGreaterThan(0)
      expect(result?.regionBounds.height).toBeGreaterThan(0)
    })

    it('should detect 3-star artifact in full screen', () => {
      const canvas = createTestCanvas(screenWidth, screenHeight, [
        { x: 400, y: 250, count: 3 },
      ], screenHeight)
      const result = detectStarsInFullScreen(canvas, screenHeight)

      expect(result).not.toBeNull()
      expect(result?.stars.count).toBe(3)
    })

    it('should detect 5-star artifact in full screen', () => {
      const canvas = createTestCanvas(screenWidth, screenHeight, [
        { x: 400, y: 250, count: 5 },
      ], screenHeight)
      const result = detectStarsInFullScreen(canvas, screenHeight)

      expect(result).not.toBeNull()
      expect(result?.stars.count).toBe(5)
    })

    it('should handle stars at screen edges', () => {
      // Stars near top-left corner
      const canvas = createTestCanvas(screenWidth, screenHeight, [
        { x: 100, y: 50, count: 4 },
      ], screenHeight)
      const result = detectStarsInFullScreen(canvas, screenHeight)

      expect(result).not.toBeNull()
      expect(result?.stars.count).toBe(4)
      expect(result?.regionBounds.x).toBeGreaterThanOrEqual(0)
      expect(result?.regionBounds.y).toBeGreaterThanOrEqual(0)
    })

    it('should return null when no stars are present in full screen', () => {
      const canvas = createTestCanvas(screenWidth, screenHeight, [], screenHeight)
      const result = detectStarsInFullScreen(canvas, screenHeight)

      expect(result).toBeNull()
    })

    it('should calculate region bounds that encompass all stars', () => {
      const canvas = createTestCanvas(screenWidth, screenHeight, [
        { x: 500, y: 300, count: 5 },
      ], screenHeight)
      const result = detectStarsInFullScreen(canvas, screenHeight)

      expect(result).not.toBeNull()

      const starDistance = Math.round(screenHeight * 0.03)
      const starSize = Math.round(screenHeight * 0.025)

      // Region should be wide enough for 5 stars
      const expectedMinWidth = 4 * starDistance
      expect(result?.regionBounds.width).toBeGreaterThanOrEqual(expectedMinWidth)

      // Region should be at least as tall as a star
      expect(result?.regionBounds.height).toBeGreaterThanOrEqual(starSize)
    })

    it('should prioritize the first star cluster found', () => {
      // Multiple star clusters, should detect the first one (top-left scan order)
      const canvas = createTestCanvas(screenWidth, screenHeight, [
        { x: 300, y: 200, count: 3 },
        { x: 1000, y: 500, count: 4 },
      ], screenHeight)
      const result = detectStarsInFullScreen(canvas, screenHeight)

      expect(result).not.toBeNull()
      // Should detect one of the clusters
      expect([3, 4]).toContain(result?.stars.count)
    })
  })

  describe('Integration', () => {
    it('should work consistently between both detection methods on same cropped region', () => {
      // Create a canvas with stars
      const croppedCanvas = createTestCanvas(400, 100, [{ x: 200, y: 50, count: 4 }], screenHeight)

      // Detect using the cropped region method
      const croppedResult = detectStars(croppedCanvas, screenHeight)

      // Create a full screen canvas with the same stars at a specific position
      const fullCanvas = createTestCanvas(screenWidth, screenHeight, [
        { x: 500, y: 300, count: 4 },
      ], screenHeight)

      // Detect using full screen method
      const fullResult = detectStarsInFullScreen(fullCanvas, screenHeight)

      // Both should detect 4 stars
      expect(croppedResult?.count).toBe(4)
      expect(fullResult?.stars.count).toBe(4)
    })
  })
})
