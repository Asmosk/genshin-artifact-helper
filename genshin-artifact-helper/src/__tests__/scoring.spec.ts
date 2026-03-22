/**
 * Unit tests for artifact scoring
 */

import { describe, it, expect } from 'vitest'
import { calculateSubstatScore, calculateArtifactScore, getRemainingRolls } from '@/utils/scoring'
import type { Artifact, BuildProfile } from '@/types/artifact'

// Helper to create a minimal 5* artifact for tests
function makeArtifact(overrides: Partial<Artifact>): Artifact {
  return {
    id: 'test',
    set: 'Gladiator\'s Finale',
    slot: 'Circlet',
    rarity: 5,
    level: 20,
    maxLevel: 20,
    mainStat: { type: 'CRIT Rate', value: 31.1 },
    substats: [],
    ...overrides,
  }
}

// Build profile from SKILL.md examples: CRIT Rate=1, CRIT DMG=1, EM=1 (others 0)
const critEmProfile: BuildProfile = {
  name: 'Crit+EM',
  weights: {
    'CRIT Rate': 1,
    'CRIT DMG': 1,
    'Elemental Mastery': 1,
  },
}

// Build profile from SKILL.md example #2: CRIT Rate=1, CRIT DMG=1, DEF%=1 (others 0)
const critDefProfile: BuildProfile = {
  name: 'Crit+DEF%',
  weights: {
    'CRIT Rate': 1,
    'CRIT DMG': 1,
    'DEF%': 1,
  },
}

describe('calculateSubstatScore', () => {
  // From SKILL.md: Elemental Mastery 37 → 37 / 139.86 = 26%
  it('scores Elemental Mastery 37 as ~26%', () => {
    const score = calculateSubstatScore({ type: 'Elemental Mastery', value: 37 })
    expect(score).toBeCloseTo(26, 0)
  })

  // From SKILL.md example #1 artifact: CRIT DMG 14.8% → 14.8 / 46.62 = 32%
  it('scores CRIT DMG 14.8 as ~32%', () => {
    const score = calculateSubstatScore({ type: 'CRIT DMG', value: 14.8 })
    expect(score).toBeCloseTo(32, 0)
  })

  it('scores Energy Recharge as 0% when type has no weight in substats (but still scores value)', () => {
    // Energy Recharge max is 38.88, value 10.4 → 26.7%
    const score = calculateSubstatScore({ type: 'Energy Recharge', value: 10.4 })
    expect(score).toBeCloseTo(26.7, 0)
  })

  it('returns 0 for zero value', () => {
    expect(calculateSubstatScore({ type: 'CRIT Rate', value: 0 })).toBe(0)
  })

  it('caps at 100 for value exceeding theoretical max', () => {
    expect(calculateSubstatScore({ type: 'CRIT Rate', value: 9999 })).toBe(100)
  })
})

describe('calculateArtifactScore - SKILL.md Example #1 (level 20, full score)', () => {
  // 5* artifact at level 20
  // Substats: Energy Recharge+10.4%, HP%+9.9%, CRIT DMG+14.8%, Elemental Mastery+37
  // Weights: CRIT Rate=1, CRIT DMG=1, EM=1  (3 valued stats in profile)
  // max_achievable = (3 + 5*1) / 6 = 1.333
  // sum = 31.7 + 26.5 = 58.2%
  // Expected score: 58.2 / 1.333 = 43.7% ≈ 44%
  it('scores the example artifact at ~44%', () => {
    const artifact = makeArtifact({
      level: 20,
      substats: [
        { type: 'Energy Recharge', value: 10.4 },
        { type: 'HP%', value: 9.9 },
        { type: 'CRIT DMG', value: 14.8 },
        { type: 'Elemental Mastery', value: 37 },
      ],
    })

    const result = calculateArtifactScore(artifact, critEmProfile)

    expect(result.isPotential).toBe(false)
    expect(result.remainingRolls).toBe(0)
    expect(result.totalScore).toBeCloseTo(43.7, 0)
  })

  it('Energy Recharge and HP% have 0 weight contribution', () => {
    const artifact = makeArtifact({
      level: 20,
      substats: [
        { type: 'Energy Recharge', value: 10.4 },
        { type: 'HP%', value: 9.9 },
        { type: 'CRIT DMG', value: 14.8 },
        { type: 'Elemental Mastery', value: 37 },
      ],
    })

    const result = calculateArtifactScore(artifact, critEmProfile)
    const erScore = result.substatScores.find((s) => s.type === 'Energy Recharge')
    const hpScore = result.substatScores.find((s) => s.type === 'HP%')

    expect(erScore?.weight).toBe(0)
    expect(hpScore?.weight).toBe(0)
  })
})

