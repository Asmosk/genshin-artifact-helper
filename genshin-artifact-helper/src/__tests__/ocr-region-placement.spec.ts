/**
 * @vitest-environment node
 *
 * OCR region placement tests.
 * Validates that each computed region fully contains the ideal text bounding box
 * from the fixture's ocrRegions ground truth.
 *
 * The fixture ocrRegions are the precise pixel bounding boxes of the actual text
 * content. The computed template region must fully enclose each ideal box so that
 * Tesseract always sees the complete text.
 *
 * Ground truth fields used:
 *   expected.screen      — used to select the layout template
 *   expected.starCoords  — anchor point fed to calculateAllRegionPositions
 *   expected.ocrRegions  — ideal text bounding boxes as fractions of imageWidth/imageHeight
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { readdirSync } from 'fs'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { createCanvas, loadImage } from 'canvas'
import { getRegionTemplate, calculateAllRegionPositions } from '@/utils/ocr-region-templates'
import type { ArtifactScreenType } from '@/types/ocr-regions'

// Polyfill browser APIs (required by canvas-dependent imports in the module graph)
;(globalThis as any).document = {
  createElement: (type: string) => {
    if (type === 'canvas') return createCanvas(1, 1)
    throw new Error(`document.createElement('${type}') not available in test environment`)
  },
}

const ARTIFACT_SCREEN_TYPES = new Set<string>(['character', 'inventory', 'rewards'])

interface FixtureOcrRegion {
  x: number
  y: number
  width: number
  height: number
}

interface FixtureExpected {
  screen?: string
  starCoords?: { x: number; y: number }
  ocrRegions?: Record<string, FixtureOcrRegion>
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

async function loadGroundTruth(filename: string): Promise<FixtureGroundTruth> {
  const jsonPath = join(fixturesDir, filename.replace('.png', '.json'))
  let content = await readFile(jsonPath, 'utf-8')
  if (content.charCodeAt(0) === 0xfeff) content = content.slice(1)
  return JSON.parse(content)
}

describe('OCR Region Placement', () => {
  beforeAll(async () => {
    const warmup = createCanvas(1, 1)
    warmup.getContext('2d')
  })

  for (const filename of imageFiles) {
    it(filename, async () => {
      const gt = await loadGroundTruth(filename)
      const { screen, starCoords, ocrRegions } = gt.expected

      // Skip fixtures without the data this test needs
      if (!screen || !ARTIFACT_SCREEN_TYPES.has(screen) || !starCoords || !ocrRegions) {
        return
      }

      const img = await loadImage(join(fixturesDir, filename))
      const imageWidth = img.width
      const imageHeight = img.height

      const layout = getRegionTemplate(screen as ArtifactScreenType)
      const positions = calculateAllRegionPositions(layout, imageWidth, imageHeight, starCoords)

      const errors: string[] = []

      for (const [regionName, ideal] of Object.entries(ocrRegions)) {
        const computed = positions.get(regionName)
        if (!computed) {
          errors.push(`  ${regionName}: not computed (missing from layout)`)
          continue
        }

        // Convert ideal fractions to pixels
        const idealLeft   = ideal.x * imageWidth
        const idealTop    = ideal.y * imageHeight
        const idealRight  = idealLeft + ideal.width * imageWidth
        const idealBottom = idealTop  + ideal.height * imageHeight

        // Computed region edges
        const compLeft   = computed.x
        const compTop    = computed.y
        const compRight  = computed.x + computed.width
        const compBottom = computed.y + computed.height

        // The computed region must fully contain the ideal bounding box
        const regionErrors: string[] = []
        if (compLeft > idealLeft)
          regionErrors.push(`left edge: computed=${compLeft.toFixed(0)} > ideal=${idealLeft.toFixed(0)} (misses by ${(compLeft - idealLeft).toFixed(1)}px)`)
        if (compTop > idealTop)
          regionErrors.push(`top edge: computed=${compTop.toFixed(0)} > ideal=${idealTop.toFixed(0)} (misses by ${(compTop - idealTop).toFixed(1)}px)`)
        if (compRight < idealRight)
          regionErrors.push(`right edge: computed=${compRight.toFixed(0)} < ideal=${idealRight.toFixed(0)} (misses by ${(idealRight - compRight).toFixed(1)}px)`)
        if (compBottom < idealBottom)
          regionErrors.push(`bottom edge: computed=${compBottom.toFixed(0)} < ideal=${idealBottom.toFixed(0)} (misses by ${(idealBottom - compBottom).toFixed(1)}px)`)

        if (regionErrors.length > 0) {
          errors.push(`  ${regionName}: ${regionErrors.join(' | ')}`)
        }
      }

      if (errors.length > 0) {
        const header = `${filename} (${imageWidth}x${imageHeight}) — computed regions do not contain ideal text boxes:`
        expect.fail(`${header}\n${errors.join('\n')}`)
      }
    })
  }
})
