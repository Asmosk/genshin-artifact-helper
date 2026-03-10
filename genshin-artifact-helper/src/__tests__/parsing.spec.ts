/**
 * Unit tests for artifact text parsing
 */

import { describe, it, expect } from 'vitest'
import {
  parseStatLine,
  correctOCRErrors,
  findNearestRollValue,
  validateAndCorrectStat,
  parseLevel,
  parseSlot,
  parseArtifactFromRegions,
  type ParsedStat,
} from '@/utils/parsing'
import type { RegionOCRResult } from '@/types/ocr-regions'

describe('parseStatLine', () => {
  it('should parse CRIT Rate with percentage', () => {
    const result = parseStatLine('CRIT Rate+3.5%')
    expect(result).toMatchObject({
      type: 'CRIT Rate',
      value: 3.5,
    })
    expect(result?.confidence).toBeGreaterThan(0.8)
  })

  it('should parse CRIT DMG with percentage', () => {
    const result = parseStatLine('CRIT DMG+21.0%')
    expect(result).toMatchObject({
      type: 'CRIT DMG',
      value: 21.0,
    })
  })

  it('should parse ATK% with percentage', () => {
    const result = parseStatLine('ATK+16.9%')
    expect(result).toMatchObject({
      type: 'ATK%',
      value: 16.9,
    })
  })

  it('should parse flat ATK without percentage', () => {
    const result = parseStatLine('ATK+19')
    expect(result).toMatchObject({
      type: 'ATK',
      value: 19,
    })
  })

  it('should parse HP% with percentage', () => {
    const result = parseStatLine('HP+14.6%')
    expect(result).toMatchObject({
      type: 'HP%',
      value: 14.6,
    })
  })

  it('should parse flat HP without percentage', () => {
    const result = parseStatLine('HP+298')
    expect(result).toMatchObject({
      type: 'HP',
      value: 298,
    })
  })

  it('should parse DEF%', () => {
    const result = parseStatLine('DEF+21.9%')
    expect(result).toMatchObject({
      type: 'DEF%',
      value: 21.9,
    })
  })

  it('should parse flat DEF', () => {
    const result = parseStatLine('DEF+23')
    expect(result).toMatchObject({
      type: 'DEF',
      value: 23,
    })
  })

  it('should parse Elemental Mastery', () => {
    const result = parseStatLine('Elemental Mastery+23')
    expect(result).toMatchObject({
      type: 'Elemental Mastery',
      value: 23,
    })
  })

  it('should parse Energy Recharge', () => {
    const result = parseStatLine('Energy Recharge+11.0%')
    expect(result).toMatchObject({
      type: 'Energy Recharge',
      value: 11.0,
    })
  })

  it('should handle spacing variations', () => {
    const result1 = parseStatLine('CRIT   Rate  +  3.5  %')
    const result2 = parseStatLine('CRITRate+3.5%')
    expect(result1?.type).toBe('CRIT Rate')
    expect(result2?.type).toBe('CRIT Rate')
  })

  it('should handle missing + sign', () => {
    const result = parseStatLine('CRIT Rate 3.5%')
    expect(result).toMatchObject({
      type: 'CRIT Rate',
      value: 3.5,
    })
  })

  it('should handle missing % sign', () => {
    const result = parseStatLine('CRIT Rate+3.5')
    expect(result).toMatchObject({
      type: 'CRIT Rate',
      value: 3.5,
    })
  })

  it('should return null for invalid lines', () => {
    expect(parseStatLine('')).toBeNull()
    expect(parseStatLine('Random text')).toBeNull()
    expect(parseStatLine('123')).toBeNull()
  })
})

