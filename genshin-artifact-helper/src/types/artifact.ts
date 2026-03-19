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
  /** Individual piece name as read by OCR (e.g. "Gladiator's Nostalgia") */
  pieceName?: string
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
 * Main stat values by level for 5★ artifacts (index = level 0–20)
 */
export const MAIN_STAT_VALUES_5STAR: Partial<Record<MainStatType, number[]>> = {
  HP:  [717, 920, 1123, 1326, 1530, 1733, 1936, 2139, 2342, 2545, 2749, 2952, 3155, 3358, 3561, 3764, 3967, 4171, 4374, 4577, 4780],
  ATK: [47, 60, 73, 86, 100, 113, 126, 139, 152, 166, 179, 192, 205, 219, 232, 245, 258, 272, 285, 298, 311],
  'HP%':  [7.0, 9.0, 11.0, 12.9, 14.9, 16.9, 18.9, 20.9, 22.8, 24.8, 26.8, 28.8, 30.8, 32.8, 34.7, 36.7, 38.7, 40.7, 42.7, 44.6, 46.6],
  'ATK%': [7.0, 9.0, 11.0, 12.9, 14.9, 16.9, 18.9, 20.9, 22.8, 24.8, 26.8, 28.8, 30.8, 32.8, 34.7, 36.7, 38.7, 40.7, 42.7, 44.6, 46.6],
  'DEF%': [8.7, 11.2, 13.7, 16.2, 18.6, 21.1, 23.6, 26.1, 28.6, 31.0, 33.5, 36.0, 38.5, 40.9, 43.4, 45.9, 48.4, 50.8, 53.3, 55.8, 58.3],
  'Elemental Mastery': [28.0, 35.9, 43.8, 51.8, 59.7, 67.6, 75.5, 83.5, 91.4, 99.3, 107.2, 115.2, 123.1, 131.0, 138.9, 146.9, 154.8, 162.7, 170.6, 178.6, 186.5],
  'Energy Recharge':   [7.8, 10.0, 12.2, 14.4, 16.6, 18.8, 21.0, 23.2, 25.4, 27.6, 29.8, 32.0, 34.2, 36.4, 38.6, 40.8, 43.0, 45.2, 47.4, 49.6, 51.8],
  'CRIT Rate': [4.7, 6.0, 7.3, 8.6, 9.9, 11.3, 12.6, 13.9, 15.2, 16.6, 17.9, 19.2, 20.5, 21.8, 23.2, 24.5, 25.8, 27.1, 28.4, 29.8, 31.1],
  'CRIT DMG':  [9.3, 12.0, 14.6, 17.3, 19.9, 22.5, 25.2, 27.8, 30.5, 33.1, 35.7, 38.4, 41.0, 43.7, 46.3, 49.0, 51.6, 54.2, 56.9, 59.5, 62.2],
  'Healing Bonus':      [5.4, 6.9, 8.4, 10.0, 11.5, 13.0, 14.5, 16.1, 17.6, 19.1, 20.6, 22.1, 23.7, 25.2, 26.7, 28.2, 29.8, 31.3, 32.8, 34.3, 35.9],
  'Pyro DMG Bonus':     [7.0, 9.0, 11.0, 12.9, 14.9, 16.9, 18.9, 20.9, 22.8, 24.8, 26.8, 28.8, 30.8, 32.8, 34.7, 36.7, 38.7, 40.7, 42.7, 44.6, 46.6],
  'Hydro DMG Bonus':    [7.0, 9.0, 11.0, 12.9, 14.9, 16.9, 18.9, 20.9, 22.8, 24.8, 26.8, 28.8, 30.8, 32.8, 34.7, 36.7, 38.7, 40.7, 42.7, 44.6, 46.6],
  'Cryo DMG Bonus':     [7.0, 9.0, 11.0, 12.9, 14.9, 16.9, 18.9, 20.9, 22.8, 24.8, 26.8, 28.8, 30.8, 32.8, 34.7, 36.7, 38.7, 40.7, 42.7, 44.6, 46.6],
  'Electro DMG Bonus':  [7.0, 9.0, 11.0, 12.9, 14.9, 16.9, 18.9, 20.9, 22.8, 24.8, 26.8, 28.8, 30.8, 32.8, 34.7, 36.7, 38.7, 40.7, 42.7, 44.6, 46.6],
  'Anemo DMG Bonus':    [7.0, 9.0, 11.0, 12.9, 14.9, 16.9, 18.9, 20.9, 22.8, 24.8, 26.8, 28.8, 30.8, 32.8, 34.7, 36.7, 38.7, 40.7, 42.7, 44.6, 46.6],
  'Geo DMG Bonus':      [7.0, 9.0, 11.0, 12.9, 14.9, 16.9, 18.9, 20.9, 22.8, 24.8, 26.8, 28.8, 30.8, 32.8, 34.7, 36.7, 38.7, 40.7, 42.7, 44.6, 46.6],
  'Dendro DMG Bonus':   [7.0, 9.0, 11.0, 12.9, 14.9, 16.9, 18.9, 20.9, 22.8, 24.8, 26.8, 28.8, 30.8, 32.8, 34.7, 36.7, 38.7, 40.7, 42.7, 44.6, 46.6],
  'Physical DMG Bonus': [8.7, 11.2, 13.7, 16.2, 18.6, 21.1, 23.6, 26.1, 28.6, 31.0, 33.5, 36.0, 38.5, 40.9, 43.4, 45.9, 48.4, 50.8, 53.3, 55.8, 58.3],
}

