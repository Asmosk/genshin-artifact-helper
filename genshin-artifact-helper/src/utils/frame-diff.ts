/**
 * Frame change detection for the auto-pipeline.
 * Samples a horizontal center line through each provided region and compares
 * pixel values between two frames to decide if the content has changed.
 */

import type { Rectangle } from '@/types/ocr-regions'

export interface DiffOptions {
  /** Per-channel color distance threshold (0-255). Default: 30 */
  threshold?: number
  /** Fraction of sampled pixels that must differ to count as changed. Default: 0.15 */
  changeRatio?: number
}

/** Minimal ImageData shape — allows passing plain objects in tests */
export interface ImageDataLike {
  data: Uint8ClampedArray | number[]
  width: number
  height: number
}

/**
 * Determines whether the artifact panel has changed between two frames by
 * sampling a horizontal center line through each provided region.
 *
 * @param current  - Pixel snapshot of the current frame
 * @param previous - Pixel snapshot of the previous frame, or null for the first frame
 * @param regions  - Absolute pixel regions to sample (e.g. OCR region bounding boxes)
 * @param options  - Tuning parameters
 * @returns true if enough pixels changed to warrant a new OCR pass
 */
export function hasFrameChanged(
  current: ImageDataLike,
  previous: ImageDataLike | null,
  regions: Rectangle[],
  options?: DiffOptions,
): boolean {
  if (previous === null) return true

  const threshold = options?.threshold ?? 30
  const changeRatio = options?.changeRatio ?? 0.15

  const w = current.width
  let totalSampled = 0
  let totalDiff = 0

  for (const region of regions) {
    const centerY = Math.floor(region.y + region.height / 2)
    if (centerY < 0 || centerY >= current.height) continue

    const xStart = Math.max(0, Math.floor(region.x))
    const xEnd = Math.min(current.width - 1, Math.floor(region.x + region.width))

    for (let x = xStart; x <= xEnd; x++) {
      const idx = (centerY * w + x) * 4
      const dr = Math.abs((current.data[idx] ?? 0) - (previous.data[idx] ?? 0))
      const dg = Math.abs((current.data[idx + 1] ?? 0) - (previous.data[idx + 1] ?? 0))
      const db = Math.abs((current.data[idx + 2] ?? 0) - (previous.data[idx + 2] ?? 0))
      if (Math.max(dr, dg, db) > threshold) {
        totalDiff++
      }
      totalSampled++
    }
  }

  if (totalSampled === 0) return false
  return totalDiff / totalSampled > changeRatio
}
