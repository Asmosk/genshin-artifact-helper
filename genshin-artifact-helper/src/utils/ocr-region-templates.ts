/**
 * Region templates for different screen types
 * All region x,y values are offsets from the detected first-star anchor point (screen %).
 * Pixel position: x = anchorPx.x + region.x * imageWidth
 */

import type { ArtifactRegionLayout, ScreenType, OCRRegion } from '@/types/ocr-regions'
import { REGION_NAMES } from '@/types/ocr-regions'

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
 * anchorPoint: expected center of first star = (8.5%, 18.0%) of screen
 * All region x,y are offsets from anchor in screen %
 */
const INVENTORY_LAYOUT: ArtifactRegionLayout = {
  id: 'inventory-default',
  screenType: 'inventory',
  description: 'Standard inventory screen artifact view',
  referenceResolution: {
    width: 3440,
    height: 1440,
  },

  anchorPoint: { x: 0.085, y: 0.180 },

  regions: {
    pieceName: createRegion(
      REGION_NAMES.PIECE_NAME,
      -0.005, -0.100, 0.25, 0.08,
      'text',
      {
        multiLine: true,
        preprocessingOverrides: {
          adaptive: true,
          contrastFactor: 2.0,
        },
      },
    ),

    slotName: createRegion(REGION_NAMES.SLOT_NAME, -0.005, 0.040, 0.20, 0.03, 'text'),

    level: createRegion(
      REGION_NAMES.LEVEL,
      0.165, -0.100, 0.08, 0.04,
      'mixed',
      { whitelist: '+0123456789' },
    ),

    mainStatName: createRegion(REGION_NAMES.MAIN_STAT_NAME, -0.005, 0.100, 0.20, 0.04, 'text'),

    mainStatValue: createRegion(REGION_NAMES.MAIN_STAT_VALUE, -0.005, 0.150, 0.15, 0.05, 'mixed', {
      whitelist: '0123456789.%+',
      preprocessingOverrides: {
        upscale: true,
        scaleFactor: 2,
      },
    }),

    substat1: createRegion(REGION_NAMES.SUBSTAT_1, -0.005, 0.240, 0.25, 0.04, 'mixed'),
    substat2: createRegion(REGION_NAMES.SUBSTAT_2, -0.005, 0.290, 0.25, 0.04, 'mixed'),
    substat3: createRegion(REGION_NAMES.SUBSTAT_3, -0.005, 0.340, 0.25, 0.04, 'mixed'),
    substat4: createRegion(REGION_NAMES.SUBSTAT_4, -0.005, 0.390, 0.25, 0.04, 'mixed', {
      optional: true,
      multiLine: true,
    }),
  },
}

/**
 * Character Screen Layout
 * anchorPoint: expected center of first star = (68.0%, 16.5%) of screen
 */
const CHARACTER_LAYOUT: ArtifactRegionLayout = {
  id: 'character-default',
  screenType: 'character',
  description: 'Character equipment screen artifact view',
  referenceResolution: {
    width: 3440,
    height: 1440,
  },

  anchorPoint: { x: 0.680, y: 0.165 },

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
 * anchorPoint: expected center of first star = (42.0%, 23.5%) of screen
 */
const REWARDS_LAYOUT: ArtifactRegionLayout = {
  id: 'rewards-default',
  screenType: 'rewards',
  description: 'Rewards/Domain completion screen artifact view',
  referenceResolution: {
    width: 3440,
    height: 1440,
  },

  anchorPoint: { x: 0.420, y: 0.235 },

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
 * Get all available region templates
 */
export function getAllRegionTemplates(): ArtifactRegionLayout[] {
  return Object.values(REGION_TEMPLATES)
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

/**
 * Adjust layout for piece names that wrap to multiple lines.
 * When piece name wraps, shift all regions below it down.
 */
export function adjustLayoutForMultilinePieceName(
  layout: ArtifactRegionLayout,
  lineCount: number,
): ArtifactRegionLayout {
  if (lineCount <= 1) return layout

  const shiftAmount = (lineCount - 1) * 0.03 // ~3% per extra line

  const adjusted: ArtifactRegionLayout = {
    ...layout,
    regions: { ...layout.regions },
  }

  const pieceNameBottom = layout.regions.pieceName.y + layout.regions.pieceName.height

  for (const [key, region] of Object.entries(adjusted.regions)) {
    if (region.y > pieceNameBottom) {
      adjusted.regions[key as keyof typeof adjusted.regions] = {
        ...region,
        y: region.y + shiftAmount,
      }
    }
  }

  return adjusted
}

/**
 * Validate that a layout has all required regions
 */
export function validateLayout(layout: ArtifactRegionLayout): { valid: boolean; errors: string[] } {
  const errors: string[] = []
  const requiredRegions = [
    'pieceName',
    'slotName',
    'mainStatName',
    'mainStatValue',
    'level',
    'substat1',
    'substat2',
    'substat3',
    'substat4',
  ]

  for (const required of requiredRegions) {
    if (!(required in layout.regions)) {
      errors.push(`Missing required region: ${required}`)
    }
  }

  // Validate width/height (must be positive and <= 1)
  for (const [key, region] of Object.entries(layout.regions)) {
    if (region.width <= 0 || region.width > 1) {
      errors.push(`Region ${key}: width out of range (${region.width})`)
    }
    if (region.height <= 0 || region.height > 1) {
      errors.push(`Region ${key}: height out of range (${region.height})`)
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}
