/**
 * Shared types and settings for star detection
 */

export interface StarCenterFinderContext {
  data: Uint8ClampedArray
  width: number
  height: number
  cellX: number
  cellY: number
  gridSize: number
  firstMatchX: number
  firstMatchY: number
  settings: StarDetectionSettings
}

export type StarCenterFinderFn = (ctx: StarCenterFinderContext) => { x: number; y: number } | null

export type StarDetectorFn = (
  data: Uint8ClampedArray,
  width: number,
  height: number,
  screenHeight: number,
  settings: StarDetectionSettings,
  /** Optional pixel bounds to constrain the search region (already converted from fractions) */
  bounds?: { xMin: number; xMax: number; yMin: number; yMax: number },
) => { center: { x: number; y: number }; count: number } | null

export interface StarDetectionSettings {
  starColorR: number
  starColorG: number
  starColorB: number
  colorTolerance: number
  gridSizePercent: number
  starSizePercent: number
  starDistancePercent: number
  pass1SamplePercent: number
  pass1MatchThreshold: number
  pass2SamplePercent: number
  pass2MatchThreshold: number
  pass3SamplePercent: number
  pass3MatchThreshold: number
  confirmThreshold: number
  // Projection algorithm thresholds (all widths/heights as % of screenHeight)
  projColMinPercent: number
  projColMaxPercent: number
  projColMinPixels: number
  projRowMinPercent: number
  projRowMaxPercent: number
  projSpacingTolerance: number
  projYWindowPx: number
}

export const defaultStarDetectionSettings: StarDetectionSettings = {
  starColorR: 255,
  starColorG: 204,
  starColorB: 50,
  colorTolerance: 5,
  gridSizePercent: 0.0305,
  starSizePercent: 0.025,
  starDistancePercent: 0.03,
  pass1SamplePercent: 0.20,
  pass1MatchThreshold: 0.13,
  pass2SamplePercent: 0.50,
  pass2MatchThreshold: 0.44,
  pass3SamplePercent: 1,
  pass3MatchThreshold: 1,
  confirmThreshold: 0.92,
  projColMinPercent: 0.020,
  projColMaxPercent: 0.050,
  projColMinPixels: 2,
  projRowMinPercent: 0.018,
  projRowMaxPercent: 0.038,
  projSpacingTolerance: 0.20,
  projYWindowPx: 2,
}

export interface StarDetectionDebugBlock {
  x: number
  y: number
  size: number
  matchRatio: number
  isPass1Match: boolean
  isPass2Match: boolean
  isPass3Match: boolean
  isConfirmed: boolean
}

export interface StarDetectionDebugData {
  detectedCenter: { x: number; y: number } | null
  starCount: number | null
  /** legacy: grid cell size; projection: 0 */
  gridSize: number
  /** legacy: grid blocks; projection: [] */
  blocks: StarDetectionDebugBlock[]
  /** Star-colored pixel count per column (length = image width) */
  columnHistogram: number[]
  /** Star-colored pixel count per row (length = image height) */
  rowHistogram: number[]
  // Projection-specific (null when using legacy detector)
  projColumnRegions: Array<{ start: number; end: number }> | null
  projConstrainedRowHistogram: number[] | null
  projRowRegions: Array<{ start: number; end: number }> | null
  projPeakY: number | null
  /** Final star regions after step 7 confirmation + spacing validation */
  projStarRegions: Array<{ start: number; end: number }> | null
}

/**
 * Check if a color matches the star color within tolerance.
 * Exported for use by algorithm modules.
 */
export function isStarColor(r: number, g: number, b: number, settings: StarDetectionSettings): boolean {
  return (
    Math.abs(r - settings.starColorR) <= settings.colorTolerance &&
    Math.abs(g - settings.starColorG) <= settings.colorTolerance &&
    Math.abs(b - settings.starColorB) <= settings.colorTolerance
  )
}
