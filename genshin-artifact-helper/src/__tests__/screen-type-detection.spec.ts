/**
 * @vitest-environment node
 *
 * Stage 2: Screen type detection tests.
 * Uses known-good starCoords from ground truth — star detection is NOT re-run.
 * Each fixture gets its own test so failures are isolated.
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { readdirSync } from 'fs'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { createCanvas, loadImage, ImageData } from 'canvas'
import { detectScreenType } from '@/utils/screen-type-detection'
import type { ScreenType } from '@/types/ocr-regions'

// Polyfill browser APIs used internally (e.g. canvas element creation)
;(globalThis as any).document = {
  createElement: (type: string) => {
    if (type === 'canvas') return createCanvas(1, 1)
    throw new Error(`document.createElement('${type}') not available in test environment`)
  },
}
;(globalThis as any).ImageData = ImageData

interface FixtureExpected {
  screen?: string
  starCoords?: { x: number; y: number }
}

interface FixtureGroundTruth {
  expected: FixtureExpected
}

const fixturesDir = join(__dirname, 'fixtures', 'artifacts')

// Only files directly under artifacts/ (no subdirectory traversal)
let imageFiles: string[] = []
try {
  imageFiles = readdirSync(fixturesDir, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.png'))
    .map((e) => e.name)
    .sort()
} catch {
  // fixtures directory doesn't exist yet
}

describe('detectScreenType', () => {
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
      console.warn(
        '⚠️  No fixture images found at root level, skipping screen-type detection tests',
      )
    }
    expect(imageFiles.length).toBeGreaterThan(0)
  })

  it.each(imageFiles)('classifies screen type in %s', async (imageFile) => {
    // Load ground truth
    const jsonPath = join(fixturesDir, imageFile.replace('.png', '.json'))
    let content = await readFile(jsonPath, 'utf-8')
    if (content.charCodeAt(0) === 0xfeff) content = content.slice(1)
    const groundTruth: FixtureGroundTruth = JSON.parse(content)
    const expected = groundTruth.expected

    if (!expected.screen || !expected.starCoords) {
      console.warn(`  ⚠️  ${imageFile}: missing screen or starCoords in ground truth, skipping`)
      return
    }

    // Load image into canvas
    const img = await loadImage(join(fixturesDir, imageFile))
    const canvas = createCanvas(img.width, img.height)
    canvas.getContext('2d').drawImage(img as any, 0, 0)
    const canvasEl = canvas as unknown as HTMLCanvasElement

    const detected = detectScreenType(
      canvasEl,
      expected.starCoords,
      canvas.width,
      canvas.height,
    )

    expect(
      detected,
      `${imageFile}: expected screen="${expected.screen}", got="${detected}" ` +
        `(starCoords=${JSON.stringify(expected.starCoords)}, ${canvas.width}×${canvas.height})`,
    ).toBe(expected.screen as ScreenType)
  })
})
