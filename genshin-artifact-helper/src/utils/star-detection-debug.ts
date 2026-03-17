/**
 * Debug utilities for star detection — assembles StarDetectionDebugData
 * from both algorithm debug helpers.
 */

import {
  isStarColor,
  type StarDetectorFn,
  type StarDetectionSettings,
  type StarDetectionDebugData,
  defaultStarDetectionSettings,
} from '@/utils/star-detection-types'
import { legacyStarDetector, debugLegacyDetect } from '@/utils/star-detection-legacy'
import { projectionStarDetector, debugProjectionDetect } from '@/utils/star-detection-projection'

function computeColorProjections(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  settings: StarDetectionSettings,
): { columnHistogram: number[]; rowHistogram: number[] } {
  const columnHistogram = new Array<number>(width).fill(0)
  const rowHistogram = new Array<number>(height).fill(0)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4
      if (isStarColor(data[idx] ?? 0, data[idx + 1] ?? 0, data[idx + 2] ?? 0, settings)) {
        columnHistogram[x] = (columnHistogram[x] ?? 0) + 1
        rowHistogram[y] = (rowHistogram[y] ?? 0) + 1
      }
    }
  }
  return { columnHistogram, rowHistogram }
}

/**
 * Run the star-detection algorithm in full debug mode.
 * Returns all grid blocks that contained at least one star-coloured pixel,
 * plus the first confirmed star-centre and neighbour count.
 * When using the projection detector, returns projection-specific debug data instead.
 */
export function debugDetectStars(
  canvas: HTMLCanvasElement,
  screenHeight: number,
  settings: StarDetectionSettings = defaultStarDetectionSettings,
  detector: StarDetectorFn = legacyStarDetector,
): StarDetectionDebugData {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  const emptyResult: StarDetectionDebugData = {
    gridSize: 0,
    blocks: [],
    detectedCenter: null,
    starCount: null,
    columnHistogram: [],
    rowHistogram: [],
    projColumnRegions: null,
    projConstrainedRowHistogram: null,
    projRowRegions: null,
    projPeakY: null,
    projStarRegions: null,
  }
  if (!ctx) return emptyResult

  const width = canvas.width
  const height = canvas.height
  const imageData = ctx.getImageData(0, 0, width, height)
  const data = imageData.data

  const { columnHistogram, rowHistogram } = computeColorProjections(data, width, height, settings)

  // ── Projection path ──────────────────────────────────────────────────────────
  if (detector === projectionStarDetector) {
    const proj = debugProjectionDetect(data, width, height, screenHeight, settings)
    return {
      gridSize: 0,
      blocks: [],
      detectedCenter: proj.result?.center ?? null,
      starCount: proj.result?.count ?? null,
      columnHistogram,
      rowHistogram,
      projColumnRegions: proj.colRegions,
      projConstrainedRowHistogram: proj.constrainedRowHist,
      projRowRegions: proj.rowRegions,
      projPeakY: proj.peakY,
      projStarRegions: proj.validatedRegions,
    }
  }

  // ── Legacy grid debug path ───────────────────────────────────────────────────
  const { gridSize, blocks, detectedCenter, starCount } = debugLegacyDetect(
    data, width, height, screenHeight, settings, detector,
  )

  return {
    gridSize,
    blocks,
    detectedCenter,
    starCount,
    columnHistogram,
    rowHistogram,
    projColumnRegions: null,
    projConstrainedRowHistogram: null,
    projRowRegions: null,
    projPeakY: null,
    projStarRegions: null,
  }
}
