/**
 * @vitest-environment node
 *
 * OCR and parsing integration tests.
 * Uses known-good starCoords and screen type from ground truth — star detection and
 * screen type detection do NOT run.
 *
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { readdirSync } from 'fs'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { createCanvas, loadImage, ImageData } from 'canvas'
import { getOCRWorker, terminateGlobalWorker } from '@/utils/ocr'
import { recognizeRegions } from '@/utils/ocr-regions'
import { parseArtifactFromRegions } from '@/utils/parsing'
import { getRegionTemplate } from '@/utils/ocr-region-templates'
import type { Artifact } from '@/types/artifact'
import type { ArtifactScreenType } from '@/types/ocr-regions'

// Polyfill browser APIs used by cropCanvas / preprocessRegion / preprocessing.ts
;(globalThis as any).document = {
  createElement: (type: string) => {
    if (type === 'canvas') return createCanvas(1, 1)
    throw new Error(`document.createElement('${type}') not available in test environment`)
  },
}
;(globalThis as any).ImageData = ImageData

/**
 * Expected substat in fixture
 */
interface FixtureSubstat {
  type: string
  value: number
  unactivated?: boolean
}

/**
 * Expected artifact data in fixture
 */
interface FixtureExpected {
  screen: string
  starCoords?: { x: number; y: number }
  ocrRegions?: Record<string, { x: number; y: number; width: number; height: number }>
  set?: string
  slot?: string
  rarity?: number
  level?: number
  mainStat?: { type: string; value: number }
  substats?: FixtureSubstat[]
}

/**
 * Ground truth fixture format
 */
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

/**
 * Load a fixture PNG into a canvas element using the node-canvas package
 */
async function loadFixtureCanvas(filename: string): Promise<HTMLCanvasElement> {
  const img = await loadImage(join(fixturesDir, filename))
  const canvas = createCanvas(img.width, img.height)
  canvas.getContext('2d').drawImage(img as any, 0, 0)
  return canvas as unknown as HTMLCanvasElement
}

/**
 * Load ground truth JSON
 */
async function loadGroundTruth(filename: string): Promise<FixtureGroundTruth> {
  const jsonPath = join(fixturesDir, filename.replace('.png', '.json'))
  let content = await readFile(jsonPath, 'utf-8')
  if (content.charCodeAt(0) === 0xfeff) content = content.slice(1)
  return JSON.parse(content)
}

/**
 * Assert a single field, accumulating into warnings on failure. Returns true if matched.
 */
function assertField<T>(
  label: string,
  parsed: T,
  expected: T,
  warnings: string[],
  rawOcr?: string,
  opts?: { tolerance?: number },
): boolean {
  let ok: boolean
  if (opts?.tolerance !== undefined && typeof parsed === 'number' && typeof expected === 'number') {
    ok = Math.abs(parsed - expected) <= opts.tolerance
  } else {
    ok = parsed === expected
  }
  if (!ok) {
    const rawPart = rawOcr ? `, raw="${rawOcr}"` : ''
    warnings.push(`⚠ ${label}: expected=${String(expected)}, got=${String(parsed)}${rawPart}`)
  }
  return ok
}

/**
 * Compare parsed artifact against expected ground truth, accumulating warnings
 */
function compareArtifacts(
  parsed: Partial<Artifact>,
  expected: FixtureExpected,
  regions: Array<{ regionName: string; text: string }>,
  warnings: string[],
): {
  level: boolean
  rarity: boolean
  slot: boolean
  mainStat: boolean
  substats: number
} {
  const rawFor = (name: string) => regions.find((r) => r.regionName === name)?.text.trim() ?? ''

  const rawSubstats = ['substat1', 'substat2', 'substat3', 'substat4']
    .map((n) => rawFor(n))
    .filter(Boolean)
    .join(' | ')

  const substatsMatched = (() => {
    const parsedList = parsed.substats || []
    const expectedList = expected.substats || []
    let matchCount = 0
    for (const es of expectedList) {
      const matched = parsedList.some(
        (ps) =>
          es.type === ps.type &&
          Math.abs(es.value - ps.value) < 1.0 &&
          (es.unactivated ?? false) === ((ps as FixtureSubstat).unactivated ?? false),
      )
      if (matched) {
        matchCount++
      } else {
        const sameType = parsedList.find((ps) => ps.type === es.type)
        if (sameType) {
          const gotUnactivated = (sameType as FixtureSubstat).unactivated ?? false
          const expUnactivated = es.unactivated ?? false
          const unactivatedNote =
            gotUnactivated !== expUnactivated
              ? `, unactivated: expected=${expUnactivated}, got=${gotUnactivated}`
              : ''
          warnings.push(
            `⚠ substat "${es.type}": expected value=${es.value}, got=${sameType.value}${unactivatedNote}`,
          )
        } else {
          const parsedSummary = parsedList.map((ps) => `${ps.type}=${ps.value}`).join(', ')
          warnings.push(
            `⚠ substat "${es.type}" (expected ${es.value}): not found — parsed=[${parsedSummary}]`,
          )
        }
        if (rawSubstats) {
          warnings.push(`    raw OCR: [${rawSubstats}]`)
        }
      }
    }
    return matchCount
  })()

  return {
    level: assertField('level', parsed.level, expected.level, warnings, rawFor('level')),
    rarity: assertField('rarity', parsed.rarity, expected.rarity, warnings),
    slot: assertField('slot', parsed.slot, expected.slot, warnings, rawFor('slotName')),
    mainStat:
      assertField(
        'mainStat.type',
        parsed.mainStat?.type,
        expected.mainStat?.type,
        warnings,
        rawFor('mainStatName'),
      ) &&
      assertField(
        'mainStat.value',
        parsed.mainStat?.value ?? 0,
        expected.mainStat?.value ?? 0,
        warnings,
        rawFor('mainStatValue'),
        { tolerance: 0.5 },
      ),
    substats: substatsMatched,
  }
}

