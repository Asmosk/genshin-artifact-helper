/**
 * Artifact text parsing utilities for OCR output
 */

import type {
  Artifact,
  SubstatType,
  MainStatType,
  ArtifactSlot,
  Substat,
  OCRResult,
} from '@/types/artifact'
import {
  SUBSTAT_ROLLS,
  SUBSTAT_ROLLS_4STAR,
  SUBSTAT_ROLLS_3STAR,
  SUBSTAT_ROLLS_2STAR,
  SUBSTAT_ROLLS_1STAR,
} from '@/types/artifact'
import type { ArtifactRarity } from '@/types/artifact'
import type { RegionOCRResult } from '@/types/ocr-regions'
import { getRegionResultsMap } from './ocr-regions'

/**
 * Parsed stat with confidence
 */
export interface ParsedStat {
  type: SubstatType | MainStatType
  value: number
  confidence: number
  originalText: string
}

/**
 * Parse a single stat line from OCR text
 * Examples: "CRIT Rate+3.5%", "ATK+19", "HP+298"
 */
export function parseStatLine(line: string): ParsedStat | null {
  const trimmed = line.trim()
  if (!trimmed) return null

  // Patterns for different stat types (percentage stats)
  const percentagePatterns: Array<{ pattern: RegExp; type: SubstatType | MainStatType }> = [
    { pattern: /CRIT\s*Rate\s*\+?\s*([\d.]+)\s*%?/i, type: 'CRIT Rate' },
    { pattern: /CRIT\s*DMG\s*\+?\s*([\d.]+)\s*%?/i, type: 'CRIT DMG' },
    { pattern: /ATK\s*\+?\s*([\d.]+)\s*%/i, type: 'ATK%' },
    { pattern: /HP\s*\+?\s*([\d.]+)\s*%/i, type: 'HP%' },
    { pattern: /DEF\s*\+?\s*([\d.]+)\s*%/i, type: 'DEF%' },
    { pattern: /Energy\s*Recharge\s*\+?\s*([\d.]+)\s*%?/i, type: 'Energy Recharge' },
    { pattern: /Elemental\s*Mastery\s*\+?\s*([\d.]+)/i, type: 'Elemental Mastery' },
    // Elemental DMG Bonuses
    { pattern: /Pyro\s*DMG\s*Bonus\s*\+?\s*([\d.]+)\s*%?/i, type: 'Pyro DMG Bonus' },
    { pattern: /Hydro\s*DMG\s*Bonus\s*\+?\s*([\d.]+)\s*%?/i, type: 'Hydro DMG Bonus' },
    { pattern: /Cryo\s*DMG\s*Bonus\s*\+?\s*([\d.]+)\s*%?/i, type: 'Cryo DMG Bonus' },
    { pattern: /Electro\s*DMG\s*Bonus\s*\+?\s*([\d.]+)\s*%?/i, type: 'Electro DMG Bonus' },
    { pattern: /Anemo\s*DMG\s*Bonus\s*\+?\s*([\d.]+)\s*%?/i, type: 'Anemo DMG Bonus' },
    { pattern: /Geo\s*DMG\s*Bonus\s*\+?\s*([\d.]+)\s*%?/i, type: 'Geo DMG Bonus' },
    { pattern: /Dendro\s*DMG\s*Bonus\s*\+?\s*([\d.]+)\s*%?/i, type: 'Dendro DMG Bonus' },
    { pattern: /Physical\s*DMG\s*Bonus\s*\+?\s*([\d.]+)\s*%?/i, type: 'Physical DMG Bonus' },
    { pattern: /Healing\s*Bonus\s*\+?\s*([\d.]+)\s*%?/i, type: 'Healing Bonus' },
  ]

  // Try percentage patterns first
  for (const { pattern, type } of percentagePatterns) {
    const match = trimmed.match(pattern)
    if (match && match[1]) {
      const value = parseFloat(match[1])
      return {
        type,
        value,
        confidence: 0.9, // High confidence for clear pattern match
        originalText: trimmed,
      }
    }
  }

  // Flat value patterns (ATK, HP, DEF without %)
  const flatPatterns: Array<{ pattern: RegExp; type: SubstatType | MainStatType }> = [
    { pattern: /ATK\s*\+?\s*([\d]+)(?!\s*%)/i, type: 'ATK' },
    { pattern: /HP\s*\+?\s*([\d]+)(?!\s*%)/i, type: 'HP' },
    { pattern: /DEF\s*\+?\s*([\d]+)(?!\s*%)/i, type: 'DEF' },
  ]

  for (const { pattern, type } of flatPatterns) {
    const match = trimmed.match(pattern)
    if (match && match[1]) {
      const value = parseFloat(match[1])
      return {
        type: type as SubstatType,
        value,
        confidence: 0.9,
        originalText: trimmed,
      }
    }
  }

  return null
}

