/**
 * Artifact scoring utilities
 */

import type {
  Artifact,
  ArtifactScore,
  BuildProfile,
  Substat,
  SubstatType,
} from '@/types/artifact'
import { MAX_SUBSTAT_VALUE, MAX_SUBSTAT_ROLL, DEFAULT_BUILD_PROFILE } from '@/types/artifact'

// Re-export DEFAULT_BUILD_PROFILE for convenience
export { DEFAULT_BUILD_PROFILE }

/**
 * Total possible substats in an artifact
 */
const TOTAL_SUBSTATS = 4

/**
 * Maximum number of rolls a 5* artifact can get
 * Starting roll + 5 bonus rolls at levels 4, 8, 12, 16, 20
 */
const MAX_ROLLS_5_STAR = 6

/**
 * Number of bonus rolls available (levels 4, 8, 12, 16, 20)
 */
const BONUS_ROLLS = 5


/**
 * Calculate the score for a single substat
 *
 * @param substat - The substat to score
 * @returns Score as percentage (0-100)
 */
export function calculateSubstatScore(substat: Substat): number {
  const maxValue = MAX_SUBSTAT_VALUE[substat.type]
  if (!maxValue) return 0

  // Calculate percentage of current value vs theoretical maximum
  const score = (substat.value / maxValue) * 100

  return Math.min(100, Math.max(0, score))
}

/**
 * Get the number of remaining rolls for an artifact
 *
 * @param artifact - The artifact to check
 * @returns Number of remaining rolls
 */
export function getRemainingRolls(artifact: Artifact): number {
  const maxLevel = artifact.rarity === 5 ? 20 : artifact.rarity === 4 ? 16 : artifact.rarity === 3 ? 12 : 4

  // Calculate how many rolls have been used
  // Level 0: All substats get initial roll
  // Level 4, 8, 12, 16, (20 for 5*): One substat gets a bonus roll
  const completedBonusRolls = Math.floor(artifact.level / 4)

  // If artifact started with 3 substats (3-liner), first roll activates 4th substat
  const is3Liner = artifact.level === 0 && artifact.substats.length === 3
  const usedRolls = is3Liner ? completedBonusRolls : completedBonusRolls + 1

  const remainingBonusRolls = Math.floor(maxLevel / 4) - completedBonusRolls

  return remainingBonusRolls
}

/**
 * Calculate the potential score for an artifact (assuming max rolls on remaining levels)
 *
 * @param artifact - The artifact to score
 * @param profile - Build profile with stat weights
 * @returns Artifact score with detailed breakdown
 */
export function calculateArtifactScore(
  artifact: Artifact,
  profile: BuildProfile = DEFAULT_BUILD_PROFILE,
): ArtifactScore {
  const remainingRolls = getRemainingRolls(artifact)
  const isPotential = remainingRolls > 0

  // Calculate scores for existing substats
  const substatScores = artifact.substats.map((substat) => {
    let value = substat.value
    let score = calculateSubstatScore(substat)

    // For potential scoring, add remaining rolls to highest weighted stat
    if (isPotential && profile.weights[substat.type]) {
      // We'll handle this in the next step
    }

    const weight = profile.weights[substat.type] ?? 0

    return {
      type: substat.type,
      value,
      score,
      weight,
      rollCount: substat.rollCount ?? 1,
    }
  })

  // If artifact is not max level, calculate potential by adding remaining rolls
  // to the highest weighted substat present on the artifact
  if (isPotential && remainingRolls > 0) {
    // Find substat with highest weight
    const highestWeightedSubstat = substatScores.reduce((prev, current) => {
      return current.weight > prev.weight ? current : prev
    })

    if (highestWeightedSubstat.weight > 0) {
      // Add maximum possible value for remaining rolls
      const maxRollValue = MAX_SUBSTAT_ROLL[highestWeightedSubstat.type]
      const additionalValue = maxRollValue * remainingRolls

      // Update the score for this substat with potential value
      const potentialValue = highestWeightedSubstat.value + additionalValue
      highestWeightedSubstat.value = potentialValue
      highestWeightedSubstat.score =
        (potentialValue / MAX_SUBSTAT_VALUE[highestWeightedSubstat.type]) * 100
    }
  }

  // Calculate total score using the new formula:
  // artifact_score = sum(weighted_score_i) / max_achievable
  // where weighted_score_i = (value_i / (max_roll_i * 6)) * weight_i  (already computed as score*weight/100)
  // and max_achievable = (sum_top_k_weights + 5 * w_max) / 6
  // based on top k = min(valued stats in profile, 4) weights
  const weightedScoreSum = substatScores.reduce(
    (sum, substat) => sum + substat.score * substat.weight,
    0,
  )

  // Compute max_achievable from the top min(N_profile_valued, 4) weights in the profile
  const sortedProfileWeights = Object.values(profile.weights)
    .filter((w): w is number => w !== undefined && w > 0)
    .sort((a, b) => b - a)
    .slice(0, TOTAL_SUBSTATS)

  // Avoid division by zero
  if (sortedProfileWeights.length === 0) {
    return {
      totalScore: 0,
      substatScores,
      remainingRolls,
      isPotential,
      profile,
    }
  }

  const sumTopK = sortedProfileWeights.reduce((sum, w) => sum + w, 0)
  const wMax = sortedProfileWeights[0] ?? 0
  const maxAchievable = (sumTopK + BONUS_ROLLS * wMax) / MAX_ROLLS_5_STAR

  // weightedScoreSum is in 0-100 range (scores are percentages), maxAchievable is in 0-1.5 range,
  // so dividing gives a result already in 0-100 percentage range
  const totalScore = weightedScoreSum / maxAchievable

  return {
    totalScore: Math.min(100, Math.max(0, totalScore)),
    substatScores,
    remainingRolls,
    isPotential,
    profile,
  }
}

