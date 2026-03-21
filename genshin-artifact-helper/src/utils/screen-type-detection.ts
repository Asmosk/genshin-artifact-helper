/**
 * Screen type auto-detection using pixel-level heuristics.
 * Distinguishes character / inventory / rewards screens without OCR or star detection.
 *
 * Detection cascade (short-circuits on first match):
 *   character → inventory → rewards → 'other'
 *
 * Character: 3 wide non-zero regions in a 100-split histogram of the top-right strip
 *   [70–100% X, 2–10% Y], counting pixels matching any of:
 *   GOLDEN (#DBBA7D), LTGRAY (#DCD1C6), or CREAM (#ECE5D8).
 *   Each region must be ≥6 splits wide (filters noise from tab borders/icons).
 *
 * Inventory: ≥2 distinct cream (#ECE5D8) column regions in the bottom-left strip
 *   (matches the 5 inventory action buttons).
 *
 * Rewards: 3 conditions ALL pass:
 *   - Upper cream: center panel [43–56% X, 40–52% Y] >50% #ECE5D8
 *   - Lower cream: center panel [43–56% X, 55–70% Y] >50% #ECE5D8
 *   - Dark overlay: left edge [3–12% X, 40–55% Y] avg brightness < 40
 */

import type { ArtifactScreenType, DetectedScreenType } from '@/types/ocr-regions'

// ─── Color constants ──────────────────────────────────────────────────────────

interface RGB {
  r: number
  g: number
  b: number
}

const GOLDEN: RGB = { r: 0xdb, g: 0xba, b: 0x7d }
const LTGRAY: RGB = { r: 0xdc, g: 0xd1, b: 0xc6 }
const CREAM: RGB = { r: 0xec, g: 0xe5, b: 0xd8 }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function matchesColor(r: number, g: number, b: number, target: RGB, tolerance: number): boolean {
  return (
    Math.abs(r - target.r) <= tolerance &&
    Math.abs(g - target.g) <= tolerance &&
    Math.abs(b - target.b) <= tolerance
  )
}

/**
 * Read pixel data from a fractional rectangle of the canvas (0–1 coordinates).
 */
function sampleRect(
  ctx: CanvasRenderingContext2D,
  xMin: number,
  yMin: number,
  xMax: number,
  yMax: number,
): ImageData {
  const cw = ctx.canvas.width
  const ch = ctx.canvas.height
  const x = Math.round(xMin * cw)
  const y = Math.round(yMin * ch)
  const w = Math.max(1, Math.round((xMax - xMin) * cw))
  const h = Math.max(1, Math.round((yMax - yMin) * ch))
  return ctx.getImageData(x, y, w, h)
}

/**
 * Count pixels that match the target color within the given tolerance.
 */
function countColorMatches(imageData: ImageData, target: RGB, tolerance: number): number {
  let count = 0
  for (let i = 0; i < imageData.data.length; i += 4) {
    if (
      matchesColor(
        imageData.data[i] ?? 0,
        imageData.data[i + 1] ?? 0,
        imageData.data[i + 2] ?? 0,
        target,
        tolerance,
      )
    ) {
      count++
    }
  }
  return count
}

// ─── Split-histogram helper ────────────────────────────────────────────────────

/**
 * Divide an ImageData strip into NUM_SPLITS equal columns. For each split, sample one
 * representative pixel column and count how many pixels satisfy `matchFn`. Returns an
 * array of contiguous regions (each with its split-width) that meet the minimum criteria.
 *
 * @param strip    - ImageData of the region to analyse
 * @param matchFn  - Returns true if a pixel (r, g, b) should be counted
 * @param minMatch - Minimum pixel count per split to consider that split "active"
 * @param minGap   - Consecutive inactive splits required to close a region
 * @param minWidth - Minimum split-width for a region to be included in the result
 */
function findSplitRegions(
  strip: ImageData,
  matchFn: (r: number, g: number, b: number) => boolean,
  minMatch: number,
  minGap: number,
  minWidth: number,
  numSplits = 100,
): number[] {
  const NUM_SPLITS = numSplits
  const sw = strip.width
  const sh = strip.height

  const counts = new Array<number>(NUM_SPLITS).fill(0)
  for (let s = 0; s < NUM_SPLITS; s++) {
    const colX = Math.round((s / NUM_SPLITS) * sw)
    let n = 0
    for (let y = 0; y < sh; y++) {
      const idx = (y * sw + colX) * 4
      if (matchFn(strip.data[idx] ?? 0, strip.data[idx + 1] ?? 0, strip.data[idx + 2] ?? 0)) n++
    }
    counts[s] = n
  }

  const regions: number[] = []
  let inRegion = false
  let gap = 0
  let width = 0

  for (let s = 0; s < NUM_SPLITS; s++) {
    if ((counts[s] ?? 0) >= minMatch) {
      if (!inRegion) {
        inRegion = true
        width = 0
        gap = 0
      }
      width++
      gap = 0
    } else {
      if (inRegion) {
        gap++
        if (gap >= minGap) {
          if (width >= minWidth) regions.push(width)
          inRegion = false
          gap = 0
          width = 0
        }
      }
    }
  }
  if (inRegion && width >= minWidth) regions.push(width)

  return regions
}

// ─── Per-screen detectors ──────────────────────────────────────────────────────