describe('calculateArtifactScore - SKILL.md Example #2 (level 8, potential score)', () => {
  // 5* artifact at level 8
  // Substats: CRIT DMG+7.8%, ATK+33, CRIT Rate+3.5%, DEF%+6.6%
  // Weights: CRIT Rate=1, CRIT DMG=1, DEF%=1  (3 valued stats in profile)
  // 3 remaining rolls assumed at max value → added to CRIT DMG → 7.8 + 3*7.77 = 31.11
  // sum = 66.7 + 0 + 15.0 + 15.1 = 96.8%
  // max_achievable = (3 + 5*1) / 6 = 1.333
  // Expected score: 96.8 / 1.333 = 72.6% ≈ 73%
  it('scores the example artifact at ~73%', () => {
    const artifact = makeArtifact({
      level: 8,
      substats: [
        { type: 'CRIT DMG', value: 7.8 },
        { type: 'ATK', value: 33 },
        { type: 'CRIT Rate', value: 3.5 },
        { type: 'DEF%', value: 6.6 },
      ],
    })

    const result = calculateArtifactScore(artifact, critDefProfile)

    expect(result.isPotential).toBe(true)
    expect(result.remainingRolls).toBe(3)
    expect(result.totalScore).toBeCloseTo(72.6, 0)
  })

  it('has 3 remaining rolls at level 8', () => {
    const artifact = makeArtifact({ level: 8, substats: [] })
    expect(getRemainingRolls(artifact)).toBe(3)
  })
})

describe('getRemainingRolls', () => {
  it('returns 0 for level 20 (max)', () => {
    expect(getRemainingRolls(makeArtifact({ level: 20 }))).toBe(0)
  })

  it('returns 5 for level 0 (4-liner)', () => {
    const artifact = makeArtifact({
      level: 0,
      substats: [
        { type: 'CRIT Rate', value: 3.5 },
        { type: 'CRIT DMG', value: 7.8 },
        { type: 'ATK%', value: 5.25 },
        { type: 'HP%', value: 5.25 },
      ],
    })
    expect(getRemainingRolls(artifact)).toBe(5)
  })

  it('returns 1 for level 16', () => {
    expect(getRemainingRolls(makeArtifact({ level: 16 }))).toBe(1)
  })

  it('returns 4 for level 4', () => {
    expect(getRemainingRolls(makeArtifact({ level: 4 }))).toBe(4)
  })
})

describe('calculateArtifactScore - profile normalization', () => {
  // Profile with 1 valued stat: artifact with that stat at 25% should score 25%
  it('scores 25% when 1-stat profile has that stat at 25% of max', () => {
    const artifact = makeArtifact({
      level: 20,
      substats: [
        { type: 'CRIT Rate', value: 5.8 },
        { type: 'ATK', value: 33 },
        { type: 'HP', value: 500 },
        { type: 'DEF', value: 50 },
      ],
    })
    const profile: BuildProfile = { name: 'test', weights: { 'CRIT Rate': 1 } }
    // max_achievable = (1 + 5*1) / 6 = 1.0
    // sum = 5.8/23.34 * 100 = 24.9%
    // score = 24.9 / 1.0 = 24.9% ≈ 25%
    const result = calculateArtifactScore(artifact, profile)
    expect(result.totalScore).toBeCloseTo(24.9, 0)
  })

  // Profile with 4 valued stats but artifact only has 1: should score lower than the 1-stat profile case
  it('penalizes artifact when profile has 4 valued stats but only 1 is present', () => {
    const artifact = makeArtifact({
      level: 20,
      substats: [
        { type: 'CRIT Rate', value: 5.8 },
        { type: 'ATK', value: 33 },
        { type: 'HP', value: 500 },
        { type: 'DEF', value: 50 },
      ],
    })
    const profile: BuildProfile = {
      name: 'test',
      weights: { 'CRIT Rate': 1, 'CRIT DMG': 1, 'ATK%': 1, 'Elemental Mastery': 1 },
    }
    // max_achievable = (4 + 5*1) / 6 = 1.5
    // sum = 5.8/23.34 * 100 = 24.9%
    // score = 24.9 / 1.5 = 16.6%
    const result = calculateArtifactScore(artifact, profile)
    expect(result.totalScore).toBeCloseTo(16.6, 0)
  })

  // Profile with more than 4 valued stats: capped at top 4 weights
  it('caps profile valued stats at 4 for normalization', () => {
    const artifact = makeArtifact({
      level: 20,
      substats: [
        { type: 'CRIT Rate', value: 23.34 }, // max possible
        { type: 'CRIT DMG', value: 7.77 },   // 1 roll
        { type: 'ATK%', value: 5.83 },        // 1 roll
        { type: 'HP%', value: 5.83 },         // 1 roll
      ],
    })
    const profile7: BuildProfile = {
      name: 'test',
      weights: {
        'CRIT Rate': 1, 'CRIT DMG': 1, 'ATK%': 1, 'HP%': 1,
        'DEF%': 1, 'Elemental Mastery': 1, 'Energy Recharge': 1,
      },
    }
    // k = min(7, 4) = 4, sum_top_4 = 4, w_max = 1
    // max_achievable = (4 + 5) / 6 = 1.5
    // This is the optimal distribution (6+1+1+1 = 9 rolls), score = 100%
    const result = calculateArtifactScore(artifact, profile7)
    expect(result.totalScore).toBeCloseTo(100, 0)
  })
})

describe('calculateArtifactScore - edge cases', () => {
  it('returns 0 when no substats have weight', () => {
    const artifact = makeArtifact({
      level: 20,
      substats: [
        { type: 'HP', value: 500 },
        { type: 'DEF', value: 50 },
      ],
    })
    const profile: BuildProfile = { name: 'test', weights: { 'CRIT Rate': 1 } }
    const result = calculateArtifactScore(artifact, profile)
    expect(result.totalScore).toBe(0)
  })

  it('is not potential for max level artifact', () => {
    const artifact = makeArtifact({
      level: 20,
      substats: [{ type: 'CRIT Rate', value: 23.34 }],
    })
    expect(calculateArtifactScore(artifact).isPotential).toBe(false)
  })
})
