/**
 * Settings store - manages app settings, build profiles, and capture configuration
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { BuildProfile } from '@/types/artifact'
import { DEFAULT_BUILD_PROFILE, COMMON_BUILD_PROFILES } from '@/types/artifact'

export interface CaptureRegion {
  x: number
  y: number
  width: number
  height: number
}

export interface CaptureSettings {
  /** Region to capture (relative to screen) */
  region: CaptureRegion | null
  /** Auto-detect artifacts when they change */
  autoDetect: boolean
  /** Capture rate in FPS */
  captureRate: number
  /** Enable image preprocessing */
  enablePreprocessing: boolean
}

export interface OCRSettings {
  /** OCR confidence threshold (0-1) */
  confidenceThreshold: number
  /** Auto-correct OCR errors using valid roll values */
  autoCorrect: boolean
  /** Language for OCR */
  language: string
}

export interface UISettings {
  /** Theme (light/dark/auto) */
  theme: 'light' | 'dark' | 'auto'
  /** Show detailed scoring breakdown */
  showDetailedScores: boolean
  /** Score threshold for "keep" recommendation */
  keepThreshold: number
}

const STORAGE_KEY_SETTINGS = 'genshin-artifact-helper-settings'
const STORAGE_KEY_PROFILES = 'genshin-artifact-helper-profiles'