/**
 * Correct common OCR errors
 */
export function correctOCRErrors(text: string): string {
  let corrected = text

  // Common substitutions
  corrected = corrected.replace(/[O0]/g, (match, offset) => {
    // If preceded/followed by a letter, likely 'O', otherwise '0'
    const before = corrected[offset - 1] || ''
    const after = corrected[offset + 1] || ''
    if (/[a-zA-Z]/.test(before) || /[a-zA-Z]/.test(after)) {
      return 'O'
    }
    return '0'
  })

  // l (lowercase L) or I (uppercase i) in numbers should be 1
  corrected = corrected.replace(/[lI]/g, (match, offset) => {
    const before = corrected[offset - 1] || ''
    const after = corrected[offset + 1] || ''
    if (/[\d.+]/.test(before) || /[\d.%]/.test(after)) {
      return '1'
    }
    return match
  })

  // S in numbers should be 5
  corrected = corrected.replace(/S/g, (match, offset) => {
    const before = corrected[offset - 1] || ''
    const after = corrected[offset + 1] || ''
    if (/[\d.+]/.test(before) || /[\d.%]/.test(after)) {
      return '5'
    }
    return match
  })

  return corrected
}

/**
 * Get the roll table for a given rarity
 */
function getRollTable(rarity?: ArtifactRarity): Record<SubstatType, number[]> {
  if (rarity === 4) return SUBSTAT_ROLLS_4STAR
  if (rarity === 3) return SUBSTAT_ROLLS_3STAR
  if (rarity === 2) return SUBSTAT_ROLLS_2STAR
  if (rarity === 1) return SUBSTAT_ROLLS_1STAR
  return SUBSTAT_ROLLS // 5★ or unknown
}

/**
 * Find nearest valid roll value for a substat
 */
export function findNearestRollValue(type: SubstatType, value: number, rarity?: ArtifactRarity): number {
  const rollTable = getRollTable(rarity)
  const validRolls = rollTable[type]
  if (!validRolls || validRolls.length === 0) {
    return value
  }

  // For multi-roll stats, we need to find combinations
  // For now, just return the value if it's close to a multiple of valid rolls
  let nearest = value
  let minDiff = Infinity

  // Check single roll values
  for (const roll of validRolls) {
    const diff = Math.abs(value - roll)
    if (diff < minDiff) {
      minDiff = diff
      nearest = roll
    }

    // Check multiples (up to 6 rolls)
    for (let count = 2; count <= 6; count++) {
      const multiple = roll * count
      const multiDiff = Math.abs(value - multiple)
      if (multiDiff < minDiff) {
        minDiff = multiDiff
        nearest = multiple
      }
    }
  }

  // Keep original if deviation is too small (game UI rounding, e.g. 5.18 displays as 5.2)
  if (minDiff < 0.2) {
    return value
  }

  return nearest
}

/**
 * Validate and correct a parsed stat
 */
export function validateAndCorrectStat(stat: ParsedStat, rarity?: ArtifactRarity): ParsedStat {
  // Only correct substats (not main stats)
  if (!isSubstatType(stat.type)) {
    return stat
  }

  const correctedValue = findNearestRollValue(stat.type as SubstatType, stat.value, rarity)

  if (correctedValue !== stat.value) {
    return {
      ...stat,
      value: correctedValue,
      confidence: stat.confidence * 0.9, // Reduce confidence after correction
    }
  }

  return stat
}

/**
 * Check if a stat type is a substat
 */
function isSubstatType(type: string): type is SubstatType {
  return [
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
  ].includes(type)
}

/**
 * Parse artifact level from text
 * Examples of expected text: "+20", "+0", "20", "11"
 */
