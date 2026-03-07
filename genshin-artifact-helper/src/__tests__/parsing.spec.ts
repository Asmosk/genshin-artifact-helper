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
  parseRarity,
  parseSlot,
  parseArtifact,
  type ParsedStat,
} from '@/utils/parsing'

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

  it('should parse level with "Level" text', () => {
    expect(parseLevel('Level 20')).toBe(20)
    expect(parseLevel('Level: 16')).toBe(16)
  })

  it('should parse level with "Lv." abbreviation', () => {
    expect(parseLevel('Lv. 20')).toBe(20)
    expect(parseLevel('Lv.16')).toBe(16)
  })

  it('should return null for invalid input', () => {
    expect(parseLevel('Random text')).toBeNull()
    expect(parseLevel('')).toBeNull()
  })
})

describe('parseRarity', () => {
  it('should parse star symbols', () => {
    expect(parseRarity('★★★★★')).toBe(5)
    expect(parseRarity('★★★★')).toBe(4)
    expect(parseRarity('★★★')).toBe(3)
  })

  it('should parse star emoji', () => {
    expect(parseRarity('⭐⭐⭐⭐⭐')).toBe(5)
  })

  it('should parse text format', () => {
    expect(parseRarity('5 star')).toBe(5)
    expect(parseRarity('4star')).toBe(4)
    expect(parseRarity('3 Star')).toBe(3)
  })

  it('should parse just number', () => {
    expect(parseRarity('5')).toBe(5)
    expect(parseRarity('4')).toBe(4)
  })

  it('should return null for invalid rarity', () => {
    expect(parseRarity('2')).toBeNull()
    expect(parseRarity('6')).toBeNull()
    expect(parseRarity('Random')).toBeNull()
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

describe('parseArtifact', () => {
  it('should parse complete artifact text', () => {
    const ocrText = `
      Emblem of Severed Fate
      Circlet of Logos
      ★★★★★
      +20
      CRIT Rate 31.1%
      CRIT DMG+21.0%
      ATK+16.9%
      Energy Recharge+11.0%
      DEF+37
    `

    const result = parseArtifact(ocrText)

    expect(result.confidence).toBeGreaterThan(0)
    expect(result.errors.length).toBeGreaterThan(0) // Some fields might not be parsed
    expect(result.artifact.level).toBe(20)
    expect(result.artifact.rarity).toBe(5)
    expect(result.artifact.slot).toBe('Circlet')
    expect(result.artifact.mainStat).toBeDefined()
    expect(result.artifact.substats).toBeDefined()
    expect(result.artifact.substats?.length).toBeGreaterThan(0)
  })

  it('should handle OCR errors and correct them', () => {
    const ocrText = `
      +2O
      CRIT Rate+3.S%
      ATK+I6.9%
      HP+29B
    `

    const result = parseArtifact(ocrText)

    expect(result.artifact.level).toBe(20)
    const stats = result.artifact.substats || []
    const atkStat = stats.find((s) => s.type === 'ATK%')
    expect(atkStat?.value).toBeCloseTo(16.9, 1)
  })

  it('should return errors for missing fields', () => {
    const ocrText = 'Random text with no stats'

    const result = parseArtifact(ocrText)

    expect(result.errors.length).toBeGreaterThan(0)
    expect(result.confidence).toBe(0)
  })

  it('should handle partial data', () => {
    const ocrText = `
      +16
      CRIT Rate+3.5%
      CRIT DMG+7.0%
    `

    const result = parseArtifact(ocrText)

    expect(result.artifact.level).toBe(16)
    expect(result.artifact.substats).toBeDefined()
    expect(result.errors).toContain('Could not parse artifact rarity')
    expect(result.errors).toContain('Could not parse artifact slot')
  })
})
