/**
 * Artifact text parsing utilities for OCR output
 */

import type {
  Artifact,
  SubstatType,
  MainStatType,
  ArtifactSlot,
  ArtifactRarity,
  Substat,
  OCRResult,
} from '@/types/artifact'
import {
  SUBSTAT_ROLLS,
  SUBSTAT_ROLLS_4STAR,
  SUBSTAT_ROLLS_3STAR,
  SUBSTAT_ROLLS_2STAR,
  SUBSTAT_ROLLS_1STAR,
  MAIN_STAT_VALUES_5STAR,
  MAIN_STAT_VALUES_4STAR,
  MAIN_STAT_VALUES_3STAR,
  MAIN_STAT_VALUES_2STAR,
  MAIN_STAT_VALUES_1STAR,
} from '@/types/artifact'
import VALID_ROLL_SUMS from '@/generated/valid-roll-sums'
import type { RegionOCRResult } from '@/types/ocr-regions'
import { getRegionResultsMap } from './ocr-regions'
import {
  STAT_DEFINITIONS,
  STAT_ALIAS_MAP,
  SUBSTAT_TYPES,
  STAT_DEFS_BY_KEY_LENGTH,
} from './stat-defs'

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
 * Parse a single stat line from OCR text.
 * Examples: "CRIT Rate+3.5%", "ATK+19", "HP+298"
 *
 * When rarity is provided, ambiguous flat/percent stats (HP, ATK, DEF) without
 * an explicit `%` are disambiguated using valid roll sum tables.
 */
export function parseStatLine(line: string, rarity?: ArtifactRarity): ParsedStat | null {
  const trimmed = line.trim()
  if (!trimmed) return null

  for (const def of STAT_DEFINITIONS) {
    const match = trimmed.match(def.pattern)
    if (!match || !match[1]) continue

    const value = parseFloat(match[1])
    if (isNaN(value)) continue

    if (def.hasPercentVariant) {
      const hasPercent = match[2] === '%'
      const type = resolveAmbiguousStat(
        def.type as 'HP' | 'ATK' | 'DEF',
        value,
        hasPercent,
        rarity,
      )
      return { type, value, confidence: 0.9, originalText: trimmed }
    }

    return { type: def.type, value, confidence: 0.9, originalText: trimmed }
  }

  // Fallback: strip all spaces and match against canonical stat names
  return parseStatLineNoSpaces(trimmed, rarity)
}

/**
 * Resolve an ambiguous HP/ATK/DEF stat to its flat or percent variant.
 * If `%` is explicitly present, returns percent. Otherwise uses roll-sum
 * disambiguation when rarity is available, falling back to flat.
 */
function resolveAmbiguousStat(
  baseType: 'HP' | 'ATK' | 'DEF',
  value: number,
  hasPercent: boolean,
  rarity?: ArtifactRarity,
): SubstatType | MainStatType {
  if (hasPercent) return `${baseType}%`
  return disambiguateFlatPercent(baseType, value, rarity)
}

/**
 * Disambiguate flat vs percent for HP/ATK/DEF when no `%` sign is present.
 * Uses valid roll sum tables to determine which interpretation is more likely.
 *
 * 1. If value matches a flat roll sum within tolerance (0.5) → flat
 * 2. Else if value matches a percent roll sum within tolerance → percent
 * 3. Else → flat (default)
 */
function disambiguateFlatPercent(
  baseType: 'HP' | 'ATK' | 'DEF',
  value: number,
  rarity?: ArtifactRarity,
): SubstatType {
  const r = rarity ?? 5
  const tolerance = 0.5

  const flatSums = VALID_ROLL_SUMS[r]?.[baseType]
  if (flatSums && nearestDistance(flatSums, value) <= tolerance) {
    return baseType
  }

  const pctType = `${baseType}%` as SubstatType
  const pctSums = VALID_ROLL_SUMS[r]?.[pctType]
  if (pctSums && nearestDistance(pctSums, value) <= tolerance) {
    return pctType
  }

  return baseType
}

/**
 * Binary search for the nearest value in a sorted array, returns the distance.
 */
