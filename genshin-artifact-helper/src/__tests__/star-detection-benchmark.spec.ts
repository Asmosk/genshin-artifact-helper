/**
 * @vitest-environment node
 *
 * Benchmark: compare legacyStarCenterFinder, regionStarCenterFinder, and projectionStarDetector
 * against fixture ground-truth starCoords.
 *
 * No assertions fail — results are printed to console for manual review.
 */

import { describe, it, beforeAll } from 'vitest'
import { readdir, readFile } from 'fs/promises'
import { join } from 'path'
import { createCanvas, loadImage } from 'canvas'
import {
  detectStarsInFullScreen,
  legacyStarCenterFinder,
  regionStarCenterFinder,
  makeLegacyDetector,
  projectionStarDetector,
} from '@/utils/star-detection'

// Polyfill browser APIs
;(globalThis as any).document = {
  createElement: (type: string) => {
    if (type === 'canvas') return createCanvas(1, 1)
    throw new Error(`document.createElement('${type}') not available in test environment`)
  },
}

interface FixtureExpected {
  starCoords?: { x: number; y: number }
}

interface FixtureGroundTruth {
  expected: FixtureExpected
}

interface BenchmarkRow {
  fixture: string
  expected: { x: number; y: number }
  legacyResult: { x: number; y: number } | null
  legacyDist: number | null
  regionResult: { x: number; y: number } | null
  regionDist: number | null
  projectionResult: { x: number; y: number } | null
  projectionDist: number | null
}

function euclidean(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2)
}

function pad(s: string, len: number): string {
  return s.length >= len ? s : s + ' '.repeat(len - s.length)
}

describe('Star Center Finder Benchmark', () => {
  const fixturesDir = join(__dirname, 'fixtures', 'artifacts')
  const rows: BenchmarkRow[] = []

  beforeAll(async () => {
    let files: string[]
    try {
      files = await readdir(fixturesDir)
    } catch {
      console.warn('Could not read fixtures directory')
      return
    }

    const imageFiles = files.filter((f) => f.endsWith('.png'))

    for (const imageFile of imageFiles) {
      // Load ground truth
      const jsonPath = join(fixturesDir, imageFile.replace('.png', '.json'))
      let groundTruth: FixtureGroundTruth
      try {
        let content = await readFile(jsonPath, 'utf-8')
        if (content.charCodeAt(0) === 0xfeff) content = content.slice(1)
        groundTruth = JSON.parse(content)
      } catch {
        continue
      }

      const expected = groundTruth.expected.starCoords
      if (!expected) continue

      // Load image
      const img = await loadImage(join(fixturesDir, imageFile))
      const canvas = createCanvas(img.width, img.height)
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img as any, 0, 0)
      const htmlCanvas = canvas as unknown as HTMLCanvasElement

      // Run legacy finder
      const legacyDetection = detectStarsInFullScreen(
        htmlCanvas,
        canvas.height,
        undefined,
        makeLegacyDetector(legacyStarCenterFinder),
      )
      const legacyResult = legacyDetection?.stars.position ?? null
      const legacyDist = legacyResult ? euclidean(legacyResult, expected) : null

      // Run region finder
      const regionDetection = detectStarsInFullScreen(
        htmlCanvas,
        canvas.height,
        undefined,
        makeLegacyDetector(regionStarCenterFinder),
      )
      const regionResult = regionDetection?.stars.position ?? null
      const regionDist = regionResult ? euclidean(regionResult, expected) : null

      // Run projection detector
      const projectionDetection = detectStarsInFullScreen(
        htmlCanvas,
        canvas.height,
        undefined,
        projectionStarDetector,
      )
      const projectionResult = projectionDetection?.stars.position ?? null
      const projectionDist = projectionResult ? euclidean(projectionResult, expected) : null

      rows.push({
        fixture: imageFile.replace('.png', ''),
        expected,
        legacyResult,
        legacyDist,
        regionResult,
        regionDist,
        projectionResult,
        projectionDist,
      })
    }
  }, 60000)

  it('prints benchmark table', () => {
    if (rows.length === 0) {
      console.warn('No fixtures with starCoords found — nothing to benchmark')
      return
    }

    const COL1 = 44
    const COL2 = 16
    const COL3 = 13
    const COL4 = 13
    const COL5 = 16

    const header =
      pad('Fixture', COL1) +
      '| ' +
      pad('Expected', COL2) +
      '| ' +
      pad('Legacy dist', COL3) +
      '| ' +
      pad('Region dist', COL4) +
      '| ' +
      pad('Projection dist', COL5)
    const sep =
      '-'.repeat(COL1) +
      '+-' +
      '-'.repeat(COL2) +
      '+-' +
      '-'.repeat(COL3) +
      '+-' +
      '-'.repeat(COL4) +
      '+-' +
      '-'.repeat(COL5)

    console.log('\n' + sep)
    console.log(header)
    console.log(sep)

    for (const row of rows) {
      const expectedStr = `(${row.expected.x}, ${row.expected.y})`
      const legacyStr = row.legacyDist !== null ? `${row.legacyDist.toFixed(1)} px` : 'no result'
      const regionStr = row.regionDist !== null ? `${row.regionDist.toFixed(1)} px` : 'no result'
      const projectionStr = row.projectionDist !== null ? `${row.projectionDist.toFixed(1)} px` : 'no result'
      console.log(
        pad(row.fixture, COL1) +
          '| ' +
          pad(expectedStr, COL2) +
          '| ' +
          pad(legacyStr, COL3) +
          '| ' +
          pad(regionStr, COL4) +
          '| ' +
          pad(projectionStr, COL5),
      )
    }

    console.log(sep)

    const legacyDistances = rows.map((r) => r.legacyDist).filter((d): d is number => d !== null)
    const regionDistances = rows.map((r) => r.regionDist).filter((d): d is number => d !== null)
    const projectionDistances = rows.map((r) => r.projectionDist).filter((d): d is number => d !== null)
    const avgLegacy =
      legacyDistances.length > 0
        ? legacyDistances.reduce((a, b) => a + b, 0) / legacyDistances.length
        : null
    const avgRegion =
      regionDistances.length > 0
        ? regionDistances.reduce((a, b) => a + b, 0) / regionDistances.length
        : null
    const avgProjection =
      projectionDistances.length > 0
        ? projectionDistances.reduce((a, b) => a + b, 0) / projectionDistances.length
        : null

    console.log(
      pad('AVERAGE', COL1) +
        '| ' +
        pad('', COL2) +
        '| ' +
        pad(avgLegacy !== null ? `${avgLegacy.toFixed(1)} px` : 'n/a', COL3) +
        '| ' +
        pad(avgRegion !== null ? `${avgRegion.toFixed(1)} px` : 'n/a', COL4) +
        '| ' +
        pad(avgProjection !== null ? `${avgProjection.toFixed(1)} px` : 'n/a', COL5),
    )
    console.log(sep + '\n')
  })
})
