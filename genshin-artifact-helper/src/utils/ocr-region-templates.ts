/**
 * Region templates for different screen types
 * All region x,y values are offsets from the detected first-star anchor point (screen %).
 * Pixel position: x = anchorPx.x + region.x * imageWidth
 */

import type { ArtifactRegionLayout, ScreenType, OCRRegion, PreprocessingOptions } from '@/types/ocr-regions'
import { REGION_NAMES } from '@/types/ocr-regions'

/**
 * Default preprocessing applied to every region unless overridden.
 * This is the ground truth for all region preprocessing settings.
 * Exported so the debug panel can initialize controls to matching values.
 */
export const DEFAULT_PREPROCESSING: PreprocessingOptions = {
  grayscale: false,
  enhanceContrast: false,
  contrastFactor: 1.8,
  denoise: false,
  sharpen: false,
  adaptive: false,
  adaptiveBlockSize: 11,
  upscale: false,
  scaleFactor: 2,
  genshinOptimized: false,
  backgroundThreshold: 160,
}

/**
 * Helper to create a region definition
 */
function createRegion(
  name: string,
  x: number,
  y: number,
  width: number,
  height: number,
  ocrMode: OCRRegion['ocrMode'],
  options: Partial<OCRRegion> = {},
): OCRRegion {
  return {
    name,
    x,
    y,
    width,
    height,
    ocrMode,
    ...options,
  }
}

/**
 * Inventory Screen Layout
 * All region x,y are offsets from the detected star anchor in screen %
 */
const INVENTORY_LAYOUT: ArtifactRegionLayout = {
  id: 'inventory-default',
  screenType: 'inventory',
  description: 'Standard inventory screen artifact view',
  referenceResolution: {
    width: 3440,
    height: 1440,
  },
  defaultPreprocessingOptions: DEFAULT_PREPROCESSING,

  regions: {
    pieceName: createRegion(
      REGION_NAMES.PIECE_NAME,
      -0.01, -0.2328, 0.182, 0.048,
      'text',
    ),

    slotName: createRegion(REGION_NAMES.SLOT_NAME,
      -0.009, -0.172, 0.125, 0.03,
      'text',
      { whitelist: 'FloweriPumDathSnGbC ' },
    ),

    level: createRegion(
      REGION_NAMES.LEVEL,
      -0.006, 0.046, 0.028, 0.036,
      'mixed',
      {
        whitelist: '+0123456789',
        preprocessingOverrides: {
          genshinOptimized: true,
          backgroundThreshold: 230,
        }
      },
    ),

    mainStatName: createRegion(REGION_NAMES.MAIN_STAT_NAME,
      -0.008, -0.100, 0.104, 0.033,
      'text',
      { whitelist: 'ATKDEFCRImgnyhlsBouP ' },
    ),

    mainStatValue: createRegion(REGION_NAMES.MAIN_STAT_VALUE,
      -0.007, -0.073, 0.077, 0.05,
      'mixed', {
      whitelist: '0123456789.%'
    }),

    substat1: createRegion(REGION_NAMES.SUBSTAT_1,
      0.004, 0.092, 0.162, 0.04,
      'mixed',
      {
        whitelist: '0123456789.ATKDEF%CRI mgnyhls+',
        preprocessingOverrides: {
          grayscale: true,
        }
      },
    ),
    substat2: createRegion(REGION_NAMES.SUBSTAT_2,
      0.004, 0.127, 0.162, 0.04,
      'mixed',
      {
        whitelist: '0123456789.ATKDEF%CRI mgnyhls+',
        preprocessingOverrides: {
          grayscale: true,
        }
      },
    ),
    substat3: createRegion(REGION_NAMES.SUBSTAT_3,
      0.004, 0.163, 0.162, 0.04,
      'mixed',
      {
        whitelist: '0123456789.ATKDEF%CRI mgnyhls+',
        preprocessingOverrides: {
          grayscale: true,
        }
      },
    ),
    substat4: createRegion(REGION_NAMES.SUBSTAT_4,
      0.004, 0.199, 0.162, 0.046,
      'mixed',
      {
        optional: true,
        multiLine: true,
        whitelist: '0123456789.ATKDEF%CRI mgnyhls+',
        preprocessingOverrides: {
          grayscale: true,
        }
      }
    ),
  },
}

/**
 * Character Screen Layout
 */