function nearestDistance(sorted: number[], value: number): number {
  if (sorted.length === 0) return Infinity

  let lo = 0
  let hi = sorted.length - 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (sorted[mid]! < value) lo = mid + 1
    else hi = mid
  }

  let dist = Math.abs(sorted[lo]! - value)
  if (lo > 0) {
    dist = Math.min(dist, Math.abs(sorted[lo - 1]! - value))
  }
  return dist
}

/**
 * Fallback parser for substat lines with OCR-inserted spaces (e.g. "CRIT Rate+1 3.6%").
 * Strips all whitespace from the line, then prefix-matches against canonical stat names
 * (also space-stripped) to identify the type, and extracts the numeric value from the
 * remainder. Longest-matching prefix wins to avoid ambiguity (e.g. "critrate" over "crit").
 * HP/ATK/DEF vs HP%/ATK%/DEF% is disambiguated by whether the value ends with "%",
 * with roll-sum fallback when rarity is available.
 */
function parseStatLineNoSpaces(line: string, rarity?: ArtifactRarity): ParsedStat | null {
  const stripped = line.replace(/\s/g, '')
  const lower = stripped.toLowerCase()

  // Find the longest-matching prefix (STAT_DEFS_BY_KEY_LENGTH is sorted longest-first)
  let bestDef: (typeof STAT_DEFS_BY_KEY_LENGTH)[number] | undefined
  for (const def of STAT_DEFS_BY_KEY_LENGTH) {
    if (lower.startsWith(def.key)) {
      bestDef = def
      break // Already sorted longest-first, first match is best
    }
  }
  if (!bestDef) return null

  const remainder = stripped.slice(bestDef.key.length)
  const match = remainder.match(/^[+]?([\d.]+)(%?)$/)
  if (!match || !match[1]) return null

  const value = parseFloat(match[1])
  if (isNaN(value)) return null

  let type: SubstatType | MainStatType = bestDef.type
  if (bestDef.hasPercentVariant) {
    const hasPercent = match[2] === '%'
    type = resolveAmbiguousStat(type as 'HP' | 'ATK' | 'DEF', value, hasPercent, rarity)
  }

  return { type, value, confidence: 0.8, originalText: line }
}

/**
 * Correct common OCR errors.
 * Uses a single-pass character-by-character approach that reads neighbor context
 * from the original string, avoiding stale-offset bugs from chained replacements.
 */
export function correctOCRErrors(text: string): string {
  const result: string[] = []

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!
    const before = text[i - 1] || ''
    const after = text[i + 1] || ''

    if (ch === 'O' || ch === '0') {
      // Letter context → 'O', digit context → '0'
      if (/[a-zA-Z]/.test(before) || /[a-zA-Z]/.test(after)) {
        result.push('O')
      } else {
        result.push('0')
      }
    } else if (ch === 'l' || ch === 'I') {
      // In digit context, treat as '1'
      if (/[\d.+]/.test(before) || /[\d.%]/.test(after)) {
        result.push('1')
      } else {
        result.push(ch)
      }
    } else if (ch === 'S') {
      // In digit context, treat as '5'
      if (/[\d.+]/.test(before) || /[\d.%]/.test(after)) {
        result.push('5')
      } else {
        result.push(ch)
      }
    } else {
      result.push(ch)
    }
  }

  // Collapse spaces OCR inserts within digit sequences (e.g. "1 3.6" → "13.6")
  return result.join('').replace(/(\d)\s+([\d.])/g, '$1$2')
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
 * Get the main stat value table for a given rarity
 */
function getMainStatTable(rarity: ArtifactRarity): Partial<Record<MainStatType, number[]>> {
  if (rarity === 4) return MAIN_STAT_VALUES_4STAR
  if (rarity === 3) return MAIN_STAT_VALUES_3STAR
  if (rarity === 2) return MAIN_STAT_VALUES_2STAR
  if (rarity === 1) return MAIN_STAT_VALUES_1STAR
  return MAIN_STAT_VALUES_5STAR
}

/**
 * Find the expected main stat value for a given type, rarity, and level.
 * Returns the original value if the type has no table entry or the level is out of bounds.
 * Snaps to the expected value if diff >= 0.2 (beyond display rounding tolerance).
 */