export function parseLevel(text: string): number | null {
  const match = text.match(/\d\d?/)
  const level = (match && match[0]) ? parseInt(match[0], 10) : NaN
  if (!isNaN(level) && level >= 0 && level <= 20) {
    return level
  }
  return null
}
/**
 * Parse artifact slot from text
 */
export function parseSlot(text: string): ArtifactSlot | null {
  const normalized = text.trim().toLowerCase()

  if (normalized.includes('flower')) return 'Flower'
  if (normalized.includes('plume')) return 'Plume'
  if (normalized.includes('sands')) return 'Sands'
  if (normalized.includes('goblet')) return 'Goblet'
  if (normalized.includes('circlet')) return 'Circlet'

  return null
}
/**
 * Minimum number of substats guaranteed for a given rarity and level
 */
function minExpectedSubstats(rarity: ArtifactRarity | undefined, level: number | null | undefined): number {
  const lvl = level ?? 0
  if (rarity === 5) return lvl >= 4 ? 4 : 3
  if (rarity === 4) return lvl >= 8 ? 4 : lvl >= 4 ? 3 : 2
  if (rarity === 3) return lvl >= 12 ? 4 : lvl >= 8 ? 3 : lvl >= 4 ? 2 : 1
  if (rarity === 2) return lvl >= 4 ? 1 : 0
  return 0 // 1★ or unknown
}

/**
 * Maximum total roll events for a given rarity and level
 */
function maxTotalRolls(rarity: ArtifactRarity, level: number): number {
  const maxStart = rarity === 5 ? 4 : rarity === 4 ? 3 : rarity === 3 ? 2 : rarity === 2 ? 1 : 0
  return maxStart + Math.floor(level / 4)
}

/**
 * Minimum number of rolls needed to produce a substat value
 */
function minRollsNeeded(type: SubstatType, value: number, rarity: ArtifactRarity): number {
  const table = getRollTable(rarity)
  const rolls = table[type]
  if (!rolls || rolls.length === 0) return 1
  const maxRoll = rolls[rolls.length - 1]!
  return Math.ceil(value / maxRoll)
}

/**
 * Parse artifact from region-based OCR results
 * More accurate than full-text parsing because each field is extracted from a specific region
 */
