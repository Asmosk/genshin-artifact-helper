/**
 * @vitest-environment node
 *
 * Unit tests for screen-type auto-detection.
 * Uses fixture images at the root of fixtures/artifacts/ (no subdirectory traversal).
 * Known starCoords are read from ground-truth JSONs — star detection is NOT re-run.
 */

import { describe, it, expect } from 'vitest'
import { readdir, readFile } from 'fs/promises'
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

describe('detectScreenType', () => {
  const fixturesDir = join(__dirname, 'fixtures', 'artifacts')

  it('should correctly classify all root-level fixture images', async () => {
    // Only files directly under artifacts/ (no subdirectory traversal)
    const allEntries = await readdir(fixturesDir, { withFileTypes: true })
    const imageFiles = allEntries
      .filter((e) => e.isFile() && e.name.endsWith('.png'))
      .map((e) => e.name)

    if (imageFiles.length === 0) {
      console.warn('⚠️  No fixture images found at root level, skipping screen-type detection tests')
      return
    }

    console.log(`Testing screen-type detection on ${imageFiles.length} fixture(s)...`)

    for (const imageFile of imageFiles) {
      // Load ground truth
      const jsonPath = join(fixturesDir, imageFile.replace('.png', '.json'))
      let content = await readFile(jsonPath, 'utf-8')
      if (content.charCodeAt(0) === 0xfeff) content = content.slice(1)
      const groundTruth: FixtureGroundTruth = JSON.parse(content)
      const expected = groundTruth.expected

      if (!expected.screen || !expected.starCoords) {
        console.warn(`  ⚠️  ${imageFile}: missing screen or starCoords in ground truth, skipping`)
        continue
      }

      // Load image into canvas
      const img = await loadImage(join(fixturesDir, imageFile))
      const canvas = createCanvas(img.width, img.height)
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img as any, 0, 0)
      const canvasEl = canvas as unknown as HTMLCanvasElement

      const detected = detectScreenType(
        canvasEl,
        expected.starCoords,
        canvas.width,
        canvas.height,
      )

      const expectedScreen = expected.screen as ScreenType

      if (detected !== expectedScreen) {
        console.warn(
          `  ⚠️  ${imageFile}: expected="${expectedScreen}", got="${detected}" ` +
            `(starCoords=${JSON.stringify(expected.starCoords)}, width=${canvas.width}, height=${canvas.height})`,
        )
      }

      expect(detected, `${imageFile}: screen type mismatch`).toBe(expectedScreen)
    }
  })
})
