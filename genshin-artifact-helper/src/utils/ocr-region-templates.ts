/**
 * Region templates for different screen types
 * Coordinates are percentages (0-1) for resolution independence
 *
 * These templates need to be calibrated with real screenshots.
 * Initial values are estimates and should be refined during testing.
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
 * - Artifact displayed in center-left panel
 * - Clean background
 * - Consistent positioning
 */
const INVENTORY_LAYOUT: ArtifactRegionLayout = {
  id: 'inventory-default',
  screenType: 'inventory',
  description: 'Standard inventory screen artifact view',
  referenceResolution: {
    width: 3440,
    height: 1440,
  },

  // Anchor region: rarity stars (used for positioning other regions)
  anchorRegion: createRegion(
    REGION_NAMES.RARITY,
    0.0, // 12% from left
    0.0, // 18% from top
    0.30, // 15% width
    0.30, // 3% height
    'stars',
    { whitelist: '★⭐' },
  ),

  regions: {
    // Piece name (can be multi-line)
    pieceName: createRegion(
      REGION_NAMES.PIECE_NAME,
      0.08, // 8% from left
      0.08, // 8% from top
      0.25, // 25% width (accommodate long names)
      0.08, // 8% height (2 lines)
      'text',
      {
        multiLine: true,
        preprocessingOverrides: {
          adaptive: true,
          contrastFactor: 2.0,
        },
      },
    ),

    // Slot name (e.g., "Flower of Life")
    slotName: createRegion(
      REGION_NAMES.SLOT_NAME,
      0.08,
      0.22, // Below stars
      0.2,
      0.03,
      'text',
    ),

    // Rarity (stars) - same as anchor (referencing same object)
    rarity: null as any, // Placeholder, will be assigned below

    // Level (e.g., "+20")
    level: createRegion(
      REGION_NAMES.LEVEL,
      0.25, // Right side
      0.08,
      0.08,
      0.04,
      'mixed',
      { whitelist: '+0123456789' },
    ),

    // Main stat name (e.g., "CRIT Rate")
    mainStatName: createRegion(REGION_NAMES.MAIN_STAT_NAME, 0.08, 0.28, 0.2, 0.04, 'text'),

    // Main stat value (e.g., "31.1%")
    mainStatValue: createRegion(REGION_NAMES.MAIN_STAT_VALUE, 0.08, 0.33, 0.15, 0.05, 'mixed', {
      whitelist: '0123456789.%+',
      preprocessingOverrides: {
        upscale: true,
        scaleFactor: 2,
      },
    }),

    // Substat 1 (name + value, e.g., "CRIT DMG+21.0%")
    substat1: createRegion(REGION_NAMES.SUBSTAT_1, 0.08, 0.42, 0.25, 0.04, 'mixed'),

    // Substat 2
    substat2: createRegion(REGION_NAMES.SUBSTAT_2, 0.08, 0.47, 0.25, 0.04, 'mixed'),

    // Substat 3
    substat3: createRegion(REGION_NAMES.SUBSTAT_3, 0.08, 0.52, 0.25, 0.04, 'mixed'),

    // Substat 4 (may be "Unlocked" or empty)
    substat4: createRegion(REGION_NAMES.SUBSTAT_4, 0.08, 0.57, 0.25, 0.04, 'mixed', {
      optional: true,
      multiLine: true, // "Unlocked" may wrap
    }),
  },
}
INVENTORY_LAYOUT.regions.rarity = INVENTORY_LAYOUT.anchorRegion

/**
 * Character Screen Layout
 * - Artifact displayed when viewing character equipment
 * - May have character portrait in background
 * - Different positioning from inventory
 */
const CHARACTER_LAYOUT: ArtifactRegionLayout = {
  id: 'character-default',
  screenType: 'character',
  description: 'Character equipment screen artifact view',
  referenceResolution: {
    width: 3440,
    height: 1440,
  },

  // Anchor region: rarity stars
  anchorRegion: createRegion(REGION_NAMES.RARITY, 0.68, 0.15, 0.12, 0.03, 'stars'),

  regions: {
    // Piece name (can be multi-line)
    pieceName: createRegion(
      REGION_NAMES.PIECE_NAME,
      0.65,
      0.08,
      0.22,
      0.07,
      'text',
      {
        multiLine: true,
        preprocessingOverrides: {
          adaptive: true,
          contrastFactor: 2.0,
        },
      },
    ),

    // Slot name
    slotName: createRegion(REGION_NAMES.SLOT_NAME, 0.65, 0.19, 0.18, 0.03, 'text'),

    // Rarity (stars)
    rarity: null as any,

    // Level
    level: createRegion(
      REGION_NAMES.LEVEL,
      0.82,
      0.08,
      0.06,
      0.03,
      'mixed',
      { whitelist: '+0123456789' },
    ),

    // Main stat name
    mainStatName: createRegion(REGION_NAMES.MAIN_STAT_NAME, 0.65, 0.25, 0.18, 0.03, 'text'),

    // Main stat value
    mainStatValue: createRegion(
      REGION_NAMES.MAIN_STAT_VALUE,
      0.65,
      0.29,
      0.12,
      0.04,
      'mixed',
      {
        whitelist: '0123456789.%+',
        preprocessingOverrides: {
          upscale: true,
          scaleFactor: 2,
        },
      },
    ),

    // Substats (character screen spacing)
    substat1: createRegion(REGION_NAMES.SUBSTAT_1, 0.65, 0.37, 0.22, 0.035, 'mixed'),
    substat2: createRegion(REGION_NAMES.SUBSTAT_2, 0.65, 0.42, 0.22, 0.035, 'mixed'),
    substat3: createRegion(REGION_NAMES.SUBSTAT_3, 0.65, 0.47, 0.22, 0.035, 'mixed'),
    substat4: createRegion(REGION_NAMES.SUBSTAT_4, 0.65, 0.52, 0.22, 0.035, 'mixed', {
      optional: true,
      multiLine: true,
    }),
  },
}
CHARACTER_LAYOUT.regions.rarity = CHARACTER_LAYOUT.anchorRegion