describe('correctOCRErrors', () => {
  it('should correct O to 0 in numeric context', () => {
    expect(correctOCRErrors('+2O.0')).toBe('+20.0')
    expect(correctOCRErrors('1O5')).toBe('105')
  })

  it('should keep O in text context', () => {
    expect(correctOCRErrors('OCR')).toBe('OCR')
    expect(correctOCRErrors('CRIT')).toContain('CRIT')
  })

  it('should correct I to 1 in numeric context', () => {
    expect(correctOCRErrors('+I6.9')).toBe('+16.9')
    expect(correctOCRErrors('2I.0')).toBe('21.0')
  })

  it('should correct l (lowercase L) to 1 in numeric context', () => {
    expect(correctOCRErrors('+l6.9')).toBe('+16.9')
  })

  it('should correct S to 5 in numeric context', () => {
    expect(correctOCRErrors('+3.S')).toBe('+3.5')
    expect(correctOCRErrors('S.83')).toBe('5.83')
  })

  it('should handle multiple corrections', () => {
    expect(correctOCRErrors('CRIT Rate+3.S%')).toBe('CRIT Rate+3.5%')
    expect(correctOCRErrors('ATK+I9')).toBe('ATK+19')
  })
})

describe('findNearestRollValue', () => {
  it('should find exact roll value', () => {
    expect(findNearestRollValue('CRIT Rate', 3.89)).toBe(3.89)
    expect(findNearestRollValue('CRIT DMG', 7.77)).toBe(7.77)
  })

  it('should keep value within display rounding tolerance of a valid roll', () => {
    expect(findNearestRollValue('CRIT Rate', 3.5)).toBe(3.5)
    // 3.6 is within 0.2 of the valid roll 3.5 — UI rounding, keep as-is
    expect(findNearestRollValue('CRIT Rate', 3.6)).toBe(3.6)
  })

  it('should keep value within display rounding tolerance of a multi-roll combination', () => {
    // 3.89 * 2 = 7.78; 7.8 is within 0.2 — keep as-is
    expect(findNearestRollValue('CRIT Rate', 7.8)).toBe(7.8)
    // 3.5 * 3 = 10.5; 10.6 is within 0.2 — keep as-is
    expect(findNearestRollValue('CRIT Rate', 10.6)).toBe(10.6)
  })

  it('should handle flat ATK values', () => {
    expect(findNearestRollValue('ATK', 19.45)).toBe(19.45)
    expect(findNearestRollValue('ATK', 19)).toBeCloseTo(19.45, 0)
  })

  it('should use 5* roll table by default or when rarity=5', () => {
    // 2.5 is 0.22 away from the nearest 5* roll (2.72) → beyond 0.2 tolerance → snaps to 2.72
    // 5* rolls: [2.72, 3.11, 3.5, 3.89]
    expect(findNearestRollValue('CRIT Rate', 2.5, 5)).toBe(2.72)
    expect(findNearestRollValue('CRIT Rate', 2.5, undefined)).toBe(2.72)
  })

  it('should use 4* roll table when rarity=4', () => {
    // 2.5 is only 0.01 away from the 4* Tier 2 roll (2.49) → within 0.2 tolerance → keep as-is
    // 4* rolls: [2.18, 2.49, 2.80, 3.11]
    expect(findNearestRollValue('CRIT Rate', 2.5, 4)).toBe(2.5)
  })

  it('should use 3* roll table when rarity=3', () => {
    // 3* CRIT Rate: [1.63, 1.86, 2.10, 2.33]
    // 2.5 is within 0.2 of 2.33 → keep as-is
    expect(findNearestRollValue('CRIT Rate', 2.5, 3)).toBe(2.5)
    // 1.9 is within 0.2 of 1.86 → keep as-is (would snap to 2.18 with 4* table)
    expect(findNearestRollValue('CRIT Rate', 1.9, 3)).toBe(1.9)
    // 2.10 is exact 3* Tier 3 → keep as-is
    expect(findNearestRollValue('CRIT Rate', 2.1, 3)).toBe(2.1)
  })

  it('should snap to 4* table when 3* value is out of tolerance for 4*', () => {
    // 1.9 is 0.28 away from nearest 4* roll (2.18) → snaps to 2.18
    expect(findNearestRollValue('CRIT Rate', 1.9, 4)).toBe(2.18)
  })
})