export function findNearestMainStatValue(
  type: MainStatType,
  value: number,
  rarity: ArtifactRarity,
  level: number,
): number {
  const table = getMainStatTable(rarity)
  const values = table[type]
  if (!values) return value
  const expected = values[level]
  if (expected === undefined) return value
  const diff = Math.abs(value - expected)
  if (diff < 0.2) return value
  return expected
}

/**
 * Find nearest valid roll value for a substat.
 * Uses pre-computed lookup table (generated at build time) with binary search.
 */
export function findNearestRollValue(
  type: SubstatType,
  value: number,
  rarity?: ArtifactRarity,
): number {
  const r = rarity ?? 5
  const sums = VALID_ROLL_SUMS[r]?.[type]
  if (!sums || sums.length === 0) return value

  // Binary search for insertion point
  let lo = 0
  let hi = sums.length - 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (sums[mid]! < value) lo = mid + 1
    else hi = mid
  }

  // Compare lo and lo-1 to find the nearest value
  let nearest = sums[lo]!
  if (lo > 0 && Math.abs(sums[lo - 1]! - value) < Math.abs(nearest - value)) {
    nearest = sums[lo - 1]!
  }

  // Keep original if within display rounding tolerance (e.g. 5.18 displays as 5.2)
  if (Math.abs(value - nearest) < 0.2) return value

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
  return SUBSTAT_TYPES.has(type)
}

/**
 * Parse artifact level from text
 * Examples of expected text: "+20", "+0", "20", "11"
 */
export function parseLevel(text: string): number | null {
  const match = text.match(/\d\d?/)
  const level = match && match[0] ? parseInt(match[0], 10) : NaN
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
function minExpectedSubstats(
  rarity: ArtifactRarity | undefined,
  level: number | null | undefined,
): number {
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
  const maxStart =
    rarity === 5 ? 4 : rarity === 4 ? 3 : rarity === 3 ? 2 : rarity === 2 ? 1 : 0
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
  // Subtract display-rounding tolerance before ceiling so that values within 0.2
  // of a roll boundary (e.g. 7.3 ≈ one Tier-4 roll of 7.29) aren't bumped up by one.
  return Math.max(1, Math.ceil((value - 0.19) / maxRoll))
}

/**
 * Parse artifact from region-based OCR results
 * More accurate than full-text parsing because each field is extracted from a specific region
 */
export function parseArtifactFromRegions(
  regionResults: RegionOCRResult[],
  starCount?: 1 | 2 | 3 | 4 | 5,
): OCRResult {
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
  const mainStatParsed = parseStatLine(mainStatNameText + '+' + mainStatValueText, rarity)
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
      errors.push(
        `Could not parse main stat from: name="${mainStatNameText}", value="${mainStatValueText}"`,
      )
    }
  }

  if (mainStat && rarity != null && level != null) {
    const corrected = findNearestMainStatValue(mainStat.type, mainStat.value, rarity, level)
    if (corrected !== mainStat.value) {
      const diff = Math.abs(mainStat.value - corrected)
      if (diff >= 1.0) {
        errors.push(
          `Main stat value ${mainStat.value} does not match expected ${corrected} for +${level} ${rarity}★`,
        )
      }
      mainStat = { ...mainStat, value: corrected }
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
    const parsed = parseStatLine(correctedText, rarity)

    if (parsed && isSubstatType(parsed.type)) {
      const corrected = validateAndCorrectStat(parsed, rarity)
      substats.push({
        type: corrected.type as SubstatType,
        value: corrected.value,
        rollCount: rarity
          ? minRollsNeeded(corrected.type as SubstatType, corrected.value, rarity)
          : undefined,
        ...(isUnactivated ? { unactivated: true } : {}),
      })
    } else {
      errors.push(`Could not parse substat ${i} from: "${text}"`)
    }
  }

  // Validate total rolls
  if (rarity != null && level != null && substats.length > 0) {
    const maxRolls = maxTotalRolls(rarity, level)
    const minRolls = substats.reduce(
      (sum, s) => sum + minRollsNeeded(s.type, s.value, rarity),
      0,
    )
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
    pieceName: pieceNameText || undefined,
    mainStat,
    substats: substats.length > 0 ? substats : undefined,
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
  return STAT_ALIAS_MAP.get(normalized) ?? null
}
