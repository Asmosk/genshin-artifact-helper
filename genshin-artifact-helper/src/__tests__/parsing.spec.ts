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

  it('should find nearest single roll', () => {
    expect(findNearestRollValue('CRIT Rate', 3.5)).toBe(3.5)
    expect(findNearestRollValue('CRIT Rate', 3.6)).toBeCloseTo(3.5, 1)
  })

  it('should find nearest multiple roll value', () => {
    // 3.89 * 2 = 7.78
    expect(findNearestRollValue('CRIT Rate', 7.8)).toBeCloseTo(7.78, 1)
    // 3.5 * 3 = 10.5
    expect(findNearestRollValue('CRIT Rate', 10.6)).toBeCloseTo(10.5, 1)
  })

  it('should handle flat ATK values', () => {
    expect(findNearestRollValue('ATK', 19.45)).toBe(19.45)
    expect(findNearestRollValue('ATK', 19)).toBeCloseTo(19.45, 0)
  })

  it('should keep original value if too far from valid rolls', () => {
    const result = findNearestRollValue('CRIT Rate', 100)
    // Should keep original if difference is > 10%
    expect(result).toBeGreaterThan(50)
  })
})

describe('validateAndCorrectStat', () => {
  it('should correct stat to nearest valid roll', () => {
    const stat: ParsedStat = {
      type: 'CRIT Rate',
      value: 3.6,
      confidence: 0.9,
      originalText: 'CRIT Rate+3.6%',
    }
    const corrected = validateAndCorrectStat(stat)
    expect(corrected.value).toBeCloseTo(3.5, 1)
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

  it('should not correct main stats', () => {
    const stat: ParsedStat = {
      type: 'CRIT Rate' as any,
      value: 31.1, // Main stat value
      confidence: 0.9,
      originalText: 'CRIT Rate 31.1%',
    }
    const corrected = validateAndCorrectStat(stat)
    expect(corrected.value).toBe(31.1)
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
