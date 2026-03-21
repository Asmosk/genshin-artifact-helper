/**
 * @vitest-environment node
 *
 * Stage 2: Star detection tests.
 * When the fixture has a known `screen` type ('character' | 'inventory' | 'rewards'),
 * uses detectStarsInBounds with the layout's starSearchBounds — matching the production
 * pipeline that performs constrained detection after screen type is known.
 * Falls back to detectStarsInFullScreen for fixtures without a screen type.
 *
 * Ground truth fields used:
 *   expected.starCoords — expected { x, y } position of the first (leftmost) star
 *   expected.rarity     — expected star count
 *   expected.screen     — screen type used to select star search bounds
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { readdirSync } from 'fs'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { createCanvas, loadImage } from 'canvas'
import { detectStarsInFullScreen, detectStarsInBounds } from '@/utils/star-detection'
import { getRegionTemplate } from '@/utils/ocr-region-templates'
import type { ArtifactScreenType } from '@/types/ocr-regions'

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
  screen?: string
}

interface FixtureGroundTruth {
  expected: FixtureExpected
}

const ARTIFACT_SCREEN_TYPES = new Set<string>(['character', 'inventory', 'rewards'])

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

    // Use constrained detection when screen type is known, full-screen otherwise
    const screenType = expected.screen
    const detection =
      screenType !== undefined && ARTIFACT_SCREEN_TYPES.has(screenType)
        ? detectStarsInBounds(htmlCanvas, getRegionTemplate(screenType as ArtifactScreenType).starSearchBounds, canvas.height)
        : detectStarsInFullScreen(htmlCanvas, canvas.height)

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
