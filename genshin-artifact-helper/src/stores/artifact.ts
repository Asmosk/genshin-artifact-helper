/**
 * Artifact store - manages current artifact being scanned/displayed
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Artifact, ArtifactScore, BuildProfile } from '@/types/artifact'
import { calculateArtifactScore, DEFAULT_BUILD_PROFILE } from '@/utils/scoring'
import { useSettingsStore } from './settings'

export const useArtifactStore = defineStore('artifact', () => {
  // State
  const currentArtifact = ref<Artifact | null>(null)
  const isScanning = ref(false)
  const lastScanTime = ref<Date | null>(null)

  // Getters
  const hasArtifact = computed(() => currentArtifact.value !== null)

  const artifactScore = computed<ArtifactScore | null>(() => {
    if (!currentArtifact.value) return null

    const settingsStore = useSettingsStore()
    const profile = settingsStore.currentBuildProfile

    return calculateArtifactScore(currentArtifact.value, profile)
  })

  const scorePercentage = computed(() => {
    return artifactScore.value?.totalScore.toFixed(1) ?? '0.0'
  })

  const scoreGrade = computed(() => {
    if (!artifactScore.value) return 'F'

    const score = artifactScore.value.totalScore
    if (score >= 90) return 'S'
    if (score >= 80) return 'A'
    if (score >= 70) return 'B'
    if (score >= 60) return 'C'
    if (score >= 50) return 'D'
    return 'F'
  })

  // Actions
  function setArtifact(artifact: Artifact) {
    currentArtifact.value = artifact
    lastScanTime.value = new Date()
  }

  function clearArtifact() {
    currentArtifact.value = null
  }

  function startScanning() {
    isScanning.value = true
  }

  function stopScanning() {
    isScanning.value = false
  }

  function updateArtifactLevel(level: number) {
    if (currentArtifact.value) {
      currentArtifact.value.level = level
    }
  }

  function updateArtifactSubstats(substats: Artifact['substats']) {
    if (currentArtifact.value) {
      currentArtifact.value.substats = substats
    }
  }

  return {
    // State
    currentArtifact,
    isScanning,
    lastScanTime,

    // Getters
    hasArtifact,
    artifactScore,
    scorePercentage,
    scoreGrade,

    // Actions
    setArtifact,
    clearArtifact,
    startScanning,
    stopScanning,
    updateArtifactLevel,
    updateArtifactSubstats,
  }
})
