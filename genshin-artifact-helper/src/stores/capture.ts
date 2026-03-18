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
  loadImageToCanvas,
} from '@/utils/capture'
import { useSettingsStore } from './settings'

export type CaptureMode = 'idle' | 'continuous' | 'manual'

export interface CapturedImage {
  /** Original canvas */
  original: HTMLCanvasElement
  /** Timestamp of capture */
  timestamp: Date
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

    const captured: CapturedImage = {
      original: canvas,
      timestamp: new Date(),
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
        const captured: CapturedImage = {
          original: canvas,
          timestamp: new Date(),
        }

        capturedImage.value = captured
        previewCanvas.value = canvas

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

      const captured: CapturedImage = {
        original: canvas,
        timestamp: new Date(),
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

  function setPreviewCanvas(canvas: HTMLCanvasElement | null): void {
    previewCanvas.value = canvas
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
    setPreviewCanvas,
  }
})