const CHARACTER_LAYOUT: ArtifactRegionLayout = {
  id: 'character-default',
  screenType: 'character',
  description: 'Character equipment screen artifact view',
  referenceResolution: {
    width: 3440,
    height: 1440,
  },
  defaultPreprocessingOptions: DEFAULT_PREPROCESSING,

  regions: {
    pieceName: createRegion(
      REGION_NAMES.PIECE_NAME,
      -0.030, -0.085, 0.22, 0.07,
      'text',
      {
        multiLine: true,
        preprocessingOverrides: {
          adaptive: true,
          contrastFactor: 2.0,
        },
      },
    ),

    slotName: createRegion(REGION_NAMES.SLOT_NAME, -0.030, 0.025, 0.18, 0.03, 'text'),

    level: createRegion(
      REGION_NAMES.LEVEL,
      0.140, -0.085, 0.06, 0.03,
      'mixed',
      { whitelist: '+0123456789' },
    ),

    mainStatName: createRegion(REGION_NAMES.MAIN_STAT_NAME, -0.030, 0.085, 0.18, 0.03, 'text'),

    mainStatValue: createRegion(
      REGION_NAMES.MAIN_STAT_VALUE,
      -0.030, 0.125, 0.12, 0.04,
      'mixed',
      {
        whitelist: '0123456789.%+',
        preprocessingOverrides: {
          upscale: true,
          scaleFactor: 2,
        },
      },
    ),

    substat1: createRegion(REGION_NAMES.SUBSTAT_1, -0.030, 0.205, 0.22, 0.035, 'mixed'),
    substat2: createRegion(REGION_NAMES.SUBSTAT_2, -0.030, 0.255, 0.22, 0.035, 'mixed'),
    substat3: createRegion(REGION_NAMES.SUBSTAT_3, -0.030, 0.305, 0.22, 0.035, 'mixed'),
    substat4: createRegion(REGION_NAMES.SUBSTAT_4, -0.030, 0.355, 0.22, 0.035, 'mixed', {
      optional: true,
      multiLine: true,
    }),
  },
}

/**
 * Rewards Screen Layout
 */
const REWARDS_LAYOUT: ArtifactRegionLayout = {
  id: 'rewards-default',
  screenType: 'rewards',
  description: 'Rewards/Domain completion screen artifact view',
  referenceResolution: {
    width: 3440,
    height: 1440,
  },
  defaultPreprocessingOptions: DEFAULT_PREPROCESSING,

  regions: {
    pieceName: createRegion(
      REGION_NAMES.PIECE_NAME,
      -0.040, -0.115, 0.25, 0.08,
      'text',
      {
        multiLine: true,
        preprocessingOverrides: {
          adaptive: true,
          contrastFactor: 2.0,
        },
      },
    ),

    slotName: createRegion(REGION_NAMES.SLOT_NAME, -0.040, 0.025, 0.20, 0.03, 'text'),

    level: createRegion(
      REGION_NAMES.LEVEL,
      0.160, -0.115, 0.07, 0.04,
      'mixed',
      { whitelist: '+0123456789' },
    ),

    mainStatName: createRegion(REGION_NAMES.MAIN_STAT_NAME, -0.040, 0.085, 0.20, 0.04, 'text'),

    mainStatValue: createRegion(
      REGION_NAMES.MAIN_STAT_VALUE,
      -0.040, 0.135, 0.15, 0.05,
      'mixed',
      {
        whitelist: '0123456789.%+',
        preprocessingOverrides: {
          upscale: true,
          scaleFactor: 2,
        },
      },
    ),

    substat1: createRegion(REGION_NAMES.SUBSTAT_1, -0.040, 0.225, 0.25, 0.04, 'mixed'),
    substat2: createRegion(REGION_NAMES.SUBSTAT_2, -0.040, 0.275, 0.25, 0.04, 'mixed'),
    substat3: createRegion(REGION_NAMES.SUBSTAT_3, -0.040, 0.325, 0.25, 0.04, 'mixed'),
    substat4: createRegion(REGION_NAMES.SUBSTAT_4, -0.040, 0.375, 0.25, 0.04, 'mixed', {
      optional: true,
      multiLine: true,
    }),
  },
}

/**
 * All predefined region templates
 */
export const REGION_TEMPLATES: Record<ScreenType, ArtifactRegionLayout> = {
  inventory: INVENTORY_LAYOUT,
  character: CHARACTER_LAYOUT,
  rewards: REWARDS_LAYOUT,
}

/**
 * Get a region template by screen type
 */
export function getRegionTemplate(screenType: ScreenType): ArtifactRegionLayout {
  return REGION_TEMPLATES[screenType]
}
/**
 * Calculate absolute pixel coordinates from anchor-relative region definition.
 * pixelX = anchorPx.x + region.x * imageWidth
 */
export function calculateRegionPosition(
  region: OCRRegion,
  imageWidth: number,
  imageHeight: number,
  anchorPx: { x: number; y: number },
): { x: number; y: number; width: number; height: number } {
  return {
    x: Math.round(anchorPx.x + region.x * imageWidth),
    y: Math.round(anchorPx.y + region.y * imageHeight),
    width: Math.round(region.width * imageWidth),
    height: Math.round(region.height * imageHeight),
  }
}

/**
 * Calculate positions for all regions in a layout.
 * anchorPx is the detected (or template) first-star center in pixels.
 */
export function calculateAllRegionPositions(
  layout: ArtifactRegionLayout,
  imageWidth: number,
  imageHeight: number,
  anchorPx: { x: number; y: number },
): Map<string, { x: number; y: number; width: number; height: number }> {
  const positions = new Map<string, { x: number; y: number; width: number; height: number }>()

  for (const [, region] of Object.entries(layout.regions)) {
    positions.set(region.name, calculateRegionPosition(region, imageWidth, imageHeight, anchorPx))
  }

  return positions
}