describe('OCR Integration Tests', () => {
  beforeAll(async () => {
    // Warm up canvas native bindings so they don't skew the first fixture's timing
    const warmup = createCanvas(1, 1)
    warmup.getContext('2d')
    if (imageFiles.length > 0) {
      await loadImage(join(fixturesDir, imageFiles[0]!)).catch(() => {})
    }

    const worker = getOCRWorker({
      langPath: join(__dirname, '..', '..', 'public', 'tessdata'),
      cacheMethod: 'none',
    })
    await worker.initialize()
  }, 30000)

  afterAll(async () => {
    await terminateGlobalWorker()
  })

  it('should have fixture images', () => {
    if (imageFiles.length === 0) {
      console.warn('⚠️  No test fixture images found. Please add artifact screenshots to:')
      console.warn(`   ${fixturesDir}`)
      console.warn('   See fixtures/artifacts/README.md for instructions.')
    }
    expect(imageFiles.length).toBeGreaterThan(0)
  })

  it('should initialize OCR worker', () => {
    const worker = getOCRWorker()
    expect(worker.initialized).toBe(true)
  })

  it.each(imageFiles)('processes %s', async (imageFile) => {
    const warnings: string[] = []

    // Load ground truth
    const groundTruth = await loadGroundTruth(imageFile)
    const expected = groundTruth.expected

    const hasOcrRegions = expected.ocrRegions && Object.keys(expected.ocrRegions).length > 0
    if (!expected.screen || (!expected.starCoords && !hasOcrRegions)) {
      console.warn(`  ⚠️  ${imageFile}: missing screen and no starCoords or ocrRegions in ground truth, skipping`)
      return
    }

    const screenType = expected.screen as ArtifactScreenType

    // Load image and run OCR with ground-truth region positions to isolate OCR quality
    const canvas = await loadFixtureCanvas(imageFile)
    const layout = getRegionTemplate(screenType)

    // Convert fixture ocrRegions (absolute image fractions) to pixel positions
    const positionOverrides = expected.ocrRegions
      ? new Map(
          Object.entries(expected.ocrRegions).map(([name, rect]) => [
            name,
            {
              x: Math.round(rect.x * canvas.width),
              y: Math.round(rect.y * canvas.height),
              width: Math.round(rect.width * canvas.width),
              height: Math.round(rect.height * canvas.height),
            },
          ]),
        )
      : undefined

    // Use ground-truth starCoords as anchor if available; otherwise use a dummy anchor since
    // positionOverrides from ocrRegions will replace all region positions anyway.
    const anchorOverride = expected.starCoords ?? { x: 0, y: 0 }

    const regionResult = await recognizeRegions(canvas, layout, {
      anchorOverride,
      positionOverrides,
    })

    // Set name: no set→piece mapping yet, log raw piece name as info
    const rawPieceName =
      regionResult.regions.find((r) => r.regionName === 'pieceName')?.text.trim() ?? ''
    if (expected.set) {
      if (!rawPieceName) {
        warnings.push(`⚠ pieceName OCR returned empty string (expected set: "${expected.set}")`)
      } else {

      }
    }

    // Parse artifact — use ground-truth rarity as star count since we bypassed star detection
    const starCount = expected.rarity as 1 | 2 | 3 | 4 | 5 | undefined
    const parseResult = parseArtifactFromRegions(regionResult.regions, starCount)

    expect(parseResult.artifact, `${imageFile}: parsing completely failed`).toBeDefined()

    const matched = compareArtifacts(parseResult.artifact, expected, regionResult.regions, warnings)

    const success =
      matched.level &&
      matched.rarity &&
      matched.slot &&
      matched.mainStat &&
      matched.substats >= (expected.substats?.length ?? 0)

    if (warnings.length > 0) {
      console.warn(`\n  ${imageFile} (conf: ${parseResult.confidence.toFixed(2)}):`)
      warnings.forEach((w) => console.warn(`    ${w}`))
    }

    expect(
      success,
      `${imageFile}: OCR/parsing failed — see warnings above` +
        (parseResult.errors.length > 0 ? ` | errors: ${parseResult.errors.join(', ')}` : ''),
    ).toBe(true)
  }, 30000)
})
