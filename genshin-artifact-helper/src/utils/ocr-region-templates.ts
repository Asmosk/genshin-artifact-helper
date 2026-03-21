/**
 * Region templates for different screen types
 * All region x,y values are offsets from the detected first-star anchor point (screen %).
 * Pixel position: x = anchorPx.x + region.x * imageWidth
 */

import type { ArtifactRegionLayout, ArtifactScreenType, OCRRegion, PreprocessingOptions } from '@/types/ocr-regions'
import { REGION_NAMES } from '@/types/ocr-regions'
import {
  CHARACTER_CALIBRATED,
  INVENTORY_CALIBRATED,
  REWARDS_CALIBRATED,
} from '@/generated/ocr-region-calibration'

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
  invert: false,
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
  starSearchBounds: { xMin: 0.685, xMax: 0.82, yMin: 0.25, yMax: 0.4 },

  regions: {
    pieceName: createRegion(
      REGION_NAMES.PIECE_NAME,
      INVENTORY_CALIBRATED.pieceName.x, INVENTORY_CALIBRATED.pieceName.y,
      INVENTORY_CALIBRATED.pieceName.width, INVENTORY_CALIBRATED.pieceName.height,
      'text',
    ),

    slotName: createRegion(REGION_NAMES.SLOT_NAME,
      INVENTORY_CALIBRATED.slotName.x, INVENTORY_CALIBRATED.slotName.y,
      INVENTORY_CALIBRATED.slotName.width, INVENTORY_CALIBRATED.slotName.height,
      'text',
    ),

    level: createRegion(
      REGION_NAMES.LEVEL,
      INVENTORY_CALIBRATED.level.x, INVENTORY_CALIBRATED.level.y,
      INVENTORY_CALIBRATED.level.width, INVENTORY_CALIBRATED.level.height,
      'number',
      {
        preprocessingOverrides: {
          genshinOptimized: true,
          backgroundThreshold: 230,
        }
      },
    ),

    mainStatName: createRegion(REGION_NAMES.MAIN_STAT_NAME,
      INVENTORY_CALIBRATED.mainStatName.x, INVENTORY_CALIBRATED.mainStatName.y,
      INVENTORY_CALIBRATED.mainStatName.width, INVENTORY_CALIBRATED.mainStatName.height,
      'text',
    ),

    mainStatValue: createRegion(REGION_NAMES.MAIN_STAT_VALUE,
      INVENTORY_CALIBRATED.mainStatValue.x, INVENTORY_CALIBRATED.mainStatValue.y,
      INVENTORY_CALIBRATED.mainStatValue.width, INVENTORY_CALIBRATED.mainStatValue.height,
      'mixed',
    ),

    substat1: createRegion(REGION_NAMES.SUBSTAT_1,
      INVENTORY_CALIBRATED.substat1.x, INVENTORY_CALIBRATED.substat1.y,
      INVENTORY_CALIBRATED.substat1.width, INVENTORY_CALIBRATED.substat1.height,
      'mixed',
      {
        optional: true,
        preprocessingOverrides: {
          grayscale: true,
        }
      },
    ),
    substat2: createRegion(REGION_NAMES.SUBSTAT_2,
      INVENTORY_CALIBRATED.substat2.x, INVENTORY_CALIBRATED.substat2.y,
      INVENTORY_CALIBRATED.substat2.width, INVENTORY_CALIBRATED.substat2.height,
      'mixed',
      {
        optional: true,
        preprocessingOverrides: {
          grayscale: true,
        }
      },
    ),
    substat3: createRegion(REGION_NAMES.SUBSTAT_3,
      INVENTORY_CALIBRATED.substat3.x, INVENTORY_CALIBRATED.substat3.y,
      INVENTORY_CALIBRATED.substat3.width, INVENTORY_CALIBRATED.substat3.height,
      'mixed',
      {
        optional: true,
        preprocessingOverrides: {
          grayscale: true,
        }
      },
    ),
    substat4: createRegion(REGION_NAMES.SUBSTAT_4,
      INVENTORY_CALIBRATED.substat4.x, INVENTORY_CALIBRATED.substat4.y,
      INVENTORY_CALIBRATED.substat4.width, INVENTORY_CALIBRATED.substat4.height,
      'mixed',
      {
        optional: true,
        preprocessingOverrides: {
          grayscale: true,
        }
      }
    ),
    substat4SecondLine: createRegion(REGION_NAMES.SUBSTAT_4_2,
      INVENTORY_CALIBRATED.substat4SecondLine.x, INVENTORY_CALIBRATED.substat4SecondLine.y,
      INVENTORY_CALIBRATED.substat4SecondLine.width, INVENTORY_CALIBRATED.substat4SecondLine.height,
      'mixed',
      {
        optional: true,
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
  // xMin=0.68 excludes the equipped artifact column in comparison mode (~53–63% imageWidth)
  starSearchBounds: { xMin: 0.75, xMax: 0.88, yMin: 0.20, yMax: 0.35 },

  regions: {
    pieceName: createRegion(
      REGION_NAMES.PIECE_NAME,
      CHARACTER_CALIBRATED.pieceName.x, CHARACTER_CALIBRATED.pieceName.y,
      CHARACTER_CALIBRATED.pieceName.width, CHARACTER_CALIBRATED.pieceName.height,
      'text',
      {
        preprocessingOverrides: {
          genshinOptimized: true,
          backgroundThreshold: 230,
        }
      },
    ),

    slotName: createRegion(REGION_NAMES.SLOT_NAME,
      CHARACTER_CALIBRATED.slotName.x, CHARACTER_CALIBRATED.slotName.y,
      CHARACTER_CALIBRATED.slotName.width, CHARACTER_CALIBRATED.slotName.height,
      'text',
      {
        preprocessingOverrides: {
          genshinOptimized: true,
          backgroundThreshold: 190,
        }
      },
    ),

    level: createRegion(
      REGION_NAMES.LEVEL,
      CHARACTER_CALIBRATED.level.x, CHARACTER_CALIBRATED.level.y,
      CHARACTER_CALIBRATED.level.width, CHARACTER_CALIBRATED.level.height,
      'number',
      {
        preprocessingOverrides: {
          genshinOptimized: true,
          backgroundThreshold: 230,
        }
      },
    ),

    mainStatName: createRegion(REGION_NAMES.MAIN_STAT_NAME,
      CHARACTER_CALIBRATED.mainStatName.x, CHARACTER_CALIBRATED.mainStatName.y,
      CHARACTER_CALIBRATED.mainStatName.width, CHARACTER_CALIBRATED.mainStatName.height,
      'text',
      {
        preprocessingOverrides: {
          genshinOptimized: true,
          backgroundThreshold: 250,
        }
      },
    ),

    mainStatValue: createRegion(REGION_NAMES.MAIN_STAT_VALUE,
      CHARACTER_CALIBRATED.mainStatValue.x, CHARACTER_CALIBRATED.mainStatValue.y,
      CHARACTER_CALIBRATED.mainStatValue.width, CHARACTER_CALIBRATED.mainStatValue.height,
      'mixed',
      {
        preprocessingOverrides: {
          genshinOptimized: true,
          backgroundThreshold: 250,
        }
      },
    ),

    substat1: createRegion(REGION_NAMES.SUBSTAT_1,
      CHARACTER_CALIBRATED.substat1.x, CHARACTER_CALIBRATED.substat1.y,
      CHARACTER_CALIBRATED.substat1.width, CHARACTER_CALIBRATED.substat1.height,
      'mixed',
      {
        optional: true,
        preprocessingOverrides: {
          grayscale: true,
        }
      },
    ),
    substat2: createRegion(REGION_NAMES.SUBSTAT_2,
      CHARACTER_CALIBRATED.substat2.x, CHARACTER_CALIBRATED.substat2.y,
      CHARACTER_CALIBRATED.substat2.width, CHARACTER_CALIBRATED.substat2.height,
      'mixed',
      {
        optional: true,
        preprocessingOverrides: {
          grayscale: true,
        }
      },
    ),
    substat3: createRegion(REGION_NAMES.SUBSTAT_3,
      CHARACTER_CALIBRATED.substat3.x, CHARACTER_CALIBRATED.substat3.y,
      CHARACTER_CALIBRATED.substat3.width, CHARACTER_CALIBRATED.substat3.height,
      'mixed',
      {
        optional: true,
        preprocessingOverrides: {
          grayscale: true,
        }
      },
    ),
    substat4: createRegion(REGION_NAMES.SUBSTAT_4,
      CHARACTER_CALIBRATED.substat4.x, CHARACTER_CALIBRATED.substat4.y,
      CHARACTER_CALIBRATED.substat4.width, CHARACTER_CALIBRATED.substat4.height,
      'mixed',
      {
        optional: true,
        preprocessingOverrides: {
          grayscale: true,
        }
      }
    ),
    substat4SecondLine: createRegion(REGION_NAMES.SUBSTAT_4_2,
      CHARACTER_CALIBRATED.substat4SecondLine.x, CHARACTER_CALIBRATED.substat4SecondLine.y,
      CHARACTER_CALIBRATED.substat4SecondLine.width, CHARACTER_CALIBRATED.substat4SecondLine.height,
      'mixed',
      {
        optional: true,
        preprocessingOverrides: {
          grayscale: true,
        }
      }
    ),
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
  // Center panel where reward artifact stars appear
  starSearchBounds: { xMin: 0.38, xMax: 0.5, yMin: 0.15, yMax: 0.55 },

  regions: {
    pieceName: createRegion(
      REGION_NAMES.PIECE_NAME,
      REWARDS_CALIBRATED.pieceName.x, REWARDS_CALIBRATED.pieceName.y,
      REWARDS_CALIBRATED.pieceName.width, REWARDS_CALIBRATED.pieceName.height,
      'text',
    ),

    slotName: createRegion(REGION_NAMES.SLOT_NAME,
      REWARDS_CALIBRATED.slotName.x, REWARDS_CALIBRATED.slotName.y,
      REWARDS_CALIBRATED.slotName.width, REWARDS_CALIBRATED.slotName.height,
      'text',
    ),

    level: createRegion(
      REGION_NAMES.LEVEL,
      REWARDS_CALIBRATED.level.x, REWARDS_CALIBRATED.level.y,
      REWARDS_CALIBRATED.level.width, REWARDS_CALIBRATED.level.height,
      'number',
      {
        preprocessingOverrides: {
          genshinOptimized: true,
          backgroundThreshold: 230,
        }
      },
    ),

    mainStatName: createRegion(REGION_NAMES.MAIN_STAT_NAME,
      REWARDS_CALIBRATED.mainStatName.x, REWARDS_CALIBRATED.mainStatName.y,
      REWARDS_CALIBRATED.mainStatName.width, REWARDS_CALIBRATED.mainStatName.height,
      'text',
    ),

    mainStatValue: createRegion(REGION_NAMES.MAIN_STAT_VALUE,
      REWARDS_CALIBRATED.mainStatValue.x, REWARDS_CALIBRATED.mainStatValue.y,
      REWARDS_CALIBRATED.mainStatValue.width, REWARDS_CALIBRATED.mainStatValue.height,
      'mixed',
    ),

    substat1: createRegion(REGION_NAMES.SUBSTAT_1,
      REWARDS_CALIBRATED.substat1.x, REWARDS_CALIBRATED.substat1.y,
      REWARDS_CALIBRATED.substat1.width, REWARDS_CALIBRATED.substat1.height,
      'mixed',
      {
        optional: true,
        preprocessingOverrides: {
          grayscale: true,
        }
      },
    ),
    substat2: createRegion(REGION_NAMES.SUBSTAT_2,
      REWARDS_CALIBRATED.substat2.x, REWARDS_CALIBRATED.substat2.y,
      REWARDS_CALIBRATED.substat2.width, REWARDS_CALIBRATED.substat2.height,
      'mixed',
      {
        optional: true,
        preprocessingOverrides: {
          grayscale: true,
        }
      },
    ),
    substat3: createRegion(REGION_NAMES.SUBSTAT_3,
      REWARDS_CALIBRATED.substat3.x, REWARDS_CALIBRATED.substat3.y,
      REWARDS_CALIBRATED.substat3.width, REWARDS_CALIBRATED.substat3.height,
      'mixed',
      {
        optional: true,
        preprocessingOverrides: {
          grayscale: true,
        }
      },
    ),
    substat4: createRegion(REGION_NAMES.SUBSTAT_4,
      REWARDS_CALIBRATED.substat4.x, REWARDS_CALIBRATED.substat4.y,
      REWARDS_CALIBRATED.substat4.width, REWARDS_CALIBRATED.substat4.height,
      'mixed',
      {
        optional: true,
        preprocessingOverrides: {
          grayscale: true,
        }
      }
    ),
    substat4SecondLine: createRegion(REGION_NAMES.SUBSTAT_4_2,
      INVENTORY_CALIBRATED.substat4SecondLine.x, INVENTORY_CALIBRATED.substat4SecondLine.y,
      INVENTORY_CALIBRATED.substat4SecondLine.width, INVENTORY_CALIBRATED.substat4SecondLine.height,
      'mixed',
      {
        optional: true,
        preprocessingOverrides: {
          grayscale: true,
        }
      }
    ),
  },
}

/**
 * All predefined region templates
 */
export const REGION_TEMPLATES: Record<ArtifactScreenType, ArtifactRegionLayout> = {
  inventory: INVENTORY_LAYOUT,
  character: CHARACTER_LAYOUT,
  rewards: REWARDS_LAYOUT,
}

/**
 * Get a region template by screen type
 */
export function getRegionTemplate(screenType: ArtifactScreenType): ArtifactRegionLayout {
  return REGION_TEMPLATES[screenType]
}
/**
 * Genshin Impact's UI scales all panel dimensions with effectiveHeight,
 * defined as the height of the largest 16:9 viewport that fits in the image.
 * Template coordinates are fractions of effectiveRefWidth / effectiveHeight.
 */
const GAME_MIN_ASPECT_RATIO = 16 / 9

/**
 * Calculate absolute pixel coordinates from anchor-relative region definition.
 * Template x/y values are fractions of effectiveRefWidth/effectiveHeight respectively.
 */
export function calculateRegionPosition(
  region: OCRRegion,
  imageWidth: number,
  imageHeight: number,
  anchorPx: { x: number; y: number },
  layout: ArtifactRegionLayout,
): { x: number; y: number; width: number; height: number } {
  const effectiveHeight = Math.min(imageHeight, imageWidth / GAME_MIN_ASPECT_RATIO)
  const refRes = layout.referenceResolution ?? { width: 3440, height: 1440 }
  const effectiveRefWidth = effectiveHeight * (refRes.width / refRes.height)
  return {
    x: Math.floor(anchorPx.x + region.x * effectiveRefWidth),
    y: Math.floor(anchorPx.y + region.y * effectiveHeight),
    width: Math.ceil(region.width * effectiveRefWidth),
    height: Math.ceil(region.height * effectiveHeight),
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
    positions.set(region.name, calculateRegionPosition(region, imageWidth, imageHeight, anchorPx, layout))
  }

  return positions
}
