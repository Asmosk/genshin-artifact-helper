/**
 * OCR store - manages OCR processing state and results
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { getOCRWorker, terminateGlobalWorker, type OCRProgressCallback } from '@/utils/ocr'
import { parseArtifactFromRegions } from '@/utils/parsing'
import type { OCRResult } from '@/types/artifact'
import type {
  ArtifactScreenType,
  DetectedScreenType,
  ArtifactRegionLayout,
  Rectangle,
  RegionOCRResult,
  PreprocessingOptions,
} from '@/types/ocr-regions'
import { recognizeRegions, validateArtifactIdentity } from '@/utils/ocr-regions'
import { getRegionTemplate, calculateAllRegionPositions } from '@/utils/ocr-region-templates'
import { detectStarsInBounds } from '@/utils/star-detection'
import { detectScreenType } from '@/utils/screen-type-detection'
import { useSettingsStore } from './settings'
import { useArtifactStore } from './artifact'

/**
 * OCR processing state
 */
export type OCRState = 'idle' | 'initializing' | 'processing' | 'complete' | 'error'

export const useOCRStore = defineStore('ocr', () => {
  // State
  const state = ref<OCRState>('idle')
  const progress = ref(0) // 0-100
  const progressStatus = ref('')
  const result = ref<OCRResult | null>(null)
  const activeLayout = ref<ArtifactRegionLayout | null>(null)
  const error = ref<string | null>(null)
  const processingTime = ref(0) // milliseconds
  const detectedRarityBounds = ref<Rectangle | null>(null)
  const detectedRegionPositions = ref<Map<string, Rectangle> | null>(null)
  const detectedAnchorPx = ref<{ x: number; y: number } | null>(null)
  const regionResults = ref<RegionOCRResult[]>([])
  const detectedScreenType = ref<DetectedScreenType | null>(null)
  const detectedStarCount = ref<number | null>(null)

  /**
   * Tracks the last successfully identified screen type.
   * Passed as a `prioritize` hint to detectScreenType() so the cascade
   * short-circuits on the most-likely type first.
   */
  const lastSuccessfulScreenType = ref<ArtifactScreenType | null>(null)

  // Getters
  const isProcessing = computed(() => state.value === 'processing' || state.value === 'initializing')
  const isComplete = computed(() => state.value === 'complete')
  const hasError = computed(() => state.value === 'error')
  const hasResult = computed(() => result.value !== null)

  // Actions
  /**
   * Initialize the OCR worker
   */
  async function initialize(): Promise<void> {
    if (state.value === 'initializing') {
      return // Already initializing
    }

    try {
      state.value = 'initializing'
      error.value = null
      progress.value = 0
      progressStatus.value = 'Initializing OCR engine...'

      const worker = getOCRWorker()

      const onProgress: OCRProgressCallback = (p) => {
        progress.value = Math.round(p.progress * 100)
        progressStatus.value = p.status
      }

      await worker.initialize(onProgress)

      state.value = 'idle'
      progress.value = 100
      progressStatus.value = 'Ready'
    } catch (err) {
      state.value = 'error'
      error.value = err instanceof Error ? err.message : 'Failed to initialize OCR'
      throw err
    }
  }

  /**
   * Clear current result and reset state
   */
  function clearResult(): void {
    result.value = null
    activeLayout.value = null
    error.value = null
    progress.value = 0
    progressStatus.value = ''
    processingTime.value = 0
    state.value = 'idle'
    detectedRarityBounds.value = null
    detectedRegionPositions.value = null
    detectedAnchorPx.value = null
    regionResults.value = []
    detectedScreenType.value = null
    detectedStarCount.value = null
  }

  /**
   * Terminate OCR worker and free resources
   */
  async function terminate(): Promise<void> {
    await terminateGlobalWorker()
    state.value = 'idle'
    progress.value = 0
    progressStatus.value = ''
  }

  /**
   * Process image using the 4-stage pipeline:
   *   Stage 1: screen type detection (independent of star position)
   *   Stage 2: constrained star detection (within screen-type-specific bounds)
   *   Stage 3a: OCR validation (slotName + mainStatName only — fast artifact identity check)
   *   Stage 3b: Full OCR (remaining regions)
   */
  async function processImage(
    canvas: HTMLCanvasElement,
    debugPreprocessingOverrides?: Partial<PreprocessingOptions>,
  ): Promise<OCRResult> {
    const startTime = Date.now()

    try {
      state.value = 'processing'
      error.value = null
      result.value = null
      activeLayout.value = null
      progress.value = 0
      progressStatus.value = 'Initializing region-based OCR...'

      const settingsStore = useSettingsStore()

      // ── Stage 1: Screen type detection ─────────────────────────────────────
      let resolvedScreenType: ArtifactScreenType
      const configuredType = settingsStore.ocrSettings.regions.screenType

      if (configuredType === 'auto') {
        progressStatus.value = 'Detecting screen type...'
        const detected = detectScreenType(canvas, {
          prioritize: lastSuccessfulScreenType.value ?? undefined,
        })
        if (detected === 'other') {
          state.value = 'error'
          error.value = 'No artifact detected on screen'
          processingTime.value = Date.now() - startTime
          return { artifact: {}, confidence: 0, rawText: '', errors: ['No artifact detected on screen'] } as OCRResult
        }
        resolvedScreenType = detected
      } else {
        resolvedScreenType = configuredType as ArtifactScreenType
      }

      detectedScreenType.value = resolvedScreenType
      progress.value = 10

      // ── Stage 2: Constrained star detection ────────────────────────────────
      const layout = getRegionTemplate(resolvedScreenType)
      activeLayout.value = layout
      progressStatus.value = `Using ${resolvedScreenType} screen layout...`

      const starResult = detectStarsInBounds(canvas, layout.starSearchBounds, canvas.height)
      if (!starResult) {
        state.value = 'error'
        error.value = 'No artifact detected on screen'
        processingTime.value = Date.now() - startTime
        return { artifact: {}, confidence: 0, rawText: '', errors: ['No artifact detected on screen'] } as OCRResult
      }

      const anchorPx = { x: starResult.stars.position.x, y: starResult.stars.position.y }
      progress.value = 20

      // Initialize OCR worker if needed
      const worker = getOCRWorker()
      if (!worker.initialized) {
        progressStatus.value = 'Initializing OCR engine...'
        await worker.initialize((p) => {
          progress.value = 20 + Math.round(p.progress * 20) // 20-40%
          progressStatus.value = p.status
        })
      }

      // ── Stage 3a: OCR validation ────────────────────────────────────────────
      progress.value = 40
      progressStatus.value = 'Validating artifact identity...'

      const validation = await validateArtifactIdentity(canvas, layout, anchorPx, {
        debug: false,
        debugPreprocessingOverrides,
      })

      if (!validation.isArtifact) {
        state.value = 'error'
        error.value = 'No artifact detected on screen'
        processingTime.value = Date.now() - startTime
        return { artifact: {}, confidence: 0, rawText: '', errors: ['No artifact detected on screen'] } as OCRResult
      }

      // ── Stage 3b: Full OCR (skip already-processed regions) ────────────────
      progress.value = 50
      progressStatus.value = 'Processing regions...'

      const regionResult = await recognizeRegions(canvas, layout, {
        parallelProcessing: settingsStore.ocrSettings.regions.parallelProcessing,
        skipOptional: false,
        debug: false,
        debugPreprocessingOverrides,
        anchorOverride: anchorPx,
        skipRegions: new Set(['slotName', 'mainStatName']),
        precomputedResults: [validation.slotResult, validation.mainStatNameResult],
      })

      // ── Update state ────────────────────────────────────────────────────────
      lastSuccessfulScreenType.value = resolvedScreenType
      detectedAnchorPx.value = anchorPx
      detectedRarityBounds.value = starResult.regionBounds
      detectedRegionPositions.value = calculateAllRegionPositions(
        layout,
        canvas.width,
        canvas.height,
        anchorPx,
      )
      regionResults.value = regionResult.regions

      progress.value = 85
      progressStatus.value = 'Parsing artifact data...'

      // Parse artifact from region results, passing star count for rarity
      const parseResult = parseArtifactFromRegions(regionResult.regions, starResult.stars.count)

      // Add region-specific metadata
      parseResult.regionBased = true
      parseResult.screenType = resolvedScreenType
      parseResult.regionCount = regionResult.regions.length

      // Store result
      result.value = parseResult
      processingTime.value = Date.now() - startTime

      state.value = 'complete'
      progress.value = 100
      progressStatus.value = 'Complete'

      console.log(`Region-based OCR completed in ${processingTime.value}ms`)
      console.log(`Processed ${regionResult.regions.length} regions`)
      console.log(`Overall confidence: ${(parseResult.confidence * 100).toFixed(1)}%`)

      return parseResult
    } catch (err) {
      state.value = 'error'
      error.value = err instanceof Error ? err.message : 'Region-based OCR processing failed'
      processingTime.value = Date.now() - startTime
      console.error('Region-based OCR error:', err)
      throw err
    }
  }

  /**
   * Accept the OCR result and save to artifact store
   */
  function acceptResult(): void {
    if (!result.value || !result.value.artifact) {
      throw new Error('No OCR result to accept')
    }

    const partial = result.value.artifact
    const rarity = partial.rarity ?? 5
    const maxLevel = rarity === 5 ? 20 : rarity === 4 ? 16 : rarity === 3 ? 12 : 4

    const artifact = {
      id: crypto.randomUUID(),
      set: partial.set ?? 'Unknown',
      slot: partial.slot ?? 'Flower',
      rarity,
      level: partial.level ?? 0,
      maxLevel: partial.maxLevel ?? maxLevel,
      mainStat: partial.mainStat ?? { type: 'HP' as const, value: 0 },
      substats: partial.substats ?? [],
      ...(partial.pieceName !== undefined && { pieceName: partial.pieceName }),
    }

    const artifactStore = useArtifactStore()
    artifactStore.setArtifact(artifact)
    clearResult()
  }

  /**
   * Reject the OCR result
   */
  function rejectResult(): void {
    clearResult()
  }

  /**
   * Run the 2-stage detection (screen type → constrained stars) and update the visual overlay.
   * Does NOT run OCR. Synchronous apart from zero async calls.
   */
  function detectArtifactDescription(canvas: HTMLCanvasElement): void {
    const settingsStore = useSettingsStore()
    console.log('[Star Detection] Attempting to detect rarity stars...', {
      width: canvas.width,
      height: canvas.height,
    })

    // Stage 1: screen type detection
    let screenType: ArtifactScreenType
    const configuredType = settingsStore.ocrSettings.regions.screenType

    if (configuredType === 'auto') {
      const detected = detectScreenType(canvas, {
        prioritize: lastSuccessfulScreenType.value ?? undefined,
      })
      if (detected === 'other') {
        console.log('[Star Detection] Screen type: other — no artifact panel detected')
        state.value = 'error'
        error.value = 'No artifact panel detected on screen'
        detectedRarityBounds.value = null
        detectedRegionPositions.value = null
        return
      }
      screenType = detected
    } else {
      screenType = configuredType as ArtifactScreenType
    }

    detectedScreenType.value = screenType
    const layout = getRegionTemplate(screenType)

    // Stage 2: constrained star detection
    const detection = detectStarsInBounds(canvas, layout.starSearchBounds, canvas.height)

    if (detection) {
      console.log('[Star Detection] Stars detected:', {
        count: detection.stars.count,
        position: detection.stars.position,
        confidence: detection.stars.confidence,
      })
      console.log('[Star Detection] Star region bounds (px):', detection.regionBounds)

      const anchorPx = { x: detection.stars.position.x, y: detection.stars.position.y }
      console.log('[Star Detection] Anchor point (px):', anchorPx)
      detectedAnchorPx.value = anchorPx

      const positions = calculateAllRegionPositions(layout, canvas.width, canvas.height, anchorPx)
      positions.set('starAnchor', detection.regionBounds)

      console.log('[Star Detection] Computed region positions:', Object.fromEntries(positions))

      detectedRarityBounds.value = detection.regionBounds
      detectedStarCount.value = detection.stars.count
      detectedRegionPositions.value = positions
      activeLayout.value = layout
      error.value = null
      state.value = 'idle'
    } else {
      console.log('[Star Detection] No stars found in image')
      state.value = 'error'
      error.value = 'Star detection failed: no stars found in image'
      detectedRarityBounds.value = null
      detectedStarCount.value = null
      detectedRegionPositions.value = null
    }
  }

  return {
    // State
    state,
    progress,
    progressStatus,
    result,
    error,
    processingTime,
    detectedRarityBounds,
    detectedRegionPositions,
    detectedAnchorPx,
    regionResults,
    detectedScreenType,
    detectedStarCount,

    // Getters
    isProcessing,
    isComplete,
    hasError,
    hasResult,
    activeLayout,

    // Actions
    initialize,
    processImage,
    clearResult,
    terminate,
    acceptResult,
    rejectResult,
    detectArtifactDescription,
  }
})