/**
 * Main stat values by level for 4★ artifacts (index = level 0–16)
 */
export const MAIN_STAT_VALUES_4STAR: Partial<Record<MainStatType, number[]>> = {
  HP:  [645, 828, 1011, 1194, 1377, 1559, 1742, 1925, 2108, 2291, 2474, 2657, 2839, 3022, 3205, 3388, 3571],
  ATK: [42, 54, 66, 78, 90, 102, 113, 125, 137, 149, 161, 173, 185, 197, 209, 221, 232],
  'HP%':  [6.3, 8.1, 9.9, 11.6, 13.4, 15.2, 17.0, 18.8, 20.6, 22.3, 24.1, 25.9, 27.7, 29.5, 31.3, 33.0, 34.8],
  'ATK%': [6.3, 8.1, 9.9, 11.6, 13.4, 15.2, 17.0, 18.8, 20.6, 22.3, 24.1, 25.9, 27.7, 29.5, 31.3, 33.0, 34.8],
  'DEF%': [7.9, 10.1, 12.3, 14.6, 16.8, 19.0, 21.2, 23.5, 25.7, 27.9, 30.2, 32.4, 34.6, 36.8, 39.1, 41.3, 43.5],
  'Elemental Mastery': [25.2, 32.3, 39.4, 46.6, 53.7, 60.8, 68.0, 75.1, 82.2, 89.4, 96.5, 103.6, 110.8, 117.9, 125.0, 132.2, 139.3],
  'Energy Recharge':   [7.0, 9.0, 11.0, 12.9, 14.9, 16.9, 18.9, 20.9, 22.8, 24.8, 26.8, 28.8, 30.8, 32.8, 34.7, 36.7, 38.7],
  'CRIT Rate': [4.2, 5.4, 6.6, 7.8, 9.0, 10.1, 11.3, 12.5, 13.7, 14.9, 16.1, 17.3, 18.5, 19.7, 20.8, 22.0, 23.2],
  'CRIT DMG':  [8.4, 10.8, 13.1, 15.5, 17.9, 20.3, 22.7, 25.0, 27.4, 29.8, 32.2, 34.5, 36.9, 39.3, 41.7, 44.1, 46.4],
  'Healing Bonus':      [4.8, 6.2, 7.6, 9.0, 10.3, 11.7, 13.1, 14.4, 15.8, 17.2, 18.6, 19.9, 21.3, 22.7, 24.0, 25.4, 26.8],
  'Pyro DMG Bonus':     [6.3, 8.1, 9.9, 11.6, 13.4, 15.2, 17.0, 18.8, 20.6, 22.3, 24.1, 25.9, 27.7, 29.5, 31.3, 33.0, 34.8],
  'Hydro DMG Bonus':    [6.3, 8.1, 9.9, 11.6, 13.4, 15.2, 17.0, 18.8, 20.6, 22.3, 24.1, 25.9, 27.7, 29.5, 31.3, 33.0, 34.8],
  'Cryo DMG Bonus':     [6.3, 8.1, 9.9, 11.6, 13.4, 15.2, 17.0, 18.8, 20.6, 22.3, 24.1, 25.9, 27.7, 29.5, 31.3, 33.0, 34.8],
  'Electro DMG Bonus':  [6.3, 8.1, 9.9, 11.6, 13.4, 15.2, 17.0, 18.8, 20.6, 22.3, 24.1, 25.9, 27.7, 29.5, 31.3, 33.0, 34.8],
  'Anemo DMG Bonus':    [6.3, 8.1, 9.9, 11.6, 13.4, 15.2, 17.0, 18.8, 20.6, 22.3, 24.1, 25.9, 27.7, 29.5, 31.3, 33.0, 34.8],
  'Geo DMG Bonus':      [6.3, 8.1, 9.9, 11.6, 13.4, 15.2, 17.0, 18.8, 20.6, 22.3, 24.1, 25.9, 27.7, 29.5, 31.3, 33.0, 34.8],
  'Dendro DMG Bonus':   [6.3, 8.1, 9.9, 11.6, 13.4, 15.2, 17.0, 18.8, 20.6, 22.3, 24.1, 25.9, 27.7, 29.5, 31.3, 33.0, 34.8],
  'Physical DMG Bonus': [7.9, 10.1, 12.3, 14.6, 16.8, 19.0, 21.2, 23.5, 25.7, 27.9, 30.2, 32.4, 34.6, 36.8, 39.1, 41.3, 43.5],
}

