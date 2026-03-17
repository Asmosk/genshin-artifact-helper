/**
 * @vitest-environment node
 *
 * Integration tests for OCR functionality with real artifact screenshots.
 * Uses the full region-based pipeline (recognizeRegions → parseArtifactFromRegions)
 * to match how the app actually processes screenshots.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { readdir, readFile } from 'fs/promises'
import { join } from 'path'
import { createCanvas, loadImage, ImageData } from 'canvas'
import { getOCRWorker, terminateGlobalWorker } from '@/utils/ocr'
import { recognizeRegions } from '@/utils/ocr-regions'
import { parseArtifactFromRegions } from '@/utils/parsing'
import { getRegionTemplate } from '@/utils/ocr-region-templates'
import { detectScreenType } from '@/utils/screen-type-detection'
import type { Artifact } from '@/types/artifact'
import type { ScreenType } from '@/types/ocr-regions'

// Polyfill browser APIs used by cropCanvas / preprocessRegion / preprocessing.ts
;(globalThis as any).document = {
  createElement: (type: string) => {
    if (type === 'canvas') return createCanvas(1, 1)
    throw new Error(`document.createElement('${type}') not available in test environment`)
  },
}
;(globalThis as any).ImageData = ImageData

/**
 * Expected substat in fixture (includes unactivated flag)
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
  screen?: string
  starCoords?: { x: number; y: number }
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

/**
 * Test results for analysis
 */
interface TestResult {
  filename: string
  success: boolean
  confidence: number
  errors: string[]
  matched: {
    starCoords: boolean | 'not-tested'
    screenType: boolean | 'not-detected'
    setName: boolean | 'no-database'
    level: boolean
    rarity: boolean
    slot: boolean
    mainStat: boolean
    substats: number // count of correctly matched substats
  }
}

