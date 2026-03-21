/**
 * Generates calibrated OCR region bounds from 21:9 fixture ground truth.
 *
 * For each screen type, reads all 3440×1440 fixture JSON files that have
 * ocrRegions, converts each region to anchor-relative template coordinates,
 * computes the bounding hull across all fixtures, applies a 5% per-region
 * margin, unifies substat 1–4 geometry, and writes the result to
 * src/generated/ocr-region-calibration.ts.
 *
 * Run: bun run generate:ocr-regions
 */

import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const FIXTURES_DIR = resolve(ROOT, 'src/__tests__/fixtures/artifacts')

const REFERENCE_WIDTH = 3440
const REFERENCE_HEIGHT = 1440
const GAME_MIN_ASPECT_RATIO = 16 / 9

const SUBSTAT_NAMES = ['substat1', 'substat2', 'substat3', 'substat4']

const REGION_ORDER = [
  'pieceName',
  'slotName',
  'level',
  'mainStatName',
  'mainStatValue',
  'substat1',
  'substat2',
  'substat3',
  'substat4',
  'substat4SecondLine',
]

type ScreenType = 'inventory' | 'character' | 'rewards'

interface RegionBounds {
  x: number
  y: number
  width: number
  height: number
}

interface Hull {
  minX: number
  minY: number
  maxRight: number
  maxBottom: number
  count: number
}

// ── PNG dimension reader ──────────────────────────────────────────────

function readPngDimensions(filePath: string): { width: number; height: number } | null {
  let buffer: Buffer
  try {
    buffer = readFileSync(filePath)
  } catch {
    return null
  }
  // PNG: 8-byte signature + IHDR chunk (4 len + 4 type + 4 width + 4 height = 16 bytes)
  if (buffer.length < 24) return null
  // Verify PNG signature bytes
  if (buffer[0] !== 0x89 || buffer[1] !== 0x50 || buffer[2] !== 0x4e || buffer[3] !== 0x47) {
    return null
  }
  const width = buffer.readUInt32BE(16)
  const height = buffer.readUInt32BE(20)
  return { width, height }
}

// ── Accumulate hulls per screen type per region ───────────────────────

const hulls: Record<ScreenType, Record<string, Hull>> = {
  inventory: {},
  character: {},
  rewards: {},
}

const jsonFiles = readdirSync(FIXTURES_DIR).filter((f) => f.endsWith('.json'))

let processedCount = 0
let skippedCount = 0

for (const jsonFile of jsonFiles) {
  const jsonPath = join(FIXTURES_DIR, jsonFile)
  const pngPath = join(FIXTURES_DIR, jsonFile.replace(/\.json$/, '.png'))

  let fixture: unknown
  try {
    fixture = JSON.parse(readFileSync(jsonPath, 'utf-8'))
  } catch {
    skippedCount++
    continue
  }

  const expected = (fixture as { expected?: Record<string, unknown> })?.expected
  if (
    !expected ||
    typeof expected.ocrRegions !== 'object' ||
    !expected.ocrRegions ||
    typeof expected.starCoords !== 'object' ||
    !expected.starCoords ||
    typeof expected.screen !== 'string'
  ) {
    skippedCount++
    continue
  }

  const screen = expected.screen as ScreenType
  if (!(screen in hulls)) {
    skippedCount++
    continue
  }

  const dims = readPngDimensions(pngPath)
  if (!dims) {
    skippedCount++
    continue
  }

  const starCoords = expected.starCoords as { x: number; y: number }
  const ocrRegions = expected.ocrRegions as Record<string, RegionBounds>

  // Genshin UI scales with effectiveHeight = min(imageHeight, imageWidth / (16/9)).
  // Template coordinates are fractions of effectiveRefWidth / effectiveHeight so that
  // fixtures from any aspect ratio contribute to the same coordinate space.
  // For 21:9 (3440×1440): effectiveRefWidth = 3440 = imageWidth, effectiveHeight = 1440 = imageHeight
  // — so the conversion is identical to the old imageWidth/imageHeight fractions for those fixtures.
  const effectiveHeight = Math.min(dims.height, dims.width / GAME_MIN_ASPECT_RATIO)
  const effectiveRefWidth = effectiveHeight * (REFERENCE_WIDTH / REFERENCE_HEIGHT)

  const anchorFracX = starCoords.x / effectiveRefWidth
  const anchorFracY = starCoords.y / effectiveHeight

  for (const [regionName, region] of Object.entries(ocrRegions)) {
    // Convert from image-fraction coords to anchor-relative template coords
    // in effectiveRefWidth / effectiveHeight space.
    const relX = (region.x * dims.width) / effectiveRefWidth - anchorFracX
    const relY = (region.y * dims.height) / effectiveHeight - anchorFracY
    const relWidth = (region.width * dims.width) / effectiveRefWidth
    const relHeight = (region.height * dims.height) / effectiveHeight

    const screenHulls = hulls[screen]
    const existing = screenHulls[regionName]
    if (!existing) {
      screenHulls[regionName] = {
        minX: relX,
        minY: relY,
        maxRight: relX + relWidth,
        maxBottom: relY + relHeight,
        count: 1,
      }
    } else {
      existing.minX = Math.min(existing.minX, relX)
      existing.minY = Math.min(existing.minY, relY)
      existing.maxRight = Math.max(existing.maxRight, relX + relWidth)
      existing.maxBottom = Math.max(existing.maxBottom, relY + relHeight)
      existing.count++
    }
  }

  processedCount++
}

