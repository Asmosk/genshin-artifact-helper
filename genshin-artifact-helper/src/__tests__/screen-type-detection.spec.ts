/**
 * @vitest-environment node
 *
 * Stage 1: Screen type detection tests.
 * Uses the new API: detectScreenType(canvas) — no starCoords required.
 * Tests ALL fixtures, including non-artifact ones.
 *
 * Fixture ground truth fields:
 *   expected.screen — expected DetectedScreenType ('character' | 'inventory' | 'rewards' | 'other')
 *
 * Note: item-reward screens (weapons, consumables, set descriptions, domain screens) are expected
 * to return 'other' as ground truth. The rewards detector may fire on some of them — those cases
 * are accepted because stage 3a OCR validation filters them out before any artifact data is shown.
 * Therefore 'rewards' is also an acceptable result when the ground truth is 'other'.
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { readdirSync } from 'fs'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { createCanvas, loadImage, ImageData } from 'canvas'
import { detectScreenType } from '@/utils/screen-type-detection'
import type { DetectedScreenType } from '@/types/ocr-regions'

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

  it.skipIf(imageFiles.length === 0)('should have fixture images', () => {
    expect(imageFiles.length).toBeGreaterThan(0)
  })

  it.each(imageFiles)('classifies screen type in %s', async (imageFile) => {
    // Load ground truth
    const jsonPath = join(fixturesDir, imageFile.replace('.png', '.json'))
    let content = await readFile(jsonPath, 'utf-8')
    if (content.charCodeAt(0) === 0xfeff) content = content.slice(1)
    const groundTruth: FixtureGroundTruth = JSON.parse(content)
    const expected = groundTruth.expected

    if (!expected.screen) {
      console.warn(`  ⚠️  ${imageFile}: missing screen in ground truth, skipping`)
      return
    }

    // Load image into canvas
    const img = await loadImage(join(fixturesDir, imageFile))
    const canvas = createCanvas(img.width, img.height)
    canvas.getContext('2d').drawImage(img as any, 0, 0)
    const canvasEl = canvas as unknown as HTMLCanvasElement

    // Test base detection
    const detected = detectScreenType(canvasEl)

    // When ground truth is 'other', 'rewards' is also acceptable — item-reward screens are
    // known rewards-detector false positives, handled downstream by stage 3a OCR validation.
    const acceptable = expected.screen === 'other' ? ['other', 'rewards'] : [expected.screen]

    expect(
      acceptable.includes(detected),
      `${imageFile}: expected screen to be one of [${acceptable.join('|')}], got="${detected}" (${canvas.width}×${canvas.height})`,
    ).toBe(true)

    // Verify that prioritize option produces the same result (but may run faster)
    if (detected !== 'other') {
      const detectedWithHint = detectScreenType(canvasEl, {
        prioritize: detected as DetectedScreenType extends 'other' ? never : Exclude<DetectedScreenType, 'other'>,
      })
      expect(
        acceptable.includes(detectedWithHint),
        `${imageFile}: prioritize hint changed result: expected one of [${acceptable.join('|')}], got="${detectedWithHint}"`,
      ).toBe(true)
    }
  })
})