/**
 * Character screen: 3 wide non-zero color regions in top-right strip [70–100% X, 2–10% Y].
 *
 * The strip is divided into 100 equal splits. For each split a single representative
 * pixel column is sampled and its pixels are counted against GOLDEN, LTGRAY, or CREAM
 * (any match counts). The resulting match-count array must contain ≥3 contiguous regions
 * of non-zero activity (≥3 matches per split), each region ≥6 splits wide, separated by
 * gaps of ≥3 consecutive below-threshold splits.
 *
 * This structural approach is resolution-independent: the 3 tab sections always appear as
 * 3 separate blobs regardless of image size, while noise and thin borders stay ≤5 splits wide.
 */
function detectCharacterScreen(ctx: CanvasRenderingContext2D): boolean {
  const strip = sampleRect(ctx, 0.7, 0.02, 1.0, 0.10)
  const isCharColor = (r: number, g: number, b: number) =>
    matchesColor(r, g, b, GOLDEN, 25) ||
    matchesColor(r, g, b, LTGRAY, 25) ||
    matchesColor(r, g, b, CREAM, 25)
  const regions = findSplitRegions(strip, isCharColor, 3, 3, 6)
  return regions.length >= 3
}

/**
 * Inventory screen: two-strip check using the 200-split histogram method.
 *
 * Left strip [2–35% X, 91–99% Y] — the 5 action buttons at bottom-left:
 *   Expect exactly 5 cream regions: 3 narrow (round icon buttons, ≤30 splits each)
 *   followed by 2 wide (rect buttons, ≥31 splits each). At 200 splits the two rect
 *   buttons always appear as two distinct regions across all tested resolutions.
 *
 * Right strip [85–100% X, 91–99% Y]:
 *   Expect ≥1 cream region. Absent when a non-artifact item is selected, making it the
 *   key discriminator against inventory_not_an_artifact false positives.
 *
 * Both conditions must pass.
 */
function detectInventoryScreen(ctx: CanvasRenderingContext2D): boolean {
  const isCream = (r: number, g: number, b: number) => matchesColor(r, g, b, CREAM, 15)
  const NARROW_MAX = 30
  const WIDE_MIN = 31

  // Left strip: exactly 5 regions, first 3 narrow, last 2 wide
  const leftStrip = sampleRect(ctx, 0.02, 0.91, 0.35, 0.99)
  const leftRegions = findSplitRegions(leftStrip, isCream, 3, 3, 3, 200)
  if (leftRegions.length !== 5) return false
  if (!leftRegions.slice(0, 3).every((w) => w <= NARROW_MAX)) return false
  if (!leftRegions.slice(3).every((w) => w >= WIDE_MIN)) return false

  // Right strip: ≥1 cream region
  const rightStrip = sampleRect(ctx, 0.85, 0.91, 1.0, 0.99)
  const rightRegions = findSplitRegions(rightStrip, isCream, 3, 3, 3, 200)
  return rightRegions.length >= 1
}

/**
 * Rewards screen: all 3 conditions must pass.
 *   1. Upper cream [43–56% X, 40–52% Y]: >50% match to #ECE5D8
 *   2. Lower cream [43–56% X, 55–70% Y]: >50% match to #ECE5D8
 *   3. Dark overlay [3–12% X, 40–55% Y]: average brightness < 40
 */
function detectRewardsScreen(ctx: CanvasRenderingContext2D): boolean {
  // Condition 1 — upper cream zone
  const upper = sampleRect(ctx, 0.43, 0.4, 0.56, 0.52)
  const upperMatches = countColorMatches(upper, CREAM, 15)
  if (upperMatches / (upper.data.length / 4) <= 0.5) return false

  // Condition 2 — lower cream zone (absent in short item panels, present in artifact panels)
  const lower = sampleRect(ctx, 0.43, 0.55, 0.56, 0.7)
  const lowerMatches = countColorMatches(lower, CREAM, 15)
  if (lowerMatches / (lower.data.length / 4) <= 0.5) return false

  // Condition 3 — dark overlay on left edge (dim background outside the panel)
  const dark = sampleRect(ctx, 0.03, 0.4, 0.12, 0.55)
  let totalBrightness = 0
  for (let i = 0; i < dark.data.length; i += 4) {
    totalBrightness += ((dark.data[i] ?? 0) + (dark.data[i + 1] ?? 0) + (dark.data[i + 2] ?? 0)) / 3
  }
  const avgBrightness = totalBrightness / (dark.data.length / 4)
  return avgBrightness < 40
}

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Detect the game screen type from a canvas capture.
 * Returns 'other' when none of the known screen heuristics match.
 *
 * @param canvas  - Full game window capture
 * @param options - Optional hint: `prioritize` runs one detector first (performance optimization)
 */
export function detectScreenType(
  canvas: HTMLCanvasElement,
  options?: { prioritize?: ArtifactScreenType },
): DetectedScreenType {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return 'other'

  // Build cascade order — prioritized type goes first
  const order: ArtifactScreenType[] = ['character', 'inventory', 'rewards']
  const prioritize = options?.prioritize
  if (prioritize) {
    const rest = order.filter((t) => t !== prioritize)
    order.splice(0, order.length, prioritize, ...rest)
  }

  for (const type of order) {
    switch (type) {
      case 'character':
        if (detectCharacterScreen(ctx)) return 'character'
        break
      case 'inventory':
        if (detectInventoryScreen(ctx)) return 'inventory'
        break
      case 'rewards':
        if (detectRewardsScreen(ctx)) return 'rewards'
        break
    }
  }

  return 'other'
}