// ── Apply 5% per-region margin ────────────────────────────────────────

function applyMargin(hull: Hull): RegionBounds {
  const w = hull.maxRight - hull.minX
  const h = hull.maxBottom - hull.minY
  const marginX = w * 0.05
  const marginY = h * 0.05
  return {
    x: hull.minX - marginX,
    y: hull.minY - marginY,
    width: w * 1.1,
    height: h * 1.1,
  }
}

// ── Unify substat 1–4 geometry (shared x, width, height; own y) ───────

function unifySubstats(regions: Record<string, RegionBounds>): void {
  const present = SUBSTAT_NAMES.filter((n) => n in regions)
  if (present.length === 0) return

  const unifiedX = Math.min(...present.map((n) => regions[n]!.x))
  const unifiedRight = Math.max(...present.map((n) => regions[n]!.x + regions[n]!.width))
  const unifiedWidth = unifiedRight - unifiedX
  const unifiedHeight = Math.max(...present.map((n) => regions[n]!.height))

  for (const name of present) {
    regions[name] = {
      x: unifiedX,
      y: regions[name]!.y,
      width: unifiedWidth,
      height: unifiedHeight,
    }
  }
}

// ── Finalize calibrated regions ───────────────────────────────────────

const calibrated: Record<ScreenType, Record<string, RegionBounds>> = {
  inventory: {},
  character: {},
  rewards: {},
}

for (const screen of ['inventory', 'character', 'rewards'] as ScreenType[]) {
  for (const [regionName, hull] of Object.entries(hulls[screen])) {
    calibrated[screen][regionName] = applyMargin(hull)
  }
  unifySubstats(calibrated[screen])
}

// ── Generate output file ──────────────────────────────────────────────

function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6
}

function fmtBounds(b: RegionBounds): string {
  return `{ x: ${round6(b.x)}, y: ${round6(b.y)}, width: ${round6(b.width)}, height: ${round6(b.height)} }`
}

function generateBlock(varName: string, screen: ScreenType): string[] {
  const regions = calibrated[screen]
  // No explicit type annotation — let TS infer concrete property types so
  // noUncheckedIndexedAccess does not make each access possibly undefined.
  const lines: string[] = [`export const ${varName} = {`]
  for (const name of REGION_ORDER) {
    const bounds = regions[name]
    if (bounds) {
      lines.push(`  ${name}: ${fmtBounds(bounds)},`)
    }
  }
  lines.push(`} satisfies Record<string, CalibratedRegionBounds>`)
  return lines
}

// Hash fixture filenames for staleness detection
const hash = createHash('sha256')
for (const f of [...jsonFiles].sort()) hash.update(f)
const sourceHash = hash.digest('hex').slice(0, 16)

const outputLines = [
  `// AUTO-GENERATED by scripts/generate-ocr-calibration.ts — do not edit manually.`,
  `// Run \`bun run generate:ocr-regions\` to regenerate.`,
  `// source-hash: ${sourceHash}`,
  ``,
  `export interface CalibratedRegionBounds {`,
  `  x: number`,
  `  y: number`,
  `  width: number`,
  `  height: number`,
  `}`,
  ``,
  ...generateBlock('CHARACTER_CALIBRATED', 'character'),
  ``,
  ...generateBlock('INVENTORY_CALIBRATED', 'inventory'),
  ``,
  ...generateBlock('REWARDS_CALIBRATED', 'rewards'),
  ``,
]

const outPath = resolve(ROOT, 'src/generated/ocr-region-calibration.ts')
writeFileSync(outPath, outputLines.join('\n'), 'utf-8')

// ── Summary ───────────────────────────────────────────────────────────

console.log(`Generated ${outPath}`)
console.log(`  Processed : ${processedCount} fixtures (all aspect ratios with ocrRegions)`)
console.log(`  Skipped   : ${skippedCount} fixtures`)
for (const screen of ['character', 'inventory', 'rewards'] as ScreenType[]) {
  const count = Object.keys(calibrated[screen]).length
  const fixtureCount = Object.values(hulls[screen])[0]?.count ?? 0
  console.log(`  ${screen.padEnd(10)}: ${count} regions (from ${fixtureCount}+ fixtures)`)
}
