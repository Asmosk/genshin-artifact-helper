/**
 * Capture store - manages screen capture state and captured images
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import {
  requestScreenCapture,
  stopCapture,
  captureFrame,
  createCaptureLoop,
  cropCanvas,
  loadImageToCanvas,
} from '@/utils/capture'
import { preprocessForOCR, preprocessQuick } from '@/utils/preprocessing'
import type { CaptureRegion } from '@/types/capture'
import type { PreprocessingOptions } from '@/stores/settings'
import { useSettingsStore } from './settings'

export type CaptureMode = 'idle' | 'selecting-region' | 'continuous' | 'manual'

export interface CapturedImage {
  /** Original canvas */
  original: HTMLCanvasElement
  /** Preprocessed canvas (if enabled) */
  preprocessed: HTMLCanvasElement | null
  /** Timestamp of capture */
  timestamp: Date
  /** Region used for capture (if any) */
  region: CaptureRegion | null
}

/**
 * Crop a source canvas to a region (if set) and optionally preprocess it.
 * Returns the final canvas and the preprocessed canvas (if preprocessing is enabled).
 */
function cropAndPreprocess(
  sourceCanvas: HTMLCanvasElement,
  region: CaptureRegion | null,
  enablePreprocessing: boolean,
  preprocessingOptions: PreprocessingOptions,
  preprocess: typeof preprocessForOCR = preprocessForOCR,
): { finalCanvas: HTMLCanvasElement; preprocessed: HTMLCanvasElement | null } {
  let finalCanvas = sourceCanvas

  if (region) {
    // Only crop if image is large enough to contain the region
    if (
      sourceCanvas.width >= region.x + region.width &&
      sourceCanvas.height >= region.y + region.height
    ) {
      finalCanvas = cropCanvas(sourceCanvas, region)
    }
  }

  let preprocessed: HTMLCanvasElement | null = null
  if (enablePreprocessing) {
    preprocessed = preprocess(finalCanvas, preprocessingOptions)
  }

  return { finalCanvas, preprocessed }
}