export function parseArtifactFromRegions(regionResults: RegionOCRResult[], starCount?: 1 | 2 | 3 | 4 | 5): OCRResult {
  const regions = getRegionResultsMap(regionResults)
  const errors: string[] = []

  // Calculate overall confidence from region confidences
  const validRegions = regionResults.filter((r) => r.text.length > 0)
  const confidence =
    validRegions.length > 0
      ? validRegions.reduce((sum, r) => sum + r.confidence, 0) / validRegions.length
      : 0

  // Parse piece name (artifact set piece)
  const pieceNameText = regions.get('pieceName')?.text.trim() || ''

  // Parse slot name
  const slotText = regions.get('slotName')?.text || ''
  const slot = parseSlot(slotText)
  if (!slot && slotText) {
    errors.push(`Could not parse slot from: "${slotText}"`)
  }

  // Parse level
  const levelText = regions.get('level')?.text || ''
  const level = parseLevel(levelText)
  if (level === null && levelText) {
    errors.push(`Could not parse level from: "${levelText}"`)
  }

  // Rarity comes directly from star detection result
  const rarity = starCount ?? undefined

  // Parse main stat
  const mainStatNameText = regions.get('mainStatName')?.text || ''
  const mainStatValueText = regions.get('mainStatValue')?.text || ''

  let mainStat: { type: MainStatType; value: number } | undefined

  // Try to parse main stat name
  const mainStatParsed = parseStatLine(mainStatNameText + '+' + mainStatValueText)
  if (mainStatParsed) {
    mainStat = {
      type: mainStatParsed.type as MainStatType,
      value: mainStatParsed.value,
    }
  } else {
    // Try parsing name and value separately
    const statType = parseStatType(mainStatNameText)
    const statValue = parseFloat(mainStatValueText.replace(/[^0-9.]/g, ''))

    if (statType && !isNaN(statValue)) {
      mainStat = {
        type: statType,
        value: statValue,
      }
    } else {
      errors.push(`Could not parse main stat from: name="${mainStatNameText}", value="${mainStatValueText}"`)
    }
  }

  // Parse substats
  const substats: Substat[] = []

  for (let i = 1; i <= 4; i++) {
    const regionName = `substat${i}`
    const text = regions.get(regionName)?.text || ''

    if (!text.trim()) {
      if (i <= minExpectedSubstats(rarity, level)) {
        errors.push(`Substat ${i} is empty`)
      }
      continue
    }

    // Skip "Unlocked" text
    if (text.toLowerCase().includes('unlocked')) {
      continue
    }

    const secondLineText = i === 4 ? (regions.get('substat4SecondLine')?.text || '') : ''
    const isUnactivated = /unactivated/i.test(text) || /unactivated/i.test(secondLineText)

    // Apply OCR error correction
    const correctedText = correctOCRErrors(text)
    const parsed = parseStatLine(correctedText)

    if (parsed && isSubstatType(parsed.type)) {
      const corrected = validateAndCorrectStat(parsed, rarity)
      substats.push({
        type: corrected.type as SubstatType,
        value: corrected.value,
        rollCount: rarity ? minRollsNeeded(corrected.type as SubstatType, corrected.value, rarity) : undefined,
        ...(isUnactivated ? { unactivated: true } : {}),
      })
    } else {
      errors.push(`Could not parse substat ${i} from: "${text}"`)
    }
  }

  // Validate total rolls
  if (rarity != null && level != null && substats.length > 0) {
    const maxRolls = maxTotalRolls(rarity, level)
    const minRolls = substats.reduce((sum, s) => sum + minRollsNeeded(s.type, s.value, rarity), 0)
    if (minRolls > maxRolls) {
      errors.push(
        `Substat values require at least ${minRolls} rolls but +${level} ${rarity}★ artifact allows at most ${maxRolls}`,
      )
    }
  }

  // Build artifact
  const artifact: Partial<Artifact> = {
    level: level ?? undefined,
    rarity: rarity ?? undefined,
    slot: slot ?? undefined,
    mainStat,
    substats: substats.length > 0 ? substats : undefined,
  }

  // Add piece name to artifact (not part of Artifact type yet, but useful)
  if (pieceNameText) {
    ;(artifact as any).pieceName = pieceNameText
  }

  // Add warnings for missing fields
  if (level === null) errors.push('Missing artifact level')
  if (!rarity) errors.push('Missing artifact rarity')
  if (!slot) errors.push('Missing artifact slot')
  if (!mainStat) errors.push('Missing main stat')
  if (substats.length === 0) errors.push('No substats parsed')

  // Format raw text from regions for display
  const rawText = formatRegionResults(regionResults)

  return {
    artifact,
    confidence,
    rawText,
    errors,
  }
}

/**
 * Format region results into readable text
 */
function formatRegionResults(results: RegionOCRResult[]): string {
  let text = '=== Region-Based OCR Results ===\n\n'

  for (const result of results) {
    if (result.text.trim()) {
      text += `[${result.regionName}]: ${result.text}\n`
    }
  }

  return text
}

/**
 * Parse stat type from text (stat name only, no value)
 */
function parseStatType(text: string): MainStatType | SubstatType | null {
  const normalized = text.trim().toLowerCase().replace(/\s+/g, ' ')

  // Map common variations to stat types
  const statMap: Record<string, MainStatType | SubstatType> = {
    'crit rate': 'CRIT Rate',
    'crit dmg': 'CRIT DMG',
    'crit damage': 'CRIT DMG',
    'atk%': 'ATK%',
    'atk': 'ATK',
    'attack': 'ATK',
    'hp%': 'HP%',
    'hp': 'HP',
    'def%': 'DEF%',
    'def': 'DEF',
    'elemental mastery': 'Elemental Mastery',
    'energy recharge': 'Energy Recharge',
    'pyro dmg bonus': 'Pyro DMG Bonus',
    'hydro dmg bonus': 'Hydro DMG Bonus',
    'cryo dmg bonus': 'Cryo DMG Bonus',
    'electro dmg bonus': 'Electro DMG Bonus',
    'anemo dmg bonus': 'Anemo DMG Bonus',
    'geo dmg bonus': 'Geo DMG Bonus',
    'dendro dmg bonus': 'Dendro DMG Bonus',
    'physical dmg bonus': 'Physical DMG Bonus',
    'healing bonus': 'Healing Bonus',
  }

  return statMap[normalized] ?? null
}