/**
 * Rewards Screen Layout
 * - Artifact displayed after domain/boss completion
 * - Larger display area
 * - Different UI layout
 */
const REWARDS_LAYOUT: ArtifactRegionLayout = {
  id: 'rewards-default',
  screenType: 'rewards',
  description: 'Rewards/Domain completion screen artifact view',
  referenceResolution: {
    width: 3440,
    height: 1440,
  },

  // Anchor region: rarity stars
  anchorRegion: createRegion(REGION_NAMES.RARITY, 0.42, 0.22, 0.15, 0.03, 'stars'),

  regions: {
    // Piece name (can be multi-line)
    pieceName: createRegion(
      REGION_NAMES.PIECE_NAME,
      0.38,
      0.12,
      0.25,
      0.08,
      'text',
      {
        multiLine: true,
        preprocessingOverrides: {
          adaptive: true,
          contrastFactor: 2.0,
        },
      },
    ),

    // Slot name
    slotName: createRegion(REGION_NAMES.SLOT_NAME, 0.38, 0.26, 0.2, 0.03, 'text'),

    // Rarity (stars)
    rarity: null as any,

    // Level
    level: createRegion(
      REGION_NAMES.LEVEL,
      0.58,
      0.12,
      0.07,
      0.04,
      'mixed',
      { whitelist: '+0123456789' },
    ),

    // Main stat name
    mainStatName: createRegion(REGION_NAMES.MAIN_STAT_NAME, 0.38, 0.32, 0.2, 0.04, 'text'),

    // Main stat value
    mainStatValue: createRegion(
      REGION_NAMES.MAIN_STAT_VALUE,
      0.38,
      0.37,
      0.15,
      0.05,
      'mixed',
      {
        whitelist: '0123456789.%+',
        preprocessingOverrides: {
          upscale: true,
          scaleFactor: 2,
        },
      },
    ),

    // Substats (rewards screen spacing)
    substat1: createRegion(REGION_NAMES.SUBSTAT_1, 0.38, 0.46, 0.25, 0.04, 'mixed'),
    substat2: createRegion(REGION_NAMES.SUBSTAT_2, 0.38, 0.51, 0.25, 0.04, 'mixed'),
    substat3: createRegion(REGION_NAMES.SUBSTAT_3, 0.38, 0.56, 0.25, 0.04, 'mixed'),
    substat4: createRegion(REGION_NAMES.SUBSTAT_4, 0.38, 0.61, 0.25, 0.04, 'mixed', {
      optional: true,
      multiLine: true,
    }),
  },
}
REWARDS_LAYOUT.regions.rarity = REWARDS_LAYOUT.anchorRegion

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
 * Calculate absolute pixel coordinates from percentage-based region
 */
export function calculateRegionPosition(
  region: OCRRegion,
  imageWidth: number,
  imageHeight: number,
  anchorOffset?: { x: number; y: number },
): { x: number; y: number; width: number; height: number } {
  let x = Math.round(region.x * imageWidth)
  let y = Math.round(region.y * imageHeight)

  // Apply anchor offset if provided
  if (anchorOffset && region.anchorRegion) {
    x += anchorOffset.x + (region.offsetX ?? 0)
    y += anchorOffset.y + (region.offsetY ?? 0)
  }

  return {
    x,
    y,
    width: Math.round(region.width * imageWidth),
    height: Math.round(region.height * imageHeight),
  }
}

/**
 * Calculate positions for all regions in a layout
 */
export function calculateAllRegionPositions(
  layout: ArtifactRegionLayout,
  imageWidth: number,
  imageHeight: number,
  anchorOffset?: { x: number; y: number },
): Map<string, { x: number; y: number; width: number; height: number }> {
  const positions = new Map<string, { x: number; y: number; width: number; height: number }>()

  // Calculate position for each region
  for (const [key, region] of Object.entries(layout.regions)) {
    positions.set(
      region.name,
      calculateRegionPosition(region, imageWidth, imageHeight, anchorOffset),
    )
  }

  return positions
}

/**
 * Adjust layout for piece names that wrap to multiple lines
 * When piece name wraps, shift all regions below it down
 */
export function adjustLayoutForMultilinePieceName(
  layout: ArtifactRegionLayout,
  lineCount: number,
): ArtifactRegionLayout {
  if (lineCount <= 1) return layout

  // Amount to shift down (percentage)
  const shiftAmount = (lineCount - 1) * 0.03 // ~3% per extra line

  // Clone layout
  const adjusted: ArtifactRegionLayout = {
    ...layout,
    regions: { ...layout.regions },
  }

  // Shift all regions below piece name
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
    'rarity',
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

  // Validate coordinate ranges (0-1)
  for (const [key, region] of Object.entries(layout.regions)) {
    if (region.x < 0 || region.x > 1) {
      errors.push(`Region ${key}: x coordinate out of range (${region.x})`)
    }
    if (region.y < 0 || region.y > 1) {
      errors.push(`Region ${key}: y coordinate out of range (${region.y})`)
    }
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
