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
import { SUBSTAT_ROLLS } from '@/types/artifact'
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
 * Find nearest valid roll value for a substat
 */
export function findNearestRollValue(type: SubstatType, value: number): number {
  const validRolls = SUBSTAT_ROLLS[type]
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

  // If difference is > 10% of value, keep original (might be correct)
  if (minDiff > value * 0.1) {
    return value
  }

  return nearest
}

/**
 * Validate and correct a parsed stat
 */
export function validateAndCorrectStat(stat: ParsedStat): ParsedStat {
  // Only correct substats (not main stats)
  if (!isSubstatType(stat.type)) {
    return stat
  }

  const correctedValue = findNearestRollValue(stat.type as SubstatType, stat.value)

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
 * Examples: "+20", "+0", "Level 16"
 */
export function parseLevel(text: string): number | null {
  const patterns = [/\+(\d+)/, /Level\s*(\d+)/i, /Lv\.\s*(\d+)/i]

  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match && match[1]) {
      return parseInt(match[1], 10)
    }
  }

  return null
}

/**
 * Parse artifact rarity from text or star symbols
 * Examples: "5", "★★★★★"
 */
export function parseRarity(text: string): ArtifactRarity | null {
  // Count star symbols
  const starCount = (text.match(/[★⭐]/g) || []).length
  if (starCount >= 3 && starCount <= 5) {
    return starCount as ArtifactRarity
  }

  // Look for number
  const match = text.match(/(\d)\s*[sS]tar/i) || text.match(/^(\d)$/)
  if (match && match[1]) {
    const num = parseInt(match[1], 10)
    if (num >= 3 && num <= 5) {
      return num as ArtifactRarity
    }
  }

  return null
}

/**
 * Parse artifact slot from text
 */
export function parseSlot(text: string): ArtifactSlot | null {
  const normalized = text.trim().toLowerCase()

  if (normalized.includes('flower')) return 'Flower'
  if (normalized.includes('plume') || normalized.includes('feather')) return 'Plume'
  if (normalized.includes('sands') || normalized.includes('timepiece')) return 'Sands'
  if (normalized.includes('goblet') || normalized.includes('cup')) return 'Goblet'
  if (normalized.includes('circlet') || normalized.includes('crown')) return 'Circlet'

  return null
}

/**
 * Parse complete artifact from OCR text
 */
export function parseArtifact(ocrText: string): OCRResult {
  const lines = ocrText.split('\n').map((l) => l.trim()).filter((l) => l.length > 0)
  const errors: string[] = []
  let confidence = 1.0

  // Correct OCR errors in all text
  const correctedLines = lines.map(correctOCRErrors)

  // Try to extract stats
  const parsedStats: ParsedStat[] = []
  for (const line of correctedLines) {
    const stat = parseStatLine(line)
    if (stat) {
      const corrected = validateAndCorrectStat(stat)
      parsedStats.push(corrected)
      confidence = Math.min(confidence, corrected.confidence)
    }
  }

  if (parsedStats.length === 0) {
    errors.push('No stats could be parsed from OCR text')
    confidence = 0
  }

  // Separate main stat (usually first or has highest value) and substats
  let mainStat: { type: MainStatType; value: number } | undefined
  const substats: Substat[] = []

  // For now, assume first stat is main stat if we have multiple stats
  if (parsedStats.length > 0) {
    const first = parsedStats[0]
    if (first) {
      mainStat = {
        type: first.type as MainStatType,
        value: first.value,
      }
    }

    // Rest are substats
    for (let i = 1; i < parsedStats.length && i <= 4; i++) {
      const stat = parsedStats[i]
      if (stat && isSubstatType(stat.type)) {
        substats.push({
          type: stat.type as SubstatType,
          value: stat.value,
        })
      }
    }
  }

  // Try to parse level
  let level: number | undefined
  for (const line of correctedLines) {
    const parsedLevel = parseLevel(line)
    if (parsedLevel !== null) {
      level = parsedLevel
      break
    }
  }

  // Try to parse rarity
  let rarity: ArtifactRarity | undefined
  for (const line of correctedLines) {
    const parsedRarity = parseRarity(line)
    if (parsedRarity !== null) {
      rarity = parsedRarity
      break
    }
  }

  // Try to parse slot
  let slot: ArtifactSlot | undefined
  for (const line of correctedLines) {
    const parsedSlot = parseSlot(line)
    if (parsedSlot !== null) {
      slot = parsedSlot
      break
    }
  }

  // Build partial artifact
  const artifact: Partial<Artifact> = {
    level,
    rarity,
    slot,
    mainStat,
    substats: substats.length > 0 ? substats : undefined,
  }

  // Add warnings
  if (!level) errors.push('Could not parse artifact level')
  if (!rarity) errors.push('Could not parse artifact rarity')
  if (!slot) errors.push('Could not parse artifact slot')
  if (!mainStat) errors.push('Could not parse main stat')
  if (substats.length === 0) errors.push('Could not parse any substats')

  return {
    artifact,
    confidence,
    rawText: ocrText,
    errors,
  }
}

/**
 * Parse artifact from region-based OCR results
 * More accurate than full-text parsing because each field is extracted from a specific region
 */
export function parseArtifactFromRegions(regionResults: RegionOCRResult[]): OCRResult {
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

  // Parse rarity (from text or star count will be handled separately)
  const rarityText = regions.get('rarity')?.text || ''
  const rarity = parseRarity(rarityText)
  if (!rarity && rarityText) {
    errors.push(`Could not parse rarity from: "${rarityText}"`)
  }

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
      if (i <= 3) {
        // First 3 substats should always exist
        errors.push(`Substat ${i} is empty`)
      }
      continue
    }

    // Skip "Unlocked" text
    if (text.toLowerCase().includes('unlocked')) {
      continue
    }

    // Apply OCR error correction
    const correctedText = correctOCRErrors(text)
    const parsed = parseStatLine(correctedText)

    if (parsed && isSubstatType(parsed.type)) {
      const corrected = validateAndCorrectStat(parsed)
      substats.push({
        type: corrected.type as SubstatType,
        value: corrected.value,
      })
    } else {
      errors.push(`Could not parse substat ${i} from: "${text}"`)
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
    'defense': 'DEF',
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
