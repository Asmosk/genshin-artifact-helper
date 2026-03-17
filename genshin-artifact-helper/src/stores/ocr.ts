/**
 * OCR store - manages OCR processing state and results
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { getOCRWorker, terminateGlobalWorker, type OCRProgressCallback } from '@/utils/ocr'
import { parseArtifactFromRegions } from '@/utils/parsing'
import type { OCRResult } from '@/types/artifact'
import type { ScreenType, ArtifactRegionLayout, Rectangle, RegionOCRResult, PreprocessingOptions } from '@/types/ocr-regions'
import { recognizeRegions } from '@/utils/ocr-regions'
import { getRegionTemplate, calculateAllRegionPositions } from '@/utils/ocr-region-templates'
import { detectStarsInFullScreen } from '@/utils/star-detection'
import { detectScreenType } from '@/utils/screen-type-detection'
import { useSettingsStore } from './settings'

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
   * Process image using region-based OCR
   * More accurate and faster than full-image OCR
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

      // Determine screen type (auto-detect or use provided)
      let detectedScreenType: ScreenType
      const configuredType = settingsStore.ocrSettings.regions.screenType

      if (configuredType === 'auto') {
        progressStatus.value = 'Detecting screen type...'
        const starResult = detectStarsInFullScreen(canvas, canvas.height)
        if (!starResult) {
          state.value = 'error'
          error.value = 'No artifact detected on screen'
          processingTime.value = Date.now() - startTime
          return { artifact: {}, confidence: 0, rawText: '', errors: ['No artifact detected on screen'] } as OCRResult
        }
        detectedScreenType = detectScreenType(
          canvas,
          starResult.stars.position,
          canvas.width,
          canvas.height,
        )
        progress.value = 10
      } else {
        detectedScreenType = configuredType as ScreenType
      }

      // Get layout template for screen type
      const layout = getRegionTemplate(detectedScreenType)
      activeLayout.value = layout
      progress.value = 20
      progressStatus.value = `Using ${detectedScreenType} screen layout...`

      // Initialize OCR worker if needed
      const worker = getOCRWorker()
      if (!worker.initialized) {
        progressStatus.value = 'Initializing OCR engine...'
        await worker.initialize((p) => {
          progress.value = 20 + Math.round(p.progress * 30) // 20-50%
          progressStatus.value = p.status
        })
      }

      progress.value = 50
      progressStatus.value = 'Processing regions...'

      const regionResult = await recognizeRegions(
        canvas,
        layout,
        {
          parallelProcessing: settingsStore.ocrSettings.regions.parallelProcessing,
          skipOptional: false,
          debug: false,
          debugPreprocessingOverrides,
        },
      )

      if (regionResult.starDetection) {
        detectedAnchorPx.value = { x: regionResult.starDetection.position.x, y: regionResult.starDetection.position.y }
        // Update overlay positions to match the layout actually used
        detectedRegionPositions.value = calculateAllRegionPositions(
          layout,
          canvas.width,
          canvas.height,
          detectedAnchorPx.value,
        )
      }
      regionResults.value = regionResult.regions

      progress.value = 85
      progressStatus.value = 'Parsing artifact data...'

      // Parse artifact from region results, passing star count for rarity
      const parseResult = parseArtifactFromRegions(regionResult.regions, regionResult.starDetection?.count)

      // Add region-specific metadata
      parseResult.regionBased = true
      parseResult.screenType = detectedScreenType
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

    // TODO: Save to artifact store
    // This will be implemented when we have the artifact store integration
    console.log('Accepting OCR result:', result.value.artifact)

    clearResult()
  }

  /**
   * Reject the OCR result
   */
  function rejectResult(): void {
    clearResult()
  }

  /**
   * Run star detection on the provided canvas and update detectedRarityBounds
   * and detectedRegionPositions for all OCR regions.
   * Logs detection attempt and result to console.
   */
  function detectArtifactDescription(canvas: HTMLCanvasElement): void {
    const settingsStore = useSettingsStore()
    console.log('[Star Detection] Attempting to detect rarity stars...', {
      width: canvas.width,
      height: canvas.height,
    })

    const detection = detectStarsInFullScreen(canvas, canvas.height)

    if (detection) {
      console.log('[Star Detection] Stars detected:', {
        count: detection.stars.count,
        position: detection.stars.position,
        confidence: detection.stars.confidence,
      })
      console.log('[Star Detection] Star region bounds (px):', detection.regionBounds)

      const screenType: ScreenType = settingsStore.ocrSettings.regions.screenType === 'auto'
        ? detectScreenType(canvas, detection.stars.position, canvas.width, canvas.height)
        : settingsStore.ocrSettings.regions.screenType as ScreenType
      const layout = getRegionTemplate(screenType)

      // Use detected first-star center as the canonical anchor point
      const anchorPx = { x: detection.stars.position.x, y: detection.stars.position.y }
      console.log('[Star Detection] Anchor point (px):', anchorPx)
      detectedAnchorPx.value = anchorPx

      const positions = calculateAllRegionPositions(layout, canvas.width, canvas.height, anchorPx)
      positions.set('starAnchor', detection.regionBounds)

      console.log('[Star Detection] Computed region positions:', Object.fromEntries(positions))

      detectedRarityBounds.value = detection.regionBounds
      detectedRegionPositions.value = positions
      activeLayout.value = layout
      error.value = null
    } else {
      console.log('[Star Detection] No stars found in image')
      state.value = 'error'
      error.value = 'Star detection failed: no stars found in image'
      detectedRarityBounds.value = null
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