/**
 * Main stat values by level for 3★ artifacts (index = level 0–12)
 */
export const MAIN_STAT_VALUES_3STAR: Partial<Record<MainStatType, number[]>> = {
  HP:  [430, 552, 674, 796, 918, 1040, 1162, 1283, 1405, 1527, 1649, 1771, 1893],
  ATK: [28, 36, 44, 52, 60, 68, 76, 84, 91, 99, 107, 115, 123],
  'HP%':  [5.2, 6.7, 8.2, 9.7, 11.2, 12.7, 14.2, 15.6, 17.1, 18.6, 20.1, 21.6, 23.1],
  'ATK%': [5.2, 6.7, 8.2, 9.7, 11.2, 12.7, 14.2, 15.6, 17.1, 18.6, 20.1, 21.6, 23.1],
  'DEF%': [6.6, 8.4, 10.3, 12.1, 14.0, 15.8, 17.7, 19.6, 21.4, 23.3, 25.1, 27.0, 28.8],
  'Elemental Mastery': [21.0, 26.9, 32.9, 38.8, 44.8, 50.7, 56.7, 62.6, 68.5, 74.5, 80.4, 86.4, 92.3],
  'Energy Recharge':   [5.8, 7.5, 9.1, 10.8, 12.4, 14.1, 15.7, 17.4, 19.0, 20.7, 22.3, 24.0, 25.6],
  'CRIT Rate': [3.5, 4.5, 5.5, 6.5, 7.5, 8.4, 9.4, 10.4, 11.4, 12.4, 13.4, 14.4, 15.4],
  'CRIT DMG':  [7.0, 9.0, 11.0, 12.9, 14.9, 16.9, 18.9, 20.9, 22.8, 24.8, 26.8, 28.8, 30.8],
  'Healing Bonus':      [4.0, 5.2, 6.3, 7.5, 8.6, 9.8, 10.9, 12.0, 13.2, 14.3, 15.5, 16.6, 17.8],
  'Pyro DMG Bonus':     [5.2, 6.7, 8.2, 9.7, 11.2, 12.7, 14.2, 15.6, 17.1, 18.6, 20.1, 21.6, 23.1],
  'Hydro DMG Bonus':    [5.2, 6.7, 8.2, 9.7, 11.2, 12.7, 14.2, 15.6, 17.1, 18.6, 20.1, 21.6, 23.1],
  'Cryo DMG Bonus':     [5.2, 6.7, 8.2, 9.7, 11.2, 12.7, 14.2, 15.6, 17.1, 18.6, 20.1, 21.6, 23.1],
  'Electro DMG Bonus':  [5.2, 6.7, 8.2, 9.7, 11.2, 12.7, 14.2, 15.6, 17.1, 18.6, 20.1, 21.6, 23.1],
  'Anemo DMG Bonus':    [5.2, 6.7, 8.2, 9.7, 11.2, 12.7, 14.2, 15.6, 17.1, 18.6, 20.1, 21.6, 23.1],
  'Geo DMG Bonus':      [5.2, 6.7, 8.2, 9.7, 11.2, 12.7, 14.2, 15.6, 17.1, 18.6, 20.1, 21.6, 23.1],
  'Dendro DMG Bonus':   [5.2, 6.7, 8.2, 9.7, 11.2, 12.7, 14.2, 15.6, 17.1, 18.6, 20.1, 21.6, 23.1],
  'Physical DMG Bonus': [6.6, 8.4, 10.3, 12.1, 14.0, 15.8, 17.7, 19.6, 21.4, 23.3, 25.1, 27.0, 28.8],
}

