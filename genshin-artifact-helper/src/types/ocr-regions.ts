/**
 * Type definitions for region-based OCR
 * Supports multiple screen types (character, inventory, rewards)
 */

import type { PreprocessingOptions } from '@/stores/settings'

/**
 * Game screen types where artifacts can be viewed
 */
export type ScreenType = 'character' | 'inventory' | 'rewards'

/**
 * OCR processing mode for a region
 */
export type OCRMode = 'text' | 'number' | 'mixed'

/**
 * Rectangle coordinates
 */
export interface Rectangle {
  x: number
  y: number
  width: number
  height: number
}

/**
 * OCR region definition
 * Coordinates are stored as percentages (0-1) for resolution independence
 */
export interface OCRRegion {
  /** Region identifier (e.g., 'pieceName', 'mainStatValue') */
  name: string

  /** Position as percentage of image dimensions (0-1) */
  x: number
  y: number
  width: number
  height: number

  /** OCR processing mode for this region */
  ocrMode: OCRMode

  /** Character whitelist for OCR (optional, mode-specific default used if not set) */
  whitelist?: string

  /** Preprocessing overrides specific to this region */
  preprocessingOverrides?: Partial<PreprocessingOptions>

  /** Optional: Position relative to another region (for dynamic layouts) */
  anchorRegion?: string
  offsetX?: number
  offsetY?: number

  /** Optional: Allow this region to be multi-line */
  multiLine?: boolean

  /** Optional: This region may not exist (e.g., substat4 when locked) */
  optional?: boolean
}

/**
 * Complete artifact region layout for a specific screen type
 */
export interface ArtifactRegionLayout {
  /** Screen type this layout is for */
  screenType: ScreenType

  /** Human-readable description */
  description: string

  /** Unique identifier for this layout */
  id: string

  /** Game resolution this template was designed for (for reference) */
  referenceResolution?: {
    width: number
    height: number
  }

  /** Expected center of first (leftmost) star in screen %, used as anchor for all region offsets */
  anchorPoint?: { x: number; y: number }

  /** All text regions to process (coordinates are offsets from anchorPoint in screen %) */
  regions: {
    pieceName: OCRRegion
    slotName: OCRRegion
    mainStatName: OCRRegion
    mainStatValue: OCRRegion
    level: OCRRegion
    substat1: OCRRegion // includes name + value
    substat2: OCRRegion
    substat3: OCRRegion
    substat4: OCRRegion // can be "Unlocked" state
  }

  /** Whether this is a custom user-defined layout */
  custom?: boolean
}

/**
 * Result from OCR processing a single region
 */
export interface RegionOCRResult {
  /** Region identifier */
  regionName: string

  /** Extracted text */
  text: string

  /** OCR confidence (0-1) */
  confidence: number

  /** Actual pixel position where this region was processed */
  position: Rectangle

  /** Processing time for this region (ms) */
  processingTime?: number

  /** Preprocessed canvas that was sent to the OCR engine (for debugging/preview) */
  preprocessedCanvas?: HTMLCanvasElement
}

/**
 * Star detection result (for rarity and anchoring)
 */
export interface StarDetectionResult {
  /** Number of stars detected (3, 4, or 5) */
  count: 3 | 4 | 5

  /** Position of the star row (top-left corner) */
  position: {
    x: number
    y: number
  }

  /** Detection confidence (0-1) */
  confidence: number

  /** Width and height of star region */
  bounds?: {
    width: number
    height: number
  }
}
/**
 * Options for region-based OCR processing
 */
export interface RegionOCROptions {
  /** Process regions in parallel for better performance */
  parallelProcessing?: boolean

  /** Skip optional regions that may not exist */
  skipOptional?: boolean

  /** Maximum time to spend on each region (ms) */
  timeoutPerRegion?: number

  /** Enable debug mode (saves intermediate images) */
  debug?: boolean
}

/**
 * Complete result from region-based OCR processing
 */
export interface RegionBasedOCRResult {
  /** Results for each region */
  regions: RegionOCRResult[]

  /** Detected screen type */
  screenType: ScreenType

  /** Layout used for processing */
  layout: ArtifactRegionLayout

  /** Star detection result (if anchor was used) */
  starDetection?: StarDetectionResult

  /** Overall confidence (average of all regions) */
  overallConfidence: number

  /** Total processing time (ms) */
  totalProcessingTime: number

  /** Any warnings or issues encountered */
  warnings: string[]
}

/**
 * Character whitelist presets for different OCR modes
 */
export const OCR_WHITELISTS: Record<OCRMode, string> = {
  number: '0123456789.+', // Numbers and decimal point only
  text: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz ,\'-.', // Letters and basic punctuation
  mixed: '0123456789.%+ ATKHPDEFCRITRateDmgElementalMasteryEnergyRchg', // Stats with values
}

/**
 * Region name constants for type safety
 */
export const REGION_NAMES = {
  PIECE_NAME: 'pieceName',
  SLOT_NAME: 'slotName',
  MAIN_STAT_NAME: 'mainStatName',
  MAIN_STAT_VALUE: 'mainStatValue',
  LEVEL: 'level',
  SUBSTAT_1: 'substat1',
  SUBSTAT_2: 'substat2',
  SUBSTAT_3: 'substat3',
  SUBSTAT_4: 'substat4',
} as const