describe('validateAndCorrectStat', () => {
  it('should correct stat when value is beyond display rounding tolerance', () => {
    // ATK rolls: 13.62, 15.56, 17.51, 19.45 — gap between rolls is ~1.9
    // 19 is 0.45 away from 19.45 (beyond 0.2 tolerance) → snap to 19.45
    const stat: ParsedStat = {
      type: 'ATK',
      value: 19,
      confidence: 0.9,
      originalText: 'ATK+19',
    }
    const corrected = validateAndCorrectStat(stat)
    expect(corrected.value).toBeCloseTo(19.45, 0)
    expect(corrected.confidence).toBeLessThan(stat.confidence)
  })

  it('should not change already valid values', () => {
    const stat: ParsedStat = {
      type: 'CRIT Rate',
      value: 3.89,
      confidence: 0.9,
      originalText: 'CRIT Rate+3.89%',
    }
    const corrected = validateAndCorrectStat(stat)
    expect(corrected.value).toBe(3.89)
    expect(corrected.confidence).toBe(stat.confidence)
  })

  it('should use 4* rolls when rarity=4 is passed', () => {
    // 2.8 is exact 4* Tier 3 → no correction
    const stat: ParsedStat = { type: 'CRIT Rate', value: 2.8, confidence: 0.9, originalText: 'CRIT Rate+2.8%' }
    const corrected = validateAndCorrectStat(stat, 4)
    expect(corrected.value).toBe(2.8)
    expect(corrected.confidence).toBe(0.9)
  })

})

describe('parseLevel', () => {
  it('should parse level with + sign', () => {
    expect(parseLevel('+20')).toBe(20)
    expect(parseLevel('+0')).toBe(0)
    expect(parseLevel('+16')).toBe(16)
  })

  it('should parse level with garbage characters', () => {
    expect(parseLevel('-20')).toBe(20);
    expect(parseLevel('`Õ┐0')).toBe(0);
  })

  it('should return null for invalid input', () => {
    expect(parseLevel('Random text')).toBeNull()
    expect(parseLevel('')).toBeNull()
  })
})

describe('parseSlot', () => {
  it('should parse Flower', () => {
    expect(parseSlot('Flower')).toBe('Flower')
    expect(parseSlot('flower of life')).toBe('Flower')
  })

  it('should parse Plume', () => {
    expect(parseSlot('Plume')).toBe('Plume')
    expect(parseSlot('Plume of Death')).toBe('Plume')
    expect(parseSlot('Feather')).toBe('Plume')
  })

  it('should parse Sands', () => {
    expect(parseSlot('Sands')).toBe('Sands')
    expect(parseSlot('Sands of Eon')).toBe('Sands')
    expect(parseSlot('Timepiece')).toBe('Sands')
  })

  it('should parse Goblet', () => {
    expect(parseSlot('Goblet')).toBe('Goblet')
    expect(parseSlot('Goblet of Eonothem')).toBe('Goblet')
    expect(parseSlot('Cup')).toBe('Goblet')
  })

  it('should parse Circlet', () => {
    expect(parseSlot('Circlet')).toBe('Circlet')
    expect(parseSlot('Circlet of Logos')).toBe('Circlet')
    expect(parseSlot('Crown')).toBe('Circlet')
  })

  it('should be case insensitive', () => {
    expect(parseSlot('FLOWER')).toBe('Flower')
    expect(parseSlot('plume')).toBe('Plume')
  })

  it('should return null for invalid slots', () => {
    expect(parseSlot('Random')).toBeNull()
    expect(parseSlot('')).toBeNull()
  })
})

