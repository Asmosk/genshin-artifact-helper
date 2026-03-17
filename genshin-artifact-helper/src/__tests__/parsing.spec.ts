/**
 * Unit tests for artifact text parsing
 */

import { describe, it, expect } from 'vitest'
import {
  parseStatLine,
  correctOCRErrors,
  findNearestRollValue,
  findNearestMainStatValue,
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

  it('should handle high roll sums without issues', () => {
    // 6 max rolls of CRIT Rate: 3.89 * 6 = 23.34
    // This exercises the deepest recursion path
    expect(() => findNearestRollValue('CRIT Rate', 23.34)).not.toThrow()
    expect(findNearestRollValue('CRIT Rate', 23.34)).toBe(23.34)
  })

  it('should terminate quickly on exact match', () => {
    // Exact single roll — should exit immediately
    const start = performance.now()
    findNearestRollValue('CRIT Rate', 3.89)
    const elapsed = performance.now() - start
    expect(elapsed).toBeLessThan(10)
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
  })

  it('should parse Sands', () => {
    expect(parseSlot('Sands')).toBe('Sands')
    expect(parseSlot('Sands of Eon')).toBe('Sands')
  })

  it('should parse Goblet', () => {
    expect(parseSlot('Goblet')).toBe('Goblet')
    expect(parseSlot('Goblet of Eonothem')).toBe('Goblet')
  })

  it('should parse Circlet', () => {
    expect(parseSlot('Circlet')).toBe('Circlet')
    expect(parseSlot('Circlet of Logos')).toBe('Circlet')
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

describe('findNearestMainStatValue', () => {
  it('exact match returns original value', () => {
    expect(findNearestMainStatValue('CRIT Rate', 31.1, 5, 20)).toBe(31.1)
  })

  it('display rounding (diff < 0.2) keeps original value', () => {
    // 5★ CRIT Rate at +20 = 31.1; 31.0 is diff 0.1 — within tolerance, keep as-is
    expect(findNearestMainStatValue('CRIT Rate', 31.0, 5, 20)).toBe(31.0)
  })

  it('OCR error beyond display rounding snaps to expected value', () => {
    // 5★ HP% at +20 = 46.6; 46.9 is diff 0.3 — beyond 0.2 tolerance, snap
    expect(findNearestMainStatValue('HP%', 46.9, 5, 20)).toBe(46.6)
  })

  it('unknown type (DEF flat) returns original value unchanged', () => {
    expect(findNearestMainStatValue('DEF', 100, 5, 20)).toBe(100)
  })

  it('level 0 values are validated correctly', () => {
    expect(findNearestMainStatValue('HP', 717, 5, 0)).toBe(717)
  })

  it('4★ values are validated correctly', () => {
    expect(findNearestMainStatValue('CRIT Rate', 23.2, 4, 16)).toBe(23.2)
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

  it('valid main stat value produces no main stat error', () => {
    const regions: RegionOCRResult[] = [
      makeRegion('pieceName', 'Test Artifact'),
      makeRegion('slotName', 'Circlet'),
      makeRegion('level', '+20'),
      makeRegion('mainStatName', 'CRIT Rate'),
      makeRegion('mainStatValue', '31.1'),
      makeRegion('substat1', 'CRIT DMG+7.77%'),
      makeRegion('substat2', 'ATK+19'),
      makeRegion('substat3', 'HP+239'),
      makeRegion('substat4', 'DEF%+5.83%'),
    ]
    const result = parseArtifactFromRegions(regions, 5)
    expect(result.errors.some((e) => e.includes('Main stat value'))).toBe(false)
  })

  it('OCR-off main stat value (diff < 1.0) is silently corrected with no error', () => {
    // 5★ CRIT Rate at +20 = 31.1; OCR reads 30.5 (diff 0.6 — snapped, no error)
    const regions: RegionOCRResult[] = [
      makeRegion('pieceName', 'Test Artifact'),
      makeRegion('slotName', 'Circlet'),
      makeRegion('level', '+20'),
      makeRegion('mainStatName', 'CRIT Rate'),
      makeRegion('mainStatValue', '30.5'),
      makeRegion('substat1', 'CRIT DMG+7.77%'),
      makeRegion('substat2', 'ATK+19'),
      makeRegion('substat3', 'HP+239'),
      makeRegion('substat4', 'DEF%+5.83%'),
    ]
    const result = parseArtifactFromRegions(regions, 5)
    expect(result.errors.some((e) => e.includes('Main stat value'))).toBe(false)
    expect(result.artifact.mainStat?.value).toBe(31.1)
  })

  it('rollCount: DEF%+7.3 on 5★ is 1 roll (within display rounding of Tier-4 roll 7.29)', () => {
    const regions: RegionOCRResult[] = [
      makeRegion('pieceName', 'Test Artifact'),
      makeRegion('slotName', 'Flower'),
      makeRegion('level', '+0'),
      makeRegion('mainStatName', 'HP'),
      makeRegion('mainStatValue', '717'),
      makeRegion('substat1', 'DEF+7.3%'),
      makeRegion('substat2', 'ATK+15'),
    ]
    const result = parseArtifactFromRegions(regions, 5)
    const stat = result.artifact.substats?.find((s) => s.type === 'DEF%')
    expect(stat).toBeDefined()
    expect(stat?.rollCount).toBe(1)
  })

  it('rollCount: CRIT Rate+5.8 on 5★ is 2 rolls (mixed-tier combo 2.72+3.11=5.83 within rounding)', () => {
    const regions: RegionOCRResult[] = [
      makeRegion('pieceName', 'Test Artifact'),
      makeRegion('slotName', 'Flower'),
      makeRegion('level', '+0'),
      makeRegion('mainStatName', 'HP'),
      makeRegion('mainStatValue', '717'),
      makeRegion('substat1', 'CRIT Rate+5.8%'),
      makeRegion('substat2', 'ATK+15'),
    ]
    const result = parseArtifactFromRegions(regions, 5)
    const stat = result.artifact.substats?.find((s) => s.type === 'CRIT Rate')
    expect(stat).toBeDefined()
    expect(stat?.rollCount).toBe(2)
  })

  it('rollCount: CRIT DMG+9.9 on 4★ is 2 rolls (4★ max roll 6.22, ceil(9.9/6.22)=2)', () => {
    const regions: RegionOCRResult[] = [
      makeRegion('pieceName', 'Test Artifact'),
      makeRegion('slotName', 'Flower'),
      makeRegion('level', '+0'),
      makeRegion('mainStatName', 'HP'),
      makeRegion('mainStatValue', '645'),
      makeRegion('substat1', 'CRIT DMG+9.9%'),
      makeRegion('substat2', 'ATK+15'),
    ]
    const result = parseArtifactFromRegions(regions, 4)
    const stat = result.artifact.substats?.find((s) => s.type === 'CRIT DMG')
    expect(stat).toBeDefined()
    expect(stat?.rollCount).toBe(2)
  })

  it('badly wrong main stat value (diff >= 1.0) produces a main stat error', () => {
    // 5★ CRIT Rate at +20 = 31.1; OCR reads 29.5 (diff 1.6 — error added)
    const regions: RegionOCRResult[] = [
      makeRegion('pieceName', 'Test Artifact'),
      makeRegion('slotName', 'Circlet'),
      makeRegion('level', '+20'),
      makeRegion('mainStatName', 'CRIT Rate'),
      makeRegion('mainStatValue', '29.5'),
      makeRegion('substat1', 'CRIT DMG+7.77%'),
      makeRegion('substat2', 'ATK+19'),
      makeRegion('substat3', 'HP+239'),
      makeRegion('substat4', 'DEF%+5.83%'),
    ]
    const result = parseArtifactFromRegions(regions, 5)
    expect(result.errors.some((e) => e.includes('Main stat value'))).toBe(true)
  })
})
