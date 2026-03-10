/**
 * Artifact type definitions for Genshin Impact
 */

/**
 * Artifact rarity (star rating)
 */
export type ArtifactRarity = 1 | 2 | 3 | 4 | 5

/**
 * Main stat types that can appear on artifacts
 */
export type MainStatType =
  | 'HP'
  | 'ATK'
  | 'DEF'
  | 'HP%'
  | 'ATK%'
  | 'DEF%'
  | 'Elemental Mastery'
  | 'Energy Recharge'
  | 'CRIT Rate'
  | 'CRIT DMG'
  | 'Healing Bonus'
  | 'Pyro DMG Bonus'
  | 'Hydro DMG Bonus'
  | 'Cryo DMG Bonus'
  | 'Electro DMG Bonus'
  | 'Anemo DMG Bonus'
  | 'Geo DMG Bonus'
  | 'Dendro DMG Bonus'
  | 'Physical DMG Bonus'

/**
 * Substat types that can appear on artifacts
 */
export type SubstatType =
  | 'HP'
  | 'ATK'
  | 'DEF'
  | 'HP%'
  | 'ATK%'
  | 'DEF%'
  | 'Elemental Mastery'
  | 'Energy Recharge'
  | 'CRIT Rate'
  | 'CRIT DMG'

/**
 * Artifact slot/position
 */
export type ArtifactSlot = 'Flower' | 'Plume' | 'Sands' | 'Goblet' | 'Circlet'

/**
 * Artifact set name
 */
export type ArtifactSet = string // Too many sets to enumerate

/**
 * Substat with its value
 */
export interface Substat {
  type: SubstatType
  value: number
  /** Number of times this substat has been rolled (0 = initial roll) */
  rollCount?: number
  /** Whether this substat is unactivated (level 0 artifact, 4th substat not yet unlocked) */
  unactivated?: boolean
}

/**
 * Main artifact interface
 */
export interface Artifact {
  /** Unique identifier */
  id: string
  /** Artifact set name */
  set: ArtifactSet
  /** Artifact slot */
  slot: ArtifactSlot
  /** Rarity (3, 4, or 5 stars) */
  rarity: ArtifactRarity
  /** Current level (0-16 for 4*, 0-20 for 5*) */
  level: number
  /** Maximum level based on rarity */
  maxLevel: number
  /** Main stat */
  mainStat: {
    type: MainStatType
    value: number
  }
  /** Substats (3-4 depending on initial roll) */
  substats: Substat[]
  /** Whether artifact is locked in game */
  locked?: boolean
  /** Whether artifact is equipped on a character */
  equipped?: boolean
  /** Character name if equipped */
  equippedCharacter?: string
  /** When this artifact was scanned */
  scannedAt?: Date
}

/**
 * Possible roll values for each substat type (for 5* artifacts)
 */
export const SUBSTAT_ROLLS: Record<SubstatType, number[]> = {
  'CRIT Rate': [2.72, 3.11, 3.5, 3.89],
  'CRIT DMG': [5.44, 6.22, 6.99, 7.77],
  'ATK%': [4.08, 4.66, 5.25, 5.83],
  ATK: [13.62, 15.56, 17.51, 19.45],
  'HP%': [4.08, 4.66, 5.25, 5.83],
  HP: [209.13, 239, 268.88, 298.75],
  'DEF%': [5.1, 5.83, 6.56, 7.29],
  DEF: [16.2, 18.52, 20.83, 23.15],
  'Elemental Mastery': [16.32, 18.65, 20.98, 23.31],
  'Energy Recharge': [4.53, 5.18, 5.83, 6.48],
}

/**
 * Possible roll values for each substat type (for 3* artifacts)
 */
export const SUBSTAT_ROLLS_3STAR: Record<SubstatType, number[]> = {
  'CRIT Rate': [1.63, 1.86, 2.1, 2.33],
  'CRIT DMG': [3.26, 3.73, 4.2, 4.66],
  'ATK%': [2.45, 2.8, 3.15, 3.5],
  ATK: [6.54, 7.47, 8.4, 9.34],
  'HP%': [2.45, 2.8, 3.15, 3.5],
  HP: [100.38, 114.72, 129.06, 143.4],
  'DEF%': [3.06, 3.5, 3.93, 4.37],
  DEF: [7.78, 8.89, 10.0, 11.11],
  'Elemental Mastery': [9.79, 11.19, 12.59, 13.99],
  'Energy Recharge': [2.72, 3.11, 3.5, 3.89],
}

/**
 * Possible roll values for each substat type (for 2* artifacts)
 */
export const SUBSTAT_ROLLS_2STAR: Record<SubstatType, number[]> = {
  'CRIT Rate': [1.09, 1.32, 1.55],
  'CRIT DMG': [2.18, 2.64, 3.11],
  'ATK%': [1.63, 1.98, 2.33],
  ATK: [3.27, 3.97, 4.67],
  'HP%': [1.63, 1.98, 2.33],
  HP: [50.19, 60.95, 71.7],
  'DEF%': [2.04, 2.48, 2.91],
  DEF: [3.89, 4.72, 5.56],
  'Elemental Mastery': [6.53, 7.93, 9.33],
  'Energy Recharge': [1.81, 2.2, 2.59],
}

/**
 * Possible roll values for each substat type (for 1* artifacts)
 */
export const SUBSTAT_ROLLS_1STAR: Record<SubstatType, number[]> = {
  'CRIT Rate': [0.78, 0.97],
  'CRIT DMG': [1.55, 1.94],
  'ATK%': [1.17, 1.46],
  ATK: [1.56, 1.95],
  'HP%': [1.17, 1.46],
  HP: [23.9, 29.88],
  'DEF%': [1.46, 1.82],
  DEF: [1.85, 2.31],
  'Elemental Mastery': [4.66, 5.83],
  'Energy Recharge': [1.3, 1.62],
}