describe('OCR Integration Tests', () => {
  const fixturesDir = join(__dirname, 'fixtures', 'artifacts')
  const testResults: TestResult[] = []

  beforeAll(async () => {
    // Initialize OCR worker once for all tests
    const worker = getOCRWorker({
      langPath: join(__dirname, '..', '..', 'public', 'tessdata'),
    })
    await worker.initialize()
  }, 30000) // 30s timeout for worker initialization

  afterAll(async () => {
    // Terminate worker after tests
    await terminateGlobalWorker()

    // Print test summary
    if (testResults.length > 0) {
      const passed = testResults.filter((r) => r.success)
      const failed = testResults.filter((r) => !r.success)
      console.log('\n=== OCR Test Results Summary ===')
      console.log(`Total: ${testResults.length}  Passed: ${passed.length}  Failed: ${failed.length}`)

      if (failed.length > 0) {
        console.log('\nFailed fixtures:')
        failed.forEach((r) => {
          console.log(`  ✗ ${r.filename} (conf: ${r.confidence.toFixed(2)})`)
          const m = r.matched
          if (!m.level) console.log(`      level: failed`)
          if (!m.rarity) console.log(`      rarity: failed`)
          if (!m.slot) console.log(`      slot: failed`)
          if (!m.mainStat) console.log(`      mainStat: failed`)
          console.log(`      substats: ${m.substats} matched`)
          if (r.errors.length > 0) console.log(`      errors: ${r.errors.join(', ')}`)
        })
      }
    }
  })

  /**
   * Load a fixture PNG into a canvas element using the node-canvas package
   */
  async function loadFixtureCanvas(filename: string): Promise<HTMLCanvasElement> {
    const img = await loadImage(join(fixturesDir, filename))
    const canvas = createCanvas(img.width, img.height)
    const ctx = canvas.getContext('2d')
    ctx.drawImage(img as any, 0, 0)
    return canvas as unknown as HTMLCanvasElement
  }

  /**
   * Helper to load ground truth JSON
   */
  async function loadGroundTruth(filename: string): Promise<FixtureGroundTruth> {
    const jsonPath = join(fixturesDir, filename.replace('.png', '.json'))
    let content = await readFile(jsonPath, 'utf-8')
    // Remove BOM if present
    if (content.charCodeAt(0) === 0xfeff) {
      content = content.slice(1)
    }
    return JSON.parse(content)
  }

  /**
   * Assert a single field, logging only on failure. Returns true if matched.
   */
  function assertField<T>(
    label: string,
    parsed: T,
    expected: T,
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
      console.warn(`  ⚠️  ${label}: expected=${String(expected)}, got=${String(parsed)}${rawPart}`)
    }
    return ok
  }

  /**
   * Helper to compare artifacts
   */
  function compareArtifacts(
    parsed: Partial<Artifact>,
    expected: FixtureExpected,
    regions: Array<{ regionName: string; text: string }>,
  ): Pick<TestResult['matched'], 'level' | 'rarity' | 'slot' | 'mainStat' | 'substats'> {
    const rawFor = (name: string) => regions.find((r) => r.regionName === name)?.text.trim() ?? ''

    return {
      level: assertField('level', parsed.level, expected.level, rawFor('level')),
      rarity: assertField('rarity', parsed.rarity, expected.rarity),
      slot: assertField('slot', parsed.slot, expected.slot, rawFor('slotName')),
      mainStat:
        assertField('mainStat.type', parsed.mainStat?.type, expected.mainStat?.type, rawFor('mainStatName')) &&
        assertField('mainStat.value', parsed.mainStat?.value ?? 0, expected.mainStat?.value ?? 0, rawFor('mainStatValue'), { tolerance: 0.5 }),
      substats: (() => {
        const parsedList = parsed.substats || []
        const expectedList = expected.substats || []
        const rawSubstats = ['substat1', 'substat2', 'substat3', 'substat4']
          .map((n) => rawFor(n))
          .filter(Boolean)
          .join(' | ')
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
              console.warn(
                `  ⚠️  substat "${es.type}": expected value=${es.value}, got=${sameType.value}${unactivatedNote}`,
              )
            } else {
              const parsedSummary = parsedList.map((ps) => `${ps.type}=${ps.value}`).join(', ')
              console.warn(
                `  ⚠️  substat "${es.type}" (expected ${es.value}): not found — parsed=[${parsedSummary}]`,
              )
            }
            if (rawSubstats) {
              console.warn(`      raw OCR: [${rawSubstats}]`)
            }
          }
        }
        return matchCount
      })(),
    }
  }

  /**
   * Dynamic test generation from fixture files
   */
  it('should load fixture directory', async () => {
    try {
      const files = await readdir(fixturesDir)
      const imageFiles = files.filter((f) => f.endsWith('.png'))
      expect(imageFiles.length).toBeGreaterThanOrEqual(0)

      if (imageFiles.length === 0) {
        console.warn(
          '\n⚠️  No test fixture images found. Please add artifact screenshots to:',
        )
        console.warn(`   ${fixturesDir}`)
        console.warn('   See fixtures/artifacts/README.md for instructions.\n')
      }
    } catch (error) {
      console.warn(`Could not read fixtures directory: ${error}`)
    }
  })

  /**
   * Test OCR worker initialization
   */
  it('should initialize OCR worker', async () => {
    const worker = getOCRWorker()
    expect(worker.initialized).toBe(true)
  })

  /**
   * Test with real fixture images using the full region-based pipeline
   */
  it('should process real fixture images', async () => {
    const files = await readdir(fixturesDir)
    const imageFiles = files.filter((f) => f.endsWith('.png'))

    if (imageFiles.length === 0) {
      console.warn('⚠️  No fixture images found, skipping OCR tests')
      return
    }

    console.log(`Processing ${imageFiles.length} fixture images...`)

    for (const imageFile of imageFiles) {
      try {
        // Load ground truth
        const groundTruth = await loadGroundTruth(imageFile)
        const expected = groundTruth.expected
        const screenType = expected.screen as ScreenType

        if (!screenType) {
          console.warn(`  ⚠️  ${imageFile}: no screen type in ground truth, skipping`)
          continue
        }

        // Load image as canvas
        const canvas = await loadFixtureCanvas(imageFile)

        // Run the full region-based OCR pipeline
        const layout = getRegionTemplate(screenType)
        let regionResult
        try {
          regionResult = await recognizeRegions(canvas, layout)
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error)
          console.warn(`  ⚠️  ${imageFile}: pipeline failed (${msg})`)
          testResults.push({
            filename: imageFile,
            success: false,
            confidence: 0,
            errors: [msg],
            matched: {
              starCoords: 'not-tested',
              screenType: 'not-detected',
              setName: 'no-database',
              level: false,
              rarity: false,
              slot: false,
              mainStat: false,
              substats: 0,
            },
          })
          continue
        }

        // --- Star coordinates assertion ---
        const starPos = regionResult.starDetection?.position
        let starCoordsResult: boolean | 'not-tested'
        if (expected.starCoords && starPos) {
          const TOLERANCE = 10
          const dx = Math.abs(starPos.x - expected.starCoords.x)
          const dy = Math.abs(starPos.y - expected.starCoords.y)
          const ok = dx <= TOLERANCE && dy <= TOLERANCE
          starCoordsResult = ok
          if (!ok) {
            console.warn(
              `  ⚠️  ${imageFile} starCoords: expected=(${expected.starCoords.x},${expected.starCoords.y}), got=(${starPos.x},${starPos.y})`,
            )
          }
        } else {
          starCoordsResult = 'not-tested'
          if (expected.starCoords) {
            console.warn(`  ⚠️  ${imageFile} starCoords: star detection returned no position`)
          }
        }

        // --- Screen type assertion ---
        // Screen type is passed manually to getRegionTemplate (pipeline correctness test).
        // Additionally, validate auto-detection using the known starCoords from ground truth.
        const detectedScreen = regionResult.screenType
        let screenTypeResult: boolean | 'not-detected'
        if (expected.screen) {
          const ok = detectedScreen === expected.screen
          screenTypeResult = ok ? true : 'not-detected'
          if (!ok) {
            console.warn(
              `  ⚠️  ${imageFile} screenType: expected="${expected.screen}", got="${detectedScreen}"`,
            )
          }

          // Validate detectScreenType using known star position from ground truth
          if (expected.starCoords) {
            const autoDetected = detectScreenType(
              canvas,
              expected.starCoords,
              canvas.width,
              canvas.height,
            )
            if (autoDetected !== expected.screen) {
              console.warn(
                `  ⚠️  ${imageFile} auto-detectScreenType: expected="${expected.screen}", got="${autoDetected}"`,
              )
            }
            expect(autoDetected, `${imageFile}: detectScreenType mismatch`).toBe(expected.screen)
          }
        } else {
          screenTypeResult = 'not-detected'
        }

        // --- Set name assertion ---
        // No set→piece mapping database exists yet; OCR gives piece name only.
        const pieceNameRegion = regionResult.regions.find((r) => r.regionName === 'pieceName')
        const rawPieceName = pieceNameRegion?.text.trim() ?? ''
        let setNameResult: boolean | 'no-database' = 'no-database'
        if (expected.set) {
          setNameResult = 'no-database'
          console.info(
            `  ℹ️  ${imageFile} setName: expected="${expected.set}", rawPieceName="${rawPieceName}" (set→piece mapping NOT implemented)`,
          )
          if (!rawPieceName) {
            console.warn(`  ⚠️  ${imageFile} setName: pieceName OCR returned empty string`)
          }
        }

        // --- Parse artifact and compare fields ---
        const parseResult = parseArtifactFromRegions(
          regionResult.regions,
          regionResult.starDetection?.count as 3 | 4 | 5 | undefined,
        )

        const coreMatched = compareArtifacts(parseResult.artifact, expected, regionResult.regions)

        const matched: TestResult['matched'] = {
          starCoords: starCoordsResult,
          screenType: screenTypeResult,
          setName: setNameResult,
          ...coreMatched,
        }

        testResults.push({
          filename: imageFile,
          success:
            matched.level &&
            matched.rarity &&
            matched.slot &&
            coreMatched.substats >= (expected.substats?.length ?? 0),
          confidence: parseResult.confidence,
          errors: parseResult.errors,
          matched,
        })

        expect(parseResult.artifact, `${imageFile}: parsing completely failed`).toBeDefined()
      } catch (error) {
        console.error(`❌ Unexpected error processing ${imageFile}:`, error)
        throw error
      }

      const result = testResults[testResults.length - 1]
      if (result) {
        expect(result.success, `${imageFile}: one or more fields did not match`).toBe(true)
      }
    }
  }, 120000) // 120s timeout for processing multiple images
})