describe('parseArtifactFromRegions', () => {
  function makeRegion(regionName: string, text: string): RegionOCRResult {
    return { regionName, text, confidence: 0.9, position: { x: 0, y: 0, width: 100, height: 20 } }
  }

  it('should mark substat as unactivated when region text contains "(unactivated)" inline', () => {
    const regions: RegionOCRResult[] = [
      makeRegion('pieceName', 'Test Artifact'),
      makeRegion('slotName', 'Goblet'),
      makeRegion('level', '+0'),
      makeRegion('mainStatName', 'Hydro DMG Bonus'),
      makeRegion('mainStatValue', '7.0'),
      makeRegion('substat1', 'DEF+23'),
      makeRegion('substat2', 'ATK+19'),
      makeRegion('substat3', 'CRIT Rate+3.5%'),
      makeRegion('substat4', 'HP+239(unactivated)'),
    ]

    const result = parseArtifactFromRegions(regions, 5)

    const hpStat = result.artifact.substats?.find((s) => s.type === 'HP')
    expect(hpStat).toBeDefined()
    expect(hpStat?.unactivated).toBe(true)

    const defStat = result.artifact.substats?.find((s) => s.type === 'DEF')
    expect(defStat?.unactivated).toBeUndefined()
  })

  it('should mark substat as unactivated when region text contains "(unactivated)" on a separate line', () => {
    const regions: RegionOCRResult[] = [
      makeRegion('pieceName', 'Test Artifact'),
      makeRegion('slotName', 'Goblet'),
      makeRegion('level', '+0'),
      makeRegion('mainStatName', 'Hydro DMG Bonus'),
      makeRegion('mainStatValue', '7.0'),
      makeRegion('substat1', 'DEF+23'),
      makeRegion('substat2', 'ATK+19'),
      makeRegion('substat3', 'CRIT Rate+3.5%'),
      makeRegion('substat4', 'HP+239\n(unactivated)'),
    ]

    const result = parseArtifactFromRegions(regions, 5)

    const hpStat = result.artifact.substats?.find((s) => s.type === 'HP')
    expect(hpStat).toBeDefined()
    expect(hpStat?.unactivated).toBe(true)
  })

  it('4* at level 0 with only 2 substats should not produce substat 3 empty error', () => {
    const regions: RegionOCRResult[] = [
      makeRegion('pieceName', 'Test Artifact'),
      makeRegion('slotName', 'Flower'),
      makeRegion('level', '+0'),
      makeRegion('mainStatName', 'HP'),
      makeRegion('mainStatValue', '717'),
      makeRegion('substat1', 'ATK+15'),
      makeRegion('substat2', 'DEF+18'),
    ]
    const result = parseArtifactFromRegions(regions, 4)
    expect(result.errors.some((e) => e.includes('Substat 3 is empty'))).toBe(false)
  })

  it('4* at level 8 with only 2 substats should produce substat 3 and 4 empty errors', () => {
    const regions: RegionOCRResult[] = [
      makeRegion('pieceName', 'Test Artifact'),
      makeRegion('slotName', 'Flower'),
      makeRegion('level', '+8'),
      makeRegion('mainStatName', 'HP'),
      makeRegion('mainStatValue', '1348'),
      makeRegion('substat1', 'ATK+15'),
      makeRegion('substat2', 'DEF+18'),
    ]
    const result = parseArtifactFromRegions(regions, 4)
    expect(result.errors.some((e) => e.includes('Substat 3 is empty'))).toBe(true)
    expect(result.errors.some((e) => e.includes('Substat 4 is empty'))).toBe(true)
  })

  it('5* at level 0 with only 3 substats should not produce substat 4 empty error', () => {
    const regions: RegionOCRResult[] = [
      makeRegion('pieceName', 'Test Artifact'),
      makeRegion('slotName', 'Goblet'),
      makeRegion('level', '+0'),
      makeRegion('mainStatName', 'Hydro DMG Bonus'),
      makeRegion('mainStatValue', '7.0'),
      makeRegion('substat1', 'DEF+23'),
      makeRegion('substat2', 'ATK+19'),
      makeRegion('substat3', 'CRIT Rate+3.5%'),
    ]
    const result = parseArtifactFromRegions(regions, 5)
    expect(result.errors.some((e) => e.includes('Substat 4 is empty'))).toBe(false)
  })

  it('5* at level 4 with only 3 substats should produce substat 4 empty error', () => {
    const regions: RegionOCRResult[] = [
      makeRegion('pieceName', 'Test Artifact'),
      makeRegion('slotName', 'Goblet'),
      makeRegion('level', '+4'),
      makeRegion('mainStatName', 'Hydro DMG Bonus'),
      makeRegion('mainStatValue', '9.0'),
      makeRegion('substat1', 'DEF+23'),
      makeRegion('substat2', 'ATK+19'),
      makeRegion('substat3', 'CRIT Rate+3.5%'),
    ]
    const result = parseArtifactFromRegions(regions, 5)
    expect(result.errors.some((e) => e.includes('Substat 4 is empty'))).toBe(true)
  })

  it('2* at level 0 should not require any substats', () => {
    const regions: RegionOCRResult[] = [
      makeRegion('pieceName', 'Test Artifact'),
      makeRegion('slotName', 'Flower'),
      makeRegion('level', '+0'),
      makeRegion('mainStatName', 'HP'),
      makeRegion('mainStatValue', '430'),
    ]
    const result = parseArtifactFromRegions(regions, 2)
    expect(result.errors.some((e) => e.includes('Substat 1 is empty'))).toBe(false)
  })

  it('2* at level 4 with no substats should produce substat 1 empty error', () => {
    const regions: RegionOCRResult[] = [
      makeRegion('pieceName', 'Test Artifact'),
      makeRegion('slotName', 'Flower'),
      makeRegion('level', '+4'),
      makeRegion('mainStatName', 'HP'),
      makeRegion('mainStatValue', '645'),
    ]
    const result = parseArtifactFromRegions(regions, 2)
    expect(result.errors.some((e) => e.includes('Substat 1 is empty'))).toBe(true)
  })

  it('5* +20 artifact with impossibly high substat values should produce total rolls error', () => {
    // 5* +20: maxStart=4, floor(20/4)=5 → maxTotalRolls=9
    // CRIT DMG max 5* roll is 7.77; ceil(46.62/7.77)=6 rolls each × 2 substats = 12 > 9
    const regions: RegionOCRResult[] = [
      makeRegion('pieceName', 'Test Artifact'),
      makeRegion('slotName', 'Goblet'),
      makeRegion('level', '+20'),
      makeRegion('mainStatName', 'Hydro DMG Bonus'),
      makeRegion('mainStatValue', '46.6'),
      makeRegion('substat1', 'CRIT DMG+46.62%'),
      makeRegion('substat2', 'CRIT DMG+46.62%'),
    ]
    const result = parseArtifactFromRegions(regions, 5)
    expect(result.errors.some((e) => e.includes('rolls'))).toBe(true)
  })

  it('5* +20 artifact with valid substat values should not produce total rolls error', () => {
    // maxTotalRolls for 5* +20 = 4 + 5 = 9
    // 4 substats each needing ceil(value/maxRoll) ≤ 9 total
    const regions: RegionOCRResult[] = [
      makeRegion('pieceName', 'Test Artifact'),
      makeRegion('slotName', 'Goblet'),
      makeRegion('level', '+20'),
      makeRegion('mainStatName', 'Hydro DMG Bonus'),
      makeRegion('mainStatValue', '46.6'),
      makeRegion('substat1', 'CRIT DMG+7.77%'),
      makeRegion('substat2', 'CRIT Rate+3.89%'),
      makeRegion('substat3', 'ATK+19'),
      makeRegion('substat4', 'HP+239'),
    ]
    const result = parseArtifactFromRegions(regions, 5)
    expect(result.errors.some((e) => e.includes('rolls'))).toBe(false)
  })

  it('should not set unactivated for normal substats', () => {
    const regions: RegionOCRResult[] = [
      makeRegion('pieceName', 'Test Artifact'),
      makeRegion('slotName', 'Goblet'),
      makeRegion('level', '+20'),
      makeRegion('mainStatName', 'CRIT Rate'),
      makeRegion('mainStatValue', '31.1'),
      makeRegion('substat1', 'CRIT DMG+7.77%'),
      makeRegion('substat2', 'ATK+19'),
      makeRegion('substat3', 'HP+239'),
      makeRegion('substat4', 'DEF%+5.83%'),
    ]

    const result = parseArtifactFromRegions(regions, 5)

    for (const substat of result.artifact.substats ?? []) {
      expect(substat.unactivated).toBeUndefined()
    }
  })
})