export const useSettingsStore = defineStore('settings', () => {
  // State - Capture Settings
  const captureSettings = ref<CaptureSettings>({
    region: null,
    autoDetect: true,
    captureRate: 2, // 2 FPS
    enablePreprocessing: true,
  })

  // State - OCR Settings
  const ocrSettings = ref<OCRSettings>({
    confidenceThreshold: 0.7,
    autoCorrect: true,
    language: 'eng',
  })

  // State - UI Settings
  const uiSettings = ref<UISettings>({
    theme: 'auto',
    showDetailedScores: true,
    keepThreshold: 60,
  })

  // State - Build Profiles
  const buildProfiles = ref<BuildProfile[]>([...COMMON_BUILD_PROFILES])
  const currentProfileIndex = ref(0)

  // Getters
  const currentBuildProfile = computed(() => {
    return buildProfiles.value[currentProfileIndex.value] ?? DEFAULT_BUILD_PROFILE
  })

  const hasCustomProfiles = computed(() => {
    return buildProfiles.value.length > COMMON_BUILD_PROFILES.length
  })

  const captureRegionSet = computed(() => {
    return captureSettings.value.region !== null
  })

  // Actions - Capture Settings
  function setCaptureRegion(region: CaptureRegion) {
    captureSettings.value.region = region
    saveSettings()
  }

  function clearCaptureRegion() {
    captureSettings.value.region = null
    saveSettings()
  }

  function setCaptureRate(rate: number) {
    captureSettings.value.captureRate = Math.max(1, Math.min(10, rate))
    saveSettings()
  }

  function toggleAutoDetect() {
    captureSettings.value.autoDetect = !captureSettings.value.autoDetect
    saveSettings()
  }

  function togglePreprocessing() {
    captureSettings.value.enablePreprocessing = !captureSettings.value.enablePreprocessing
    saveSettings()
  }

  // Actions - OCR Settings
  function setOCRConfidenceThreshold(threshold: number) {
    ocrSettings.value.confidenceThreshold = Math.max(0, Math.min(1, threshold))
    saveSettings()
  }

  function toggleAutoCorrect() {
    ocrSettings.value.autoCorrect = !ocrSettings.value.autoCorrect
    saveSettings()
  }

  // Actions - UI Settings
  function setTheme(theme: UISettings['theme']) {
    uiSettings.value.theme = theme
    applyTheme(theme)
    saveSettings()
  }

  function toggleDetailedScores() {
    uiSettings.value.showDetailedScores = !uiSettings.value.showDetailedScores
    saveSettings()
  }

  function setKeepThreshold(threshold: number) {
    uiSettings.value.keepThreshold = Math.max(0, Math.min(100, threshold))
    saveSettings()
  }

  // Actions - Build Profiles
  function selectProfile(index: number) {
    if (index >= 0 && index < buildProfiles.value.length) {
      currentProfileIndex.value = index
      saveSettings()
    }
  }

  function selectProfileByName(name: string) {
    const index = buildProfiles.value.findIndex((p) => p.name === name)
    if (index !== -1) {
      selectProfile(index)
    }
  }

  function addBuildProfile(profile: BuildProfile) {
    buildProfiles.value.push(profile)
    saveProfiles()
  }

  function updateBuildProfile(index: number, profile: BuildProfile) {
    if (index >= 0 && index < buildProfiles.value.length) {
      buildProfiles.value[index] = profile
      saveProfiles()
    }
  }

  function deleteBuildProfile(index: number) {
    // Don't allow deleting if it's the last profile
    if (buildProfiles.value.length <= 1) return

    buildProfiles.value.splice(index, 1)

    // Adjust current profile index if needed
    if (currentProfileIndex.value >= buildProfiles.value.length) {
      currentProfileIndex.value = buildProfiles.value.length - 1
    }

    saveProfiles()
  }

  function resetToDefaultProfiles() {
    buildProfiles.value = [...COMMON_BUILD_PROFILES]
    currentProfileIndex.value = 0
    saveProfiles()
  }

  // Persistence
  function saveSettings() {
    const settings = {
      capture: captureSettings.value,
      ocr: ocrSettings.value,
      ui: uiSettings.value,
      currentProfileIndex: currentProfileIndex.value,
    }

    try {
      localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(settings))
    } catch (error) {
      console.error('Failed to save settings:', error)
    }
  }

  function saveProfiles() {
    try {
      localStorage.setItem(STORAGE_KEY_PROFILES, JSON.stringify(buildProfiles.value))
    } catch (error) {
      console.error('Failed to save profiles:', error)
    }
  }

  function loadSettings() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_SETTINGS)
      if (saved) {
        const settings = JSON.parse(saved)
        captureSettings.value = settings.capture ?? captureSettings.value
        ocrSettings.value = settings.ocr ?? ocrSettings.value
        uiSettings.value = settings.ui ?? uiSettings.value
        currentProfileIndex.value = settings.currentProfileIndex ?? 0

        // Apply theme
        applyTheme(uiSettings.value.theme)
      }
    } catch (error) {
      console.error('Failed to load settings:', error)
    }
  }

  function loadProfiles() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_PROFILES)
      if (saved) {
        const profiles = JSON.parse(saved)
        if (Array.isArray(profiles) && profiles.length > 0) {
          buildProfiles.value = profiles
        }
      }
    } catch (error) {
      console.error('Failed to load profiles:', error)
    }
  }

  function applyTheme(theme: UISettings['theme']) {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark')
    } else if (theme === 'light') {
      document.documentElement.classList.remove('dark')
    } else {
      // Auto: use system preference
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
      if (prefersDark) {
        document.documentElement.classList.add('dark')
      } else {
        document.documentElement.classList.remove('dark')
      }
    }
  }

  // Initialize
  loadSettings()
  loadProfiles()

  return {
    // State
    captureSettings,
    ocrSettings,
    uiSettings,
    buildProfiles,
    currentProfileIndex,

    // Getters
    currentBuildProfile,
    hasCustomProfiles,
    captureRegionSet,

    // Actions - Capture
    setCaptureRegion,
    clearCaptureRegion,
    setCaptureRate,
    toggleAutoDetect,
    togglePreprocessing,

    // Actions - OCR
    setOCRConfidenceThreshold,
    toggleAutoCorrect,

    // Actions - UI
    setTheme,
    toggleDetailedScores,
    setKeepThreshold,

    // Actions - Profiles
    selectProfile,
    selectProfileByName,
    addBuildProfile,
    updateBuildProfile,
    deleteBuildProfile,
    resetToDefaultProfiles,

    // Persistence
    saveSettings,
    loadSettings,
  }
})