/**
 * Possible roll values for each substat type (for 4* artifacts)
 */
export const SUBSTAT_ROLLS_4STAR: Record<SubstatType, number[]> = {
  'CRIT Rate': [2.18, 2.49, 2.80, 3.11],
  'CRIT DMG': [4.35, 4.97, 5.60, 6.22],
  'ATK%': [3.26, 3.73, 4.20, 4.66],
  ATK: [10.89, 12.45, 14.00, 15.56],
  'HP%': [3.26, 3.73, 4.20, 4.66],
  HP: [167.3, 191.2, 215.1, 239.0],
  'DEF%': [4.08, 4.66, 5.25, 5.83],
  DEF: [12.96, 14.82, 16.67, 18.52],
  'Elemental Mastery': [13.06, 14.92, 16.79, 18.65],
  'Energy Recharge': [3.63, 4.14, 4.66, 5.18],
}

/**
 * Maximum roll value for each substat
 */
export const MAX_SUBSTAT_ROLL: Record<SubstatType, number> = {
  'CRIT Rate': 3.89,
  'CRIT DMG': 7.77,
  'ATK%': 5.83,
  ATK: 19.45,
  'HP%': 5.83,
  HP: 298.75,
  'DEF%': 7.29,
  DEF: 23.15,
  'Elemental Mastery': 23.31,
  'Energy Recharge': 6.48,
}

/**
 * Maximum theoretical value for each substat (max roll * 6 rolls)
 */
export const MAX_SUBSTAT_VALUE: Record<SubstatType, number> = {
  'CRIT Rate': 23.34, // 3.89 * 6
  'CRIT DMG': 46.62, // 7.77 * 6
  'ATK%': 34.98, // 5.83 * 6
  ATK: 116.7, // 19.45 * 6
  'HP%': 34.98, // 5.83 * 6
  HP: 1792.5, // 298.75 * 6
  'DEF%': 43.74, // 7.29 * 6
  DEF: 138.9, // 23.15 * 6
  'Elemental Mastery': 139.86, // 23.31 * 6
  'Energy Recharge': 38.88, // 6.48 * 6
}

/**
 * Build profile defining stat weights for scoring
 */
export interface BuildProfile {
  /** Profile name */
  name: string
  /** Character this profile is for (optional) */
  character?: string
  /** Stat weights (1 = full value, 0 = ignored) */
  weights: Partial<Record<SubstatType, number>>
  /** Optional description */
  description?: string
}

/**
 * Default build profile (all stats weighted equally)
 */
export const DEFAULT_BUILD_PROFILE: BuildProfile = {
  name: 'Default',
  description: 'Equal weight for all substats',
  weights: {
    'CRIT Rate': 1,
    'CRIT DMG': 1,
    'ATK%': 1,
    ATK: 1,
    'HP%': 1,
    HP: 1,
    'DEF%': 1,
    DEF: 1,
    'Elemental Mastery': 1,
    'Energy Recharge': 1,
  },
}

/**
 * Common build profiles
 */
export const COMMON_BUILD_PROFILES: BuildProfile[] = [
  DEFAULT_BUILD_PROFILE,
  {
    name: 'DPS (Crit focused)',
    description: 'Prioritizes CRIT Rate, CRIT DMG, and ATK',
    weights: {
      'CRIT Rate': 1,
      'CRIT DMG': 1,
      'ATK%': 0.5,
      ATK: 0.25,
      'Energy Recharge': 0.25,
    },
  },
  {
    name: 'Elemental Mastery',
    description: 'For reaction-based characters',
    weights: {
      'Elemental Mastery': 1,
      'CRIT Rate': 0.5,
      'CRIT DMG': 0.5,
      'ATK%': 0.25,
      'Energy Recharge': 0.5,
    },
  },
  {
    name: 'Support',
    description: 'Energy Recharge focused',
    weights: {
      'Energy Recharge': 1,
      'CRIT Rate': 0.5,
      'CRIT DMG': 0.5,
      'ATK%': 0.25,
    },
  },
  {
    name: 'DEF Scaler',
    description: 'For DEF-scaling characters',
    weights: {
      'CRIT Rate': 1,
      'CRIT DMG': 1,
      'DEF%': 1,
      DEF: 0.5,
      'Energy Recharge': 0.25,
    },
  },
  {
    name: 'HP Scaler',
    description: 'For HP-scaling characters',
    weights: {
      'CRIT Rate': 1,
      'CRIT DMG': 1,
      'HP%': 1,
      HP: 0.5,
      'Energy Recharge': 0.25,
    },
  },
]

/**
 * Artifact score result
 */
export interface ArtifactScore {
  /** Overall score percentage (0-100) */
  totalScore: number
  /** Individual substat scores */
  substatScores: Array<{
    type: SubstatType
    value: number
    score: number // 0-100
    weight: number
  }>
  /** Number of remaining rolls if not max level */
  remainingRolls: number
  /** Whether this is a potential score (not max level) */
  isPotential: boolean
  /** Build profile used for scoring */
  profile: BuildProfile
}

/**
 * OCR result for parsed artifact
 */
export interface OCRResult {
  /** Parsed artifact data */
  artifact: Partial<Artifact>
  /** OCR confidence (0-1) */
  confidence: number
  /** Raw OCR text */
  rawText: string
  /** Any errors or warnings */
  errors: string[]
}
