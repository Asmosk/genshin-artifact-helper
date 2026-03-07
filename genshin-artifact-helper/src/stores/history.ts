/**
 * History store - manages scanned artifact history
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Artifact } from '@/types/artifact'
import { calculateArtifactScore } from '@/utils/scoring'
import { useSettingsStore } from './settings'

const STORAGE_KEY = 'genshin-artifact-helper-history'
const MAX_HISTORY_SIZE = 500 // Maximum artifacts to keep in history

export const useHistoryStore = defineStore('history', () => {
  // State
  const artifacts = ref<Artifact[]>([])
  const selectedArtifactId = ref<string | null>(null)

  // Getters
  const artifactCount = computed(() => artifacts.value.length)

  const selectedArtifact = computed(() => {
    if (!selectedArtifactId.value) return null
    return artifacts.value.find((a) => a.id === selectedArtifactId.value) ?? null
  })

  const sortedByScore = computed(() => {
    const settingsStore = useSettingsStore()
    const profile = settingsStore.currentBuildProfile

    return [...artifacts.value].sort((a, b) => {
      const scoreA = calculateArtifactScore(a, profile).totalScore
      const scoreB = calculateArtifactScore(b, profile).totalScore
      return scoreB - scoreA
    })
  })

  const sortedByDate = computed(() => {
    return [...artifacts.value].sort((a, b) => {
      const dateA = a.scannedAt?.getTime() ?? 0
      const dateB = b.scannedAt?.getTime() ?? 0
      return dateB - dateA
    })
  })

  const highQualityArtifacts = computed(() => {
    const settingsStore = useSettingsStore()
    const threshold = settingsStore.uiSettings.keepThreshold
    const profile = settingsStore.currentBuildProfile

    return artifacts.value.filter((artifact) => {
      const score = calculateArtifactScore(artifact, profile).totalScore
      return score >= threshold
    })
  })

  // Actions
  function addArtifact(artifact: Artifact) {
    // Check if artifact already exists (by id)
    const existingIndex = artifacts.value.findIndex((a) => a.id === artifact.id)

    if (existingIndex !== -1) {
      // Update existing artifact
      artifacts.value[existingIndex] = artifact
    } else {
      // Add new artifact
      artifact.scannedAt = new Date()
      artifacts.value.push(artifact)

      // Enforce max size
      if (artifacts.value.length > MAX_HISTORY_SIZE) {
        // Remove oldest artifacts
        artifacts.value = sortedByDate.value.slice(0, MAX_HISTORY_SIZE)
      }
    }

    save()
  }

  function removeArtifact(id: string) {
    const index = artifacts.value.findIndex((a) => a.id === id)
    if (index !== -1) {
      artifacts.value.splice(index, 1)
      save()

      // Clear selection if removed artifact was selected
      if (selectedArtifactId.value === id) {
        selectedArtifactId.value = null
      }
    }
  }

  function clearHistory() {
    artifacts.value = []
    selectedArtifactId.value = null
    save()
  }

  function selectArtifact(id: string) {
    selectedArtifactId.value = id
  }

  function clearSelection() {
    selectedArtifactId.value = null
  }

  function updateArtifact(id: string, updates: Partial<Artifact>) {
    const artifact = artifacts.value.find((a) => a.id === id)
    if (artifact) {
      Object.assign(artifact, updates)
      save()
    }
  }

  function getArtifactById(id: string): Artifact | null {
    return artifacts.value.find((a) => a.id === id) ?? null
  }

  function filterBySet(setName: string): Artifact[] {
    return artifacts.value.filter((a) => a.set === setName)
  }

  function filterBySlot(slot: Artifact['slot']): Artifact[] {
    return artifacts.value.filter((a) => a.slot === slot)
  }

  function filterByRarity(rarity: Artifact['rarity']): Artifact[] {
    return artifacts.value.filter((a) => a.rarity === rarity)
  }

  function getUniqueSetNames(): string[] {
    const sets = new Set(artifacts.value.map((a) => a.set))
    return Array.from(sets).sort()
  }

  // Persistence
  function save() {
    try {
      // Serialize artifacts to JSON
      const data = artifacts.value.map((artifact) => ({
        ...artifact,
        scannedAt: artifact.scannedAt?.toISOString(),
      }))
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    } catch (error) {
      console.error('Failed to save artifact history:', error)
    }
  }

  function load() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const data = JSON.parse(saved)
        artifacts.value = data.map((artifact: any) => ({
          ...artifact,
          scannedAt: artifact.scannedAt ? new Date(artifact.scannedAt) : undefined,
        }))
      }
    } catch (error) {
      console.error('Failed to load artifact history:', error)
    }
  }

  function exportToJSON(): string {
    return JSON.stringify(artifacts.value, null, 2)
  }

  function importFromJSON(json: string): boolean {
    try {
      const data = JSON.parse(json)
      if (Array.isArray(data)) {
        artifacts.value = data.map((artifact: any) => ({
          ...artifact,
          scannedAt: artifact.scannedAt ? new Date(artifact.scannedAt) : undefined,
        }))
        save()
        return true
      }
      return false
    } catch (error) {
      console.error('Failed to import artifact history:', error)
      return false
    }
  }

  // Initialize
  load()

  return {
    // State
    artifacts,
    selectedArtifactId,

    // Getters
    artifactCount,
    selectedArtifact,
    sortedByScore,
    sortedByDate,
    highQualityArtifacts,

    // Actions
    addArtifact,
    removeArtifact,
    clearHistory,
    selectArtifact,
    clearSelection,
    updateArtifact,
    getArtifactById,
    filterBySet,
    filterBySlot,
    filterByRarity,
    getUniqueSetNames,

    // Persistence
    save,
    load,
    exportToJSON,
    importFromJSON,
  }
})
