/**
 * @vitest-environment node
 *
 * Stage 1: Star detection tests.
 * Runs detectStarsInFullScreen against every fixture and asserts:
 *   - Detected position is within ±10px of expected.starCoords
 *   - Detected star count matches expected.rarity
 *
 * Uses known-good ground truth — does not depend on any other pipeline step.
 * Note: some recently-added edge-case fixtures may fail while star detection is being improved.
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { readdirSync } from 'fs'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { createCanvas, loadImage } from 'canvas'
import { detectStarsInFullScreen } from '@/utils/star-detection'

// Polyfill browser APIs used by star detection internals
;(globalThis as any).document = {
  createElement: (type: string) => {
    if (type === 'canvas') return createCanvas(1, 1)
    throw new Error(`document.createElement('${type}') not available in test environment`)
  },
}

interface FixtureExpected {
  starCoords?: { x: number; y: number }
  rarity?: number
}

interface FixtureGroundTruth {
  expected: FixtureExpected
}

const fixturesDir = join(__dirname, 'fixtures', 'artifacts')

let imageFiles: string[] = []
try {
  imageFiles = readdirSync(fixturesDir)
    .filter((f) => f.endsWith('.png'))
    .sort()
} catch {
  // fixtures directory doesn't exist yet
}

describe('Star Detection', () => {
  beforeAll(async () => {
    // Warm up canvas native bindings so they don't skew the first fixture's timing
    const warmup = createCanvas(1, 1)
    warmup.getContext('2d')
    if (imageFiles.length > 0) {
      await loadImage(join(fixturesDir, imageFiles[0]!)).catch(() => {})
    }
  })

  it('should have fixture images', () => {
    if (imageFiles.length === 0) {
      console.warn('⚠️  No fixture images found. Add artifact screenshots to:', fixturesDir)
    }
    expect(imageFiles.length).toBeGreaterThan(0)
  })

  it.each(imageFiles)('detects stars in %s', async (imageFile) => {
    // Load ground truth
    const jsonPath = join(fixturesDir, imageFile.replace('.png', '.json'))
    let content = await readFile(jsonPath, 'utf-8')
    if (content.charCodeAt(0) === 0xfeff) content = content.slice(1)
    const groundTruth: FixtureGroundTruth = JSON.parse(content)
    const expected = groundTruth.expected

    if (!expected.starCoords) {
      console.warn(`  ⚠️  ${imageFile}: no starCoords in ground truth, skipping`)
      return
    }

    // Load image into canvas
    const img = await loadImage(join(fixturesDir, imageFile))
    const canvas = createCanvas(img.width, img.height)
    canvas.getContext('2d').drawImage(img as any, 0, 0)
    const htmlCanvas = canvas as unknown as HTMLCanvasElement

    const detection = detectStarsInFullScreen(htmlCanvas, canvas.height)

    expect(
      detection,
      `${imageFile}: star detection returned null (no stars found)`,
    ).not.toBeNull()

    if (!detection) return

    const { position, count } = detection.stars
    const TOLERANCE = 10

    const dx = Math.abs(position.x - expected.starCoords.x)
    const dy = Math.abs(position.y - expected.starCoords.y)

    expect(
      dx <= TOLERANCE && dy <= TOLERANCE,
      `${imageFile}: star position expected=(${expected.starCoords.x}, ${expected.starCoords.y}), got=(${position.x}, ${position.y}) — dx=${dx}, dy=${dy}`,
    ).toBe(true)

    if (expected.rarity !== undefined) {
      expect(count, `${imageFile}: star count expected=${expected.rarity}, got=${count}`).toBe(
        expected.rarity,
      )
    }
  })
})
