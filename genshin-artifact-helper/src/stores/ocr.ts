/**
 * OCR store - manages OCR processing state and results
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { getOCRWorker, terminateGlobalWorker, type OCRProgressCallback } from '@/utils/ocr'
import { parseArtifact, parseArtifactFromRegions } from '@/utils/parsing'
import { preprocessForOCR } from '@/utils/preprocessing'
import type { OCRResult } from '@/types/artifact'
import type { ScreenType, ArtifactRegionLayout, Rectangle } from '@/types/ocr-regions'
import { recognizeRegions } from '@/utils/ocr-regions'
import { getRegionTemplate, calculateAllRegionPositions } from '@/utils/ocr-region-templates'
import { detectStarsInFullScreen } from '@/utils/star-detection'
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
   * Process an image with OCR
   */
  async function processImage(
    canvas: HTMLCanvasElement,
    options?: {
      preprocess?: boolean
      preprocessingOptions?: any
    },
  ): Promise<OCRResult> {
    const startTime = Date.now()

    try {
      state.value = 'processing'
      error.value = null
      result.value = null
      activeLayout.value = null
      progress.value = 0
      progressStatus.value = 'Processing image...'

      // Get worker
      const worker = getOCRWorker()

      // Initialize if needed
      if (!worker.initialized) {
        progressStatus.value = 'Initializing OCR engine...'
        await worker.initialize((p) => {
          progress.value = Math.round(p.progress * 50) // Use first 50% for init
          progressStatus.value = p.status
        })
      }

      // Preprocess if enabled
      let imageToProcess = canvas
      if (options?.preprocess) {
        progressStatus.value = 'Preprocessing image...'
        const settingsStore = useSettingsStore()
        imageToProcess = preprocessForOCR(
          canvas,
          options.preprocessingOptions || settingsStore.captureSettings.preprocessingOptions,
        )
        progress.value = 60
      }

      // Run OCR
      progressStatus.value = 'Recognizing text...'
      const ocrResult = await worker.recognize(imageToProcess, (p) => {
        progress.value = 60 + Math.round(p.progress * 30) // Use 60-90% for OCR
        progressStatus.value = `Recognizing text... ${Math.round(p.progress * 100)}%`
      })

      // Parse artifact data
      progressStatus.value = 'Parsing artifact data...'
      progress.value = 90
      const parseResult = parseArtifact(ocrResult.data.text)

      // Store result
      result.value = parseResult
      processingTime.value = Date.now() - startTime

      state.value = 'complete'
      progress.value = 100
      progressStatus.value = 'Complete'

      return parseResult
    } catch (err) {
      state.value = 'error'
      error.value = err instanceof Error ? err.message : 'OCR processing failed'
      processingTime.value = Date.now() - startTime
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
  async function processImageWithRegions(
    canvas: HTMLCanvasElement,
    screenType?: ScreenType,
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
      const configuredType = screenType ?? settingsStore.ocrSettings.regions.screenType

      if (configuredType === 'auto') {
        // TODO: Implement auto-detection
        // For now, default to inventory
        progressStatus.value = 'Auto-detecting screen type...'
        detectedScreenType = 'inventory'
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

      // Process all regions — skip star detection if already done for this image
      const alreadyDetected = detectedRegionPositions.value !== null
      if (alreadyDetected) {
        console.log('[OCR] Skipping star detection — already completed for this image')
      }
      const regionResult = await recognizeRegions(
        canvas,
        layout,
        settingsStore.captureSettings.preprocessingOptions,
        {
          useStarAnchor: alreadyDetected ? false : settingsStore.ocrSettings.regions.useStarAnchor,
          parallelProcessing: settingsStore.ocrSettings.regions.parallelProcessing,
          skipOptional: false,
          debug: false,
        },
      )

      progress.value = 85
      progressStatus.value = 'Parsing artifact data...'

      // Parse artifact from region results
      const parseResult = parseArtifactFromRegions(regionResult.regions)

      // Add region-specific metadata
      ;(parseResult as any).regionBased = true
      ;(parseResult as any).screenType = detectedScreenType
      ;(parseResult as any).regionCount = regionResult.regions.length

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

      // Fallback to legacy processing
      console.log('Falling back to full-image OCR...')
      return processImage(canvas, { preprocess: true })
    }
  }

  /**
   * Process image with automatic method selection
   * Uses region-based OCR if enabled, otherwise falls back to full-image
   */
  async function processImageAuto(canvas: HTMLCanvasElement): Promise<OCRResult> {
    const settingsStore = useSettingsStore()

    if (settingsStore.ocrSettings.regions.enabled) {
      try {
        return await processImageWithRegions(canvas)
      } catch (err) {
        console.warn('Region-based OCR failed, using full-image fallback:', err)
        return processImage(canvas, { preprocess: true })
      }
    } else {
      return processImage(canvas, { preprocess: true })
    }
  }

  /**
   * Retry processing with the same image
   * Requires the image to be passed again
   */
  async function retry(canvas: HTMLCanvasElement, options?: { preprocess?: boolean }): Promise<OCRResult> {
    clearResult()
    return processImage(canvas, options)
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
      console.log('[Star Detection] Rarity region bounds (px):', detection.regionBounds)

      // Get the layout to compute all other region positions
      const screenType = settingsStore.ocrSettings.regions.screenType === 'auto'
        ? 'inventory'
        : settingsStore.ocrSettings.regions.screenType as any
      const layout = getRegionTemplate(screenType)

      // Compute anchor delta: how far detected stars are from where template expected them
      const anchorTemplate = layout.anchorRegion
      const expectedCenterX = (anchorTemplate.x + anchorTemplate.width / 2) * canvas.width
      const expectedCenterY = (anchorTemplate.y + anchorTemplate.height / 2) * canvas.height
      const anchorOffset = {
        x: detection.stars.position.x - expectedCenterX,
        y: detection.stars.position.y - expectedCenterY,
      }
      console.log('[Star Detection] Anchor offset (delta px):', anchorOffset)

      // Calculate all region positions shifted by the anchor delta
      const positions = calculateAllRegionPositions(layout, canvas.width, canvas.height, anchorOffset)
      // Override rarity with the precisely detected bounds
      positions.set(anchorTemplate.name, detection.regionBounds)

      console.log('[Star Detection] Computed region positions:', Object.fromEntries(positions))

      detectedRarityBounds.value = detection.regionBounds
      detectedRegionPositions.value = positions
      // Make the layout available so the preview can draw region boxes
      activeLayout.value = layout
    } else {
      console.log('[Star Detection] No stars found in image')
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

    // Getters
    isProcessing,
    isComplete,
    hasError,
    hasResult,
    activeLayout,

    // Actions
    initialize,
    processImage,
    processImageWithRegions,
    processImageAuto,
    clearResult,
    terminate,
    retry,
    acceptResult,
    rejectResult,
    detectArtifactDescription,
  }
})
