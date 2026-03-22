/**
 * @vitest-environment node
 *
 * Unit tests for frame-diff.ts — hasFrameChanged()
 *
 * Uses real fixture images to produce ImageData-like objects so the pixel
 * comparisons are grounded in actual Genshin screenshot content rather than
 * synthetic data.
 */

import { describe, it, expect } from 'vitest'
import { readdirSync } from 'fs'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { createCanvas, loadImage } from 'canvas'
import { hasFrameChanged } from '@/utils/frame-diff'
import type { ImageDataLike } from '@/utils/frame-diff'
import type { Rectangle } from '@/types/ocr-regions'

const fixturesDir = join(__dirname, 'fixtures', 'artifacts')

let pngFiles: string[] = []
try {
  pngFiles = readdirSync(fixturesDir)
    .filter((f) => f.endsWith('.png'))
    .sort()
} catch {
  // fixtures directory missing
}

/**
 * Load a PNG fixture into an ImageData-like object using the `canvas` package.
 */
async function loadImageData(filename: string): Promise<ImageDataLike> {
  const img = await loadImage(join(fixturesDir, filename))
  const canvas = createCanvas(img.width, img.height)
  const ctx = canvas.getContext('2d')
  ctx.drawImage(img, 0, 0)
  const raw = ctx.getImageData(0, 0, img.width, img.height)
  return { data: raw.data as unknown as number[], width: raw.width, height: raw.height }
}

/** Regions covering the known artifact panel areas across all three screen layouts */
const ARTIFACT_PANEL_REGIONS: Rectangle[] = [
  // inventory/character: right side panel
  { x: 2300, y: 200, width: 1100, height: 1000 },
  // rewards: center panel
  { x: 1300, y: 200, width: 700, height: 1000 },
]

describe('hasFrameChanged', () => {
  it('returns true when previous is null (first frame)', () => {
    const data = { data: new Array(4).fill(0), width: 1, height: 1 }
    expect(hasFrameChanged(data, null, [{ x: 0, y: 0, width: 1, height: 1 }])).toBe(true)
  })

  it('returns false when comparing identical data', () => {
    const pixels = Array.from({ length: 3440 * 1440 * 4 }, (_, i) => (i % 256))
    const data: ImageDataLike = { data: pixels, width: 3440, height: 1440 }
    expect(hasFrameChanged(data, data, ARTIFACT_PANEL_REGIONS)).toBe(false)
  })

  it('returns true when all sampled pixels differ', () => {
    const size = 100 * 100 * 4
    const current: ImageDataLike = { data: new Array(size).fill(255), width: 100, height: 100 }
    const previous: ImageDataLike = { data: new Array(size).fill(0), width: 100, height: 100 }
    const region: Rectangle = { x: 0, y: 0, width: 100, height: 100 }
    expect(hasFrameChanged(current, previous, [region])).toBe(true)
  })

  it('returns false when regions fall outside image bounds', () => {
    const data: ImageDataLike = { data: new Array(4).fill(128), width: 1, height: 1 }
    const outOfBounds: Rectangle = { x: 100, y: 100, width: 50, height: 50 }
    expect(hasFrameChanged(data, data, [outOfBounds])).toBe(false)
  })

  it('respects custom changeRatio threshold', () => {
    // 50% of pixels differ — passes at 0.4, fails at 0.6
    const w = 10
    const h = 1
    const current: ImageDataLike = {
      data: Array.from({ length: w * h * 4 }, (_, i) => (Math.floor(i / 4) < 5 ? 255 : 0)),
      width: w,
      height: h,
    }
    const previous: ImageDataLike = { data: new Array(w * h * 4).fill(0), width: w, height: h }
    const region: Rectangle = { x: 0, y: 0, width: w, height: h }

    expect(hasFrameChanged(current, previous, [region], { changeRatio: 0.4 })).toBe(true)
    expect(hasFrameChanged(current, previous, [region], { changeRatio: 0.6 })).toBe(false)
  })

  it('uses per-channel threshold correctly', () => {
    // Pixels differ by exactly 20 — below default 30, above threshold 10
    const data1: ImageDataLike = { data: [100, 100, 100, 255], width: 1, height: 1 }
    const data2: ImageDataLike = { data: [120, 120, 120, 255], width: 1, height: 1 }
    const region: Rectangle = { x: 0, y: 0, width: 1, height: 1 }

    expect(hasFrameChanged(data1, data2, [region], { threshold: 30, changeRatio: 0 })).toBe(false)
    expect(hasFrameChanged(data1, data2, [region], { threshold: 10, changeRatio: 0 })).toBe(true)
  })

  it('returns false when same fixture is compared against itself', async () => {
    if (pngFiles.length === 0) {
      console.warn('⚠️  No fixture images found — skipping fixture-based test')
      return
    }
    const filename = pngFiles[0]!
    const imageData = await loadImageData(filename)
    expect(hasFrameChanged(imageData, imageData, ARTIFACT_PANEL_REGIONS)).toBe(false)
  })

  it('returns true when two different fixture images are compared', async () => {
    // Pick one inventory and one character fixture — different screen layouts mean
    // the artifact panel pixels definitely differ in position and content.
    const inventoryFixture = pngFiles.find((f) => f.startsWith('inventory-'))
    const characterFixture = pngFiles.find((f) => f.startsWith('character-geo'))
    if (!inventoryFixture || !characterFixture) {
      console.warn('⚠️  Need inventory + character fixtures — skipping cross-fixture diff test')
      return
    }
    const [dataA, dataB] = await Promise.all([
      loadImageData(inventoryFixture),
      loadImageData(characterFixture),
    ])
    expect(hasFrameChanged(dataA, dataB, ARTIFACT_PANEL_REGIONS)).toBe(true)
  })
})