export const useCaptureStore = defineStore('capture', () => {
  // State
  const mode = ref<CaptureMode>('idle')
  const stream = ref<MediaStream | null>(null)
  const capturedImage = ref<CapturedImage | null>(null)
  const isCapturing = ref(false)
  const captureError = ref<string | null>(null)
  const previewCanvas = ref<HTMLCanvasElement | null>(null)

  // Continuous capture loop
  let captureLoop: ReturnType<typeof createCaptureLoop> | null = null

  // Getters
  const isActive = computed(() => stream.value !== null)
  const hasImage = computed(() => capturedImage.value !== null)
  const canStartCapture = computed(() => mode.value === 'idle' && !isCapturing.value)
  const isContinuousMode = computed(() => mode.value === 'continuous')

  // Actions - Screen Capture
  async function startScreenCapture(): Promise<void> {
    try {
      captureError.value = null
      isCapturing.value = true

      const mediaStream = await requestScreenCapture({
        video: {
          cursor: 'never',
          frameRate: { ideal: 30, max: 60 },
        },
      })

      stream.value = mediaStream
      mode.value = 'manual'

      // Listen for stream ending (user clicks stop sharing)
      const videoTrack = mediaStream.getVideoTracks()[0]
      if (videoTrack) {
        videoTrack.addEventListener('ended', () => {
          stopScreenCapture()
        })
      }
    } catch (error) {
      captureError.value = error instanceof Error ? error.message : 'Unknown error'
      throw error
    } finally {
      isCapturing.value = false
    }
  }

  function stopScreenCapture(): void {
    if (stream.value) {
      stopCapture(stream.value)
      stream.value = null
    }

    if (captureLoop) {
      captureLoop.stop()
      captureLoop = null
    }

    mode.value = 'idle'
    previewCanvas.value = null
  }

  // Actions - Frame Capture
  async function captureSingleFrame(): Promise<CapturedImage> {
    if (!stream.value) {
      throw new Error('No active screen capture')
    }

    const canvas = document.createElement('canvas')
    await captureFrame(stream.value, canvas)

    const settingsStore = useSettingsStore()
    const region = settingsStore.captureSettings.region

    const { finalCanvas, preprocessed } = cropAndPreprocess(
      canvas,
      region,
      settingsStore.captureSettings.enablePreprocessing,
      settingsStore.captureSettings.preprocessingOptions,
    )

    const captured: CapturedImage = {
      original: finalCanvas,
      preprocessed,
      timestamp: new Date(),
      region,
    }

    capturedImage.value = captured
    return captured
  }

  // Actions - Continuous Capture
  function startContinuousCapture(onFrame?: (image: CapturedImage) => void): void {
    if (!stream.value) {
      throw new Error('No active screen capture')
    }

    const settingsStore = useSettingsStore()
    const fps = settingsStore.captureSettings.captureRate

    mode.value = 'continuous'

    captureLoop = createCaptureLoop(
      stream.value,
      (canvas) => {
        const region = settingsStore.captureSettings.region

        const { finalCanvas, preprocessed } = cropAndPreprocess(
          canvas,
          region,
          settingsStore.captureSettings.enablePreprocessing,
          settingsStore.captureSettings.preprocessingOptions,
          preprocessQuick,
        )

        const captured: CapturedImage = {
          original: finalCanvas,
          preprocessed,
          timestamp: new Date(),
          region,
        }

        capturedImage.value = captured
        previewCanvas.value = preprocessed ?? finalCanvas

        // Call user callback if provided
        if (onFrame) {
          onFrame(captured)
        }
      },
      fps,
    )

    captureLoop.start()
  }

  function stopContinuousCapture(): void {
    if (captureLoop) {
      captureLoop.stop()
      captureLoop = null
    }
    mode.value = 'manual'
  }

  // Actions - Manual Upload
  async function uploadImage(file: File): Promise<CapturedImage> {
    try {
      captureError.value = null
      isCapturing.value = true

      const canvas = await loadImageToCanvas(file)

      const settingsStore = useSettingsStore()
      const region = settingsStore.captureSettings.region

      const { finalCanvas, preprocessed } = cropAndPreprocess(
        canvas,
        region,
        settingsStore.captureSettings.enablePreprocessing,
        settingsStore.captureSettings.preprocessingOptions,
      )

      const captured: CapturedImage = {
        original: finalCanvas,
        preprocessed,
        timestamp: new Date(),
        region,
      }

      capturedImage.value = captured
      mode.value = 'manual'

      return captured
    } catch (error) {
      captureError.value = error instanceof Error ? error.message : 'Failed to upload image'
      throw error
    } finally {
      isCapturing.value = false
    }
  }

  // Actions - Image Management
  function clearImage(): void {
    capturedImage.value = null
  }

  function setPreviewCanvas(canvas: HTMLCanvasElement | null): void {
    previewCanvas.value = canvas
  }

  // Actions - Preprocessing
  function reprocessImage(fullProcess: boolean = false): void {
    if (!capturedImage.value) return

    const settingsStore = useSettingsStore()
    if (!settingsStore.captureSettings.enablePreprocessing) {
      capturedImage.value.preprocessed = null
      return
    }

    const options = settingsStore.captureSettings.preprocessingOptions
    const processor = fullProcess ? preprocessForOCR : preprocessQuick
    capturedImage.value.preprocessed = processor(capturedImage.value.original, options)
  }

  // Actions - Region Selection
  function enterRegionSelectionMode(): void {
    mode.value = 'selecting-region'
  }

  function exitRegionSelectionMode(): void {
    mode.value = stream.value ? 'manual' : 'idle'
  }

  return {
    // State
    mode,
    stream,
    capturedImage,
    isCapturing,
    captureError,
    previewCanvas,

    // Getters
    isActive,
    hasImage,
    canStartCapture,
    isContinuousMode,

    // Actions - Screen Capture
    startScreenCapture,
    stopScreenCapture,

    // Actions - Frame Capture
    captureSingleFrame,

    // Actions - Continuous Capture
    startContinuousCapture,
    stopContinuousCapture,

    // Actions - Manual Upload
    uploadImage,

    // Actions - Image Management
    clearImage,
    setPreviewCanvas,

    // Actions - Preprocessing
    reprocessImage,

    // Actions - Region Selection
    enterRegionSelectionMode,
    exitRegionSelectionMode,
  }
})