/**
 * Find the closest valid roll value for a substat
 * Used for OCR error correction
 *
 * @param type - Substat type
 * @param value - The value to correct
 * @returns Nearest valid roll value or original value if no match
 */
export function findNearestValidRoll(type: SubstatType, value: number): number {
  const maxRolls = MAX_ROLLS_5_STAR

  // Generate all possible valid values (combinations of roll values)
  const validValues: number[] = []

  // For efficiency, we'll just check against multiples of each roll value
  // This covers most cases
  const rollValues = [2.72, 3.11, 3.5, 3.89] // Generic, should use SUBSTAT_ROLLS[type]

  for (let rolls = 1; rolls <= maxRolls; rolls++) {
    for (const rollValue of rollValues) {
      validValues.push(rollValue * rolls)
      // Also consider mixed rolls
      for (const otherRoll of rollValues) {
        if (rolls >= 2) {
          validValues.push(rollValue + otherRoll * (rolls - 1))
        }
      }
    }
  }

  // Find nearest value
  let nearest = value
  let minDiff = Infinity

  for (const validValue of validValues) {
    const diff = Math.abs(value - validValue)
    if (diff < minDiff) {
      minDiff = diff
      nearest = validValue
    }
  }

  // Only correct if difference is less than 10% of original value
  const threshold = value * 0.1
  if (minDiff <= threshold) {
    return parseFloat(nearest.toFixed(2))
  }

  return value
}

/**
 * Get a grade letter for an artifact score
 *
 * @param score - Score percentage (0-100)
 * @returns Grade letter (S, A, B, C, D, F)
 */
export function getScoreGrade(score: number): string {
  if (score >= 90) return 'S'
  if (score >= 80) return 'A'
  if (score >= 70) return 'B'
  if (score >= 60) return 'C'
  if (score >= 50) return 'D'
  return 'F'
}

/**
 * Get a color for a score (for UI display)
 *
 * @param score - Score percentage (0-100)
 * @returns Color hex code
 */
export function getScoreColor(score: number): string {
  if (score >= 90) return '#FFD700' // Gold
  if (score >= 80) return '#9B59B6' // Purple
  if (score >= 70) return '#3498DB' // Blue
  if (score >= 60) return '#2ECC71' // Green
  if (score >= 50) return '#F39C12' // Orange
  return '#E74C3C' // Red
}

/**
 * Compare two artifacts by score
 *
 * @param a - First artifact
 * @param b - Second artifact
 * @param profile - Build profile for scoring
 * @returns Negative if a < b, positive if a > b, 0 if equal
 */
export function compareArtifactsByScore(
  a: Artifact,
  b: Artifact,
  profile: BuildProfile = DEFAULT_BUILD_PROFILE,
): number {
  const scoreA = calculateArtifactScore(a, profile).totalScore
  const scoreB = calculateArtifactScore(b, profile).totalScore
  return scoreB - scoreA // Higher scores first
}

/**
 * Check if an artifact is worth keeping based on score threshold
 *
 * @param artifact - Artifact to check
 * @param threshold - Minimum score threshold (default 50)
 * @param profile - Build profile for scoring
 * @returns True if artifact score meets or exceeds threshold
 */
export function isArtifactWorthKeeping(
  artifact: Artifact,
  threshold: number = 50,
  profile: BuildProfile = DEFAULT_BUILD_PROFILE,
): boolean {
  const score = calculateArtifactScore(artifact, profile)
  return score.totalScore >= threshold
}

/**
 * Get recommendations for an artifact
 *
 * @param artifact - Artifact to analyze
 * @param profile - Build profile for scoring
 * @returns Array of recommendation strings
 */
export function getArtifactRecommendations(
  artifact: Artifact,
  profile: BuildProfile = DEFAULT_BUILD_PROFILE,
): string[] {
  const recommendations: string[] = []
  const score = calculateArtifactScore(artifact, profile)

  if (score.isPotential) {
    recommendations.push(
      `This artifact has ${score.remainingRolls} roll(s) remaining. Level it up to see its full potential!`,
    )
  }

  if (score.totalScore < 50) {
    recommendations.push('Consider using this artifact as enhancement material.')
  } else if (score.totalScore >= 80) {
    recommendations.push('This is an excellent artifact! Definitely keep and level it.')
  } else if (score.totalScore >= 70) {
    recommendations.push('This is a good artifact worth keeping.')
  }

  // Check for dead stats (0 weight)
  const deadStats = score.substatScores.filter((s) => s.weight === 0)
  if (deadStats.length > 0) {
    recommendations.push(
      `This artifact has ${deadStats.length} substat(s) that don't match your build profile.`,
    )
  }

  return recommendations
}
