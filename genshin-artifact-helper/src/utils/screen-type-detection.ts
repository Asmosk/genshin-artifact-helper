/**
 * Screen type auto-detection using pixel-level heuristics.
 * Distinguishes inventory / character / rewards screens without OCR.
 */

import type { ScreenType } from '@/types/ocr-regions'

// Maximum normalized X position for the rewards star column (left half)
const COLUMN_REWARDS_MAX_X = 0.6

// Y offset below star center to probe for the inventory background colour
const INVENTORY_PROBE_Y_OFFSET = 0.045

// #ECE5D8 — the cream background of the inventory artifact panel
const INVENTORY_BG = { r: 236, g: 229, b: 216 }

const COLOR_TOLERANCE = 2

// Half-width of the horizontal pixel strip sampled for the colour probe
const PROBE_HALF_WIDTH = 5

// ─── Internal helpers ──────────────────────────────────────────────────────────

interface RGB {
  r: number
  g: number
  b: number
}

/**
 * Read a horizontal strip of pixels centred at (x, y), clamped to canvas bounds.
 */
function sampleStrip(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  halfWidth: number,
): RGB[] {
  const canvasWidth = ctx.canvas.width
  const canvasHeight = ctx.canvas.height

  const left = Math.max(0, Math.round(x) - halfWidth)
  const right = Math.min(canvasWidth - 1, Math.round(x) + halfWidth)
  const py = Math.max(0, Math.min(canvasHeight - 1, Math.round(y)))
  const stripWidth = right - left + 1

  if (stripWidth <= 0) return []

  const imageData = ctx.getImageData(left, py, stripWidth, 1)
  const pixels: RGB[] = []
  for (let i = 0; i < stripWidth; i++) {
    const offset = i * 4
    pixels.push({
      r: imageData.data[offset] ?? 0,
      g: imageData.data[offset + 1] ?? 0,
      b: imageData.data[offset + 2] ?? 0,
    })
  }
  return pixels
}

/**
 * Return true when a pixel is within ±COLOR_TOLERANCE of the inventory background colour.
 */
function matchesInventoryBg(pixel: RGB): boolean {
  return (
    Math.abs(pixel.r - INVENTORY_BG.r) <= COLOR_TOLERANCE &&
    Math.abs(pixel.g - INVENTORY_BG.g) <= COLOR_TOLERANCE &&
    Math.abs(pixel.b - INVENTORY_BG.b) <= COLOR_TOLERANCE
  )
}

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Classify the screen type from an already-located star anchor point.
 *
 * Decision tree:
 *  1. starX / imageWidth < 0.60  →  'rewards'   (stars are in the left half)
 *  2. Probe pixel strip at starY + 4.5% of height:
 *       >50% match #ECE5D8  →  'inventory'
 *       otherwise           →  'character'
 */
export function detectScreenType(
  canvas: HTMLCanvasElement,
  starAnchor: { x: number; y: number },
  imageWidth: number,
  imageHeight: number,
): ScreenType {
  // Step 1 — column split
  if (starAnchor.x / imageWidth < COLUMN_REWARDS_MAX_X) {
    return 'rewards'
  }

  // Step 2 — colour probe to distinguish inventory from character
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return 'inventory' // safe fallback

  const probeY = starAnchor.y + INVENTORY_PROBE_Y_OFFSET * imageHeight
  const pixels = sampleStrip(ctx, starAnchor.x, probeY, PROBE_HALF_WIDTH)

  if (pixels.length === 0) return 'inventory'

  const matchCount = pixels.filter(matchesInventoryBg).length
  return matchCount / pixels.length > 0.5 ? 'inventory' : 'character'
}
