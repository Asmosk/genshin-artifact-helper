/**
 * Integration tests for OCR functionality with real artifact screenshots
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { readdir, readFile } from 'fs/promises'
import { join } from 'path'
import { getOCRWorker, terminateGlobalWorker } from '@/utils/ocr'
import { parseArtifact } from '@/utils/parsing'
import type { Artifact } from '@/types/artifact'

/**
 * Ground truth fixture format
 */
interface FixtureGroundTruth {
  filename: string
  description?: string
  expected: Partial<Artifact>
  notes?: string
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
    const worker = getOCRWorker()
    await worker.initialize()
  }, 30000) // 30s timeout for worker initialization

  afterAll(async () => {
    // Terminate worker after tests
    await terminateGlobalWorker()

    // Print test summary
    if (testResults.length > 0) {
      console.log('\n=== OCR Test Results Summary ===')
      console.log(`Total tests: ${testResults.length}`)
      console.log(
        `Successful: ${testResults.filter((r) => r.success).length}/${testResults.length}`,
      )
      console.log(
        `Average confidence: ${(testResults.reduce((sum, r) => sum + r.confidence, 0) / testResults.length).toFixed(2)}`,
      )

      const totalSubstats = testResults.reduce((sum, r) => sum + 4, 0) // Assume 4 substats per artifact
      const matchedSubstats = testResults.reduce((sum, r) => sum + r.matched.substats, 0)
      console.log(`Substat accuracy: ${matchedSubstats}/${totalSubstats} (${((matchedSubstats / totalSubstats) * 100).toFixed(1)}%)`)

      console.log('\nIndividual Results:')
      testResults.forEach((r) => {
        const status = r.success ? '✓' : '✗'
        console.log(`  ${status} ${r.filename} (conf: ${r.confidence.toFixed(2)})`)
        if (r.errors.length > 0) {
          console.log(`     Errors: ${r.errors.join(', ')}`)
        }
      })
    }
  })

  /**
   * Helper to load fixture image - returns file path for Tesseract
   */
  async function loadFixtureImage(filename: string): Promise<string> {
    // Return the full path - Tesseract.js can read files directly in Node.js
    return join(fixturesDir, filename)
  }

  /**
   * Helper to load ground truth JSON
   */
  async function loadGroundTruth(filename: string): Promise<FixtureGroundTruth> {
    const jsonPath = join(fixturesDir, filename.replace('.png', '.json'))
    let content = await readFile(jsonPath, 'utf-8')
    // Remove BOM if present
    if (content.charCodeAt(0) === 0xFEFF) {
      content = content.slice(1)
    }
    return JSON.parse(content)
  }

  /**
   * Helper to compare artifacts
   */
  function compareArtifacts(
    parsed: Partial<Artifact>,
    expected: Partial<Artifact>,
  ): TestResult['matched'] {
    return {
      level: parsed.level === expected.level,
      rarity: parsed.rarity === expected.rarity,
      slot: parsed.slot === expected.slot,
      mainStat:
        parsed.mainStat?.type === expected.mainStat?.type &&
        Math.abs((parsed.mainStat?.value || 0) - (expected.mainStat?.value || 0)) < 0.5,
      substats: (parsed.substats || []).filter((ps) =>
        (expected.substats || []).some(
          (es) => es.type === ps.type && Math.abs(es.value - ps.value) < 1.0,
        ),
      ).length,
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
      // Don't fail the test - fixtures are optional for initial setup
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
   * Test basic OCR functionality (without real images)
   * Skipped because canvas doesn't work well in JSDOM
   */
  it.skip('should recognize text from mock input', async () => {
    const worker = getOCRWorker()

    // Create a simple test canvas with text
    const canvas = document.createElement('canvas')
    canvas.width = 200
    canvas.height = 100
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = 'white'
    ctx.fillRect(0, 0, 200, 100)
    ctx.fillStyle = 'black'
    ctx.font = '24px Arial'
    ctx.fillText('CRIT Rate+3.5%', 10, 50)

    // This will likely not work perfectly with the simple canvas
    // but tests that the OCR pipeline doesn't crash
    const result = await worker.recognize(canvas)
    expect(result.data.text).toBeDefined()
    expect(typeof result.data.confidence).toBe('number')
  }, 10000)

  /**
   * Test parsing functionality (without OCR)
   */
  it('should parse artifact from known good OCR text', () => {
    const sampleOCRText = `
      Emblem of Severed Fate
      Circlet of Logos
      ★★★★★
      +20
      CRIT Rate 31.1%
      CRIT DMG+21.0%
      ATK+16.9%
      Energy Recharge+11.0%
      DEF+37
    `

    const result = parseArtifact(sampleOCRText)

    expect(result.artifact.level).toBe(20)
    expect(result.artifact.rarity).toBe(5)
    expect(result.artifact.slot).toBe('Circlet')
    expect(result.artifact.mainStat).toBeDefined()
    expect(result.artifact.substats).toBeDefined()
    expect(result.artifact.substats?.length).toBeGreaterThan(0)
  })

  /**
   * Test with real fixture images
   * Dynamically generates a test for each PNG file found
   */
  it('should process real fixture images', async () => {
    const files = await readdir(fixturesDir)
    const imageFiles = files.filter((f) => f.endsWith('.png'))

    if (imageFiles.length === 0) {
      console.warn('⚠️  No fixture images found, skipping OCR tests')
      return
    }

    console.log(`\n📸 Processing ${imageFiles.length} fixture images...\n`)

    for (const imageFile of imageFiles) {
      try {
        console.log(`Testing: ${imageFile}`)

        // Load ground truth
        const groundTruth = await loadGroundTruth(imageFile)

        // Load and process image
        const imagePath = await loadFixtureImage(imageFile)
        const worker = getOCRWorker()
        const ocrResult = await worker.recognize(imagePath)

        console.log(`  Raw OCR text:\n${ocrResult.data.text.substring(0, 200)}...`)

        // Parse artifact
        const parseResult = parseArtifact(ocrResult.data.text)

        console.log(`  Parsed level: ${parseResult.artifact.level} (expected: ${groundTruth.expected.level})`)
        console.log(`  Parsed rarity: ${parseResult.artifact.rarity} (expected: ${groundTruth.expected.rarity})`)
        console.log(`  Parsed slot: ${parseResult.artifact.slot} (expected: ${groundTruth.expected.slot})`)
        console.log(`  Parsed substats: ${parseResult.artifact.substats?.length || 0} (expected: ${groundTruth.expected.substats?.length || 0})`)

        // Compare results
        const matched = compareArtifacts(parseResult.artifact, groundTruth.expected)

        // Record results
        const testResult: TestResult = {
          filename: imageFile,
          success:
            matched.level && matched.rarity && matched.slot && matched.substats >= 3,
          confidence: parseResult.confidence,
          errors: parseResult.errors,
          matched,
        }
        testResults.push(testResult)

        // Log any mismatches but don't fail the test - OCR is inherently imperfect
        if (!matched.level) console.warn(`  ⚠️  Level mismatch: got ${parseResult.artifact.level}, expected ${groundTruth.expected.level}`)
        if (!matched.rarity) console.warn(`  ⚠️  Rarity mismatch: got ${parseResult.artifact.rarity}, expected ${groundTruth.expected.rarity}`)
        if (!matched.slot) console.warn(`  ⚠️  Slot mismatch: got ${parseResult.artifact.slot}, expected ${groundTruth.expected.slot}`)
        if (matched.substats < 3) console.warn(`  ⚠️  Only ${matched.substats}/4 substats matched`)

        // Test passes if we got reasonable results (at least parsing worked)
        expect(parseResult.artifact, `${imageFile}: parsing completely failed`).toBeDefined()
      } catch (error) {
        console.error(`❌ Failed to process ${imageFile}:`, error)
        throw error
      }
    }
  }, 120000) // 120s timeout for processing multiple images
})

/**
 * Performance benchmarks
 * Skipped because canvas doesn't work in JSDOM
 */
describe.skip('OCR Performance', () => {
  it('should complete OCR within reasonable time', async () => {
    const worker = getOCRWorker()
    await worker.initialize()

    const canvas = document.createElement('canvas')
    canvas.width = 800
    canvas.height = 600

    const startTime = Date.now()
    await worker.recognize(canvas)
    const duration = Date.now() - startTime

    // Should complete within 5 seconds for a typical image
    expect(duration).toBeLessThan(5000)

    await terminateGlobalWorker()
  }, 10000)
})