/**
 * Main stat values by level for 2★ artifacts (index = level 0–4)
 */
export const MAIN_STAT_VALUES_2STAR: Partial<Record<MainStatType, number[]>> = {
  HP:  [258, 331, 404, 478, 551],
  ATK: [17, 22, 26, 31, 36],
  'HP%':  [4.2, 5.4, 6.6, 7.8, 9.0],
  'ATK%': [4.2, 5.4, 6.6, 7.8, 9.0],
  'DEF%': [5.2, 6.7, 8.2, 9.7, 11.2],
  'Elemental Mastery': [16.8, 21.5, 26.3, 31.1, 35.8],
  'Energy Recharge':   [4.7, 6.0, 7.3, 8.6, 9.9],
  'CRIT Rate': [2.8, 3.6, 4.4, 5.2, 6.0],
  'CRIT DMG':  [5.6, 7.2, 8.8, 10.4, 11.9],
  'Healing Bonus':      [3.2, 4.1, 5.1, 6.0, 6.9],
  'Pyro DMG Bonus':     [4.2, 5.4, 6.6, 7.8, 9.0],
  'Hydro DMG Bonus':    [4.2, 5.4, 6.6, 7.8, 9.0],
  'Cryo DMG Bonus':     [4.2, 5.4, 6.6, 7.8, 9.0],
  'Electro DMG Bonus':  [4.2, 5.4, 6.6, 7.8, 9.0],
  'Anemo DMG Bonus':    [4.2, 5.4, 6.6, 7.8, 9.0],
  'Geo DMG Bonus':      [4.2, 5.4, 6.6, 7.8, 9.0],
  'Dendro DMG Bonus':   [4.2, 5.4, 6.6, 7.8, 9.0],
  'Physical DMG Bonus': [5.2, 6.7, 8.2, 9.7, 11.2],
}

/**
 * Main stat values by level for 1★ artifacts (index = level 0–4)
 */
export const MAIN_STAT_VALUES_1STAR: Partial<Record<MainStatType, number[]>> = {
  HP:  [129, 178, 227, 275, 324],
  ATK: [8, 12, 15, 18, 21],
  'HP%':  [3.1, 4.3, 5.5, 6.7, 7.9],
  'ATK%': [3.1, 4.3, 5.5, 6.7, 7.9],
  'DEF%': [3.9, 5.4, 6.9, 8.4, 9.9],
  'Elemental Mastery': [12.6, 17.3, 22.1, 26.9, 31.6],
  'Energy Recharge':   [3.5, 4.8, 6.1, 7.5, 8.8],
  'CRIT Rate': [2.1, 2.9, 3.7, 4.5, 5.3],
  'CRIT DMG':  [4.2, 5.8, 7.4, 9.0, 10.5],
  'Healing Bonus':      [2.4, 3.3, 4.3, 5.2, 6.1],
  'Pyro DMG Bonus':     [3.1, 4.3, 5.5, 6.7, 7.9],
  'Hydro DMG Bonus':    [3.1, 4.3, 5.5, 6.7, 7.9],
  'Cryo DMG Bonus':     [3.1, 4.3, 5.5, 6.7, 7.9],
  'Electro DMG Bonus':  [3.1, 4.3, 5.5, 6.7, 7.9],
  'Anemo DMG Bonus':    [3.1, 4.3, 5.5, 6.7, 7.9],
  'Geo DMG Bonus':      [3.1, 4.3, 5.5, 6.7, 7.9],
  'Dendro DMG Bonus':   [3.1, 4.3, 5.5, 6.7, 7.9],
  'Physical DMG Bonus': [3.9, 5.4, 6.9, 8.4, 9.9],
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
  /** Whether this result was produced by region-based OCR */
  regionBased?: boolean
  /** Screen type used for region-based OCR */
  screenType?: string
  /** Number of regions processed */
  regionCount?: number
}
