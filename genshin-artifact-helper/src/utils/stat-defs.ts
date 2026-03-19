/**
 * Canonical stat definitions — single source of truth for stat names, patterns, and aliases.
 * Replaces duplicated stat arrays across parseStatLine, parseStatLineNoSpaces, parseStatType,
 * and isSubstatType.
 */

import type { SubstatType, MainStatType } from '@/types/artifact'

export interface StatDefinition {
  type: SubstatType | MainStatType
  /** Lowercase, no-spaces key for prefix matching in parseStatLineNoSpaces */
  key: string
  /** Regex that captures the numeric value (and optional % for ambiguous stats) */
  pattern: RegExp
  /** Lowercase aliases for parseStatType lookup (stat name only, no value) */
  aliases: string[]
  isSubstat: boolean
  /** True for HP, ATK, DEF — stats that have both flat and percentage variants */
  hasPercentVariant: boolean
}

/**
 * All stat definitions. Percentage stats come first, sorted longest-key-first within groups.
 * For stats with hasPercentVariant, the pattern captures both the value and an optional `%`.
 */
const definitions: StatDefinition[] = [
  // Percentage / always-percent stats
  {
    type: 'CRIT Rate',
    key: 'critrate',
    pattern: /CRIT\s*Rate\s*\+?\s*([\d.]+)\s*%?/i,
    aliases: ['crit rate'],
    isSubstat: true,
    hasPercentVariant: false,
  },
  {
    type: 'CRIT DMG',
    key: 'critdmg',
    pattern: /CRIT\s*DMG\s*\+?\s*([\d.]+)\s*%?/i,
    aliases: ['crit dmg', 'crit damage'],
    isSubstat: true,
    hasPercentVariant: false,
  },
  {
    type: 'Energy Recharge',
    key: 'energyrecharge',
    pattern: /Energy\s*Recharge\s*\+?\s*([\d.]+)\s*%?/i,
    aliases: ['energy recharge'],
    isSubstat: true,
    hasPercentVariant: false,
  },
  {
    type: 'Elemental Mastery',
    key: 'elementalmastery',
    pattern: /Elemental\s*Mastery\s*\+?\s*([\d.]+)/i,
    aliases: ['elemental mastery'],
    isSubstat: true,
    hasPercentVariant: false,
  },
  // Elemental DMG Bonuses (main-stat only)
  {
    type: 'Physical DMG Bonus',
    key: 'physicaldmgbonus',
    pattern: /Physical\s*DMG\s*Bonus\s*\+?\s*([\d.]+)\s*%?/i,
    aliases: ['physical dmg bonus'],
    isSubstat: false,
    hasPercentVariant: false,
  },
  {
    type: 'Electro DMG Bonus',
    key: 'electrodmgbonus',
    pattern: /Electro\s*DMG\s*Bonus\s*\+?\s*([\d.]+)\s*%?/i,
    aliases: ['electro dmg bonus'],
    isSubstat: false,
    hasPercentVariant: false,
  },
  {
    type: 'Dendro DMG Bonus',
    key: 'dendrodmgbonus',
    pattern: /Dendro\s*DMG\s*Bonus\s*\+?\s*([\d.]+)\s*%?/i,
    aliases: ['dendro dmg bonus'],
    isSubstat: false,
    hasPercentVariant: false,
  },
  {
    type: 'Pyro DMG Bonus',
    key: 'pyrodmgbonus',
    pattern: /Pyro\s*DMG\s*Bonus\s*\+?\s*([\d.]+)\s*%?/i,
    aliases: ['pyro dmg bonus'],
    isSubstat: false,
    hasPercentVariant: false,
  },
  {
    type: 'Hydro DMG Bonus',
    key: 'hydrodmgbonus',
    pattern: /Hydro\s*DMG\s*Bonus\s*\+?\s*([\d.]+)\s*%?/i,
    aliases: ['hydro dmg bonus'],
    isSubstat: false,
    hasPercentVariant: false,
  },
  {
    type: 'Cryo DMG Bonus',
    key: 'cryodmgbonus',
    pattern: /Cryo\s*DMG\s*Bonus\s*\+?\s*([\d.]+)\s*%?/i,
    aliases: ['cryo dmg bonus'],
    isSubstat: false,
    hasPercentVariant: false,
  },
  {
    type: 'Anemo DMG Bonus',
    key: 'anemodmgbonus',
    pattern: /Anemo\s*DMG\s*Bonus\s*\+?\s*([\d.]+)\s*%?/i,
    aliases: ['anemo dmg bonus'],
    isSubstat: false,
    hasPercentVariant: false,
  },
  {
    type: 'Geo DMG Bonus',
    key: 'geodmgbonus',
    pattern: /Geo\s*DMG\s*Bonus\s*\+?\s*([\d.]+)\s*%?/i,
    aliases: ['geo dmg bonus'],
    isSubstat: false,
    hasPercentVariant: false,
  },
  {
    type: 'Healing Bonus',
    key: 'healingbonus',
    pattern: /Healing\s*Bonus\s*\+?\s*([\d.]+)\s*%?/i,
    aliases: ['healing bonus'],
    isSubstat: false,
    hasPercentVariant: false,
  },
  // Ambiguous flat/percent stats — pattern captures value + optional %
  {
    type: 'ATK',
    key: 'atk',
    pattern: /ATK\s*\+?\s*([\d.]+)\s*(%?)/i,
    aliases: ['atk', 'atk%', 'attack'],
    isSubstat: true,
    hasPercentVariant: true,
  },
  {
    type: 'HP',
    key: 'hp',
    pattern: /HP\s*\+?\s*([\d.]+)\s*(%?)/i,
    aliases: ['hp', 'hp%'],
    isSubstat: true,
    hasPercentVariant: true,
  },
  {
    type: 'DEF',
    key: 'def',
    pattern: /DEF\s*\+?\s*([\d.]+)\s*(%?)/i,
    aliases: ['def', 'def%'],
    isSubstat: true,
    hasPercentVariant: true,
  },
]

/** Full array of stat definitions */
export const STAT_DEFINITIONS: readonly StatDefinition[] = definitions

/** Alias → stat type lookup map for parseStatType */
export const STAT_ALIAS_MAP: ReadonlyMap<string, MainStatType | SubstatType> = (() => {
  const map = new Map<string, MainStatType | SubstatType>()
  for (const def of definitions) {
    for (const alias of def.aliases) {
      // For ambiguous stats, the alias with '%' maps to the percent variant
      if (def.hasPercentVariant && alias.endsWith('%')) {
        map.set(alias, (def.type + '%') as MainStatType | SubstatType)
      } else {
        map.set(alias, def.type)
      }
    }
  }
  return map
})()

/** Set of all valid substat type strings */
export const SUBSTAT_TYPES: ReadonlySet<string> = new Set<string>([
  'HP',
  'ATK',
  'DEF',
  'HP%',
  'ATK%',
  'DEF%',
  'Elemental Mastery',
  'Energy Recharge',
  'CRIT Rate',
  'CRIT DMG',
])

/** Stat definitions sorted by key length descending (for prefix matching) */
export const STAT_DEFS_BY_KEY_LENGTH: readonly StatDefinition[] = [...definitions].sort(
  (a, b) => b.key.length - a.key.length,
)
