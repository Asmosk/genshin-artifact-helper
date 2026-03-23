/**
 * Auto-pipeline composable — automatically runs frame diff → OCR → accept
 * whenever screen capture is active. Starts continuous capture as soon as
 * a stream is available and processes every detected artifact change.
 */

import { watch } from 'vue'
import { ref } from 'vue'
import { useCaptureStore } from '@/stores/capture'
import { useOCRStore } from '@/stores/ocr'
import { useArtifactStore } from '@/stores/artifact'
import { hasFrameChanged, type ImageDataLike } from '@/utils/frame-diff'
import { REGION_TEMPLATES } from '@/utils/ocr-region-templates'
import type { Rectangle } from '@/types/ocr-regions'

export type AutoPipelineStatus = 'idle' | 'waiting' | 'processing'

export function useAutoPipeline() {
  const captureStore = useCaptureStore()
  const ocrStore = useOCRStore()
  const artifactStore = useArtifactStore()

  const status = ref<AutoPipelineStatus>('idle')
  const lastProcessTime = ref<Date | null>(null)

  // Per-frame state (not reactive — internal bookkeeping only)
  let previousImageData: ImageDataLike | null = null
  let lastKnownRegions: Rectangle[] | null = null

  /**
   * Fallback diff region when no prior OCR has established region positions.
   * Uses the inventory layout's starSearchBounds as a conservative area likely
   * to contain artifact content across all three screen types.
   */
  function getFallbackRegions(width: number, height: number): Rectangle[] {
    const b = REGION_TEMPLATES.inventory.starSearchBounds
    return [
      {
        x: b.xMin * width,
        y: b.yMin * height,
        width: (b.xMax - b.xMin) * width,
        height: (b.yMax - b.yMin) * height,
      },
    ]
  }

  function cloneCanvas(source: HTMLCanvasElement): HTMLCanvasElement {
    const clone = document.createElement('canvas')
    clone.width = source.width
    clone.height = source.height
    clone.getContext('2d', { willReadFrequently: true })!.drawImage(source, 0, 0)
    return clone
  }

  // Start continuous capture automatically when a stream becomes available
  watch(
    () => captureStore.isActive,
    (active) => {
      if (active && !captureStore.isContinuousMode) {
        previousImageData = null
        lastKnownRegions = null
        status.value = 'waiting'
        captureStore.startContinuousCapture()
      } else if (!active) {
        status.value = 'idle'
        previousImageData = null
        lastKnownRegions = null
      }
    },
  )

  // Process each incoming frame
  watch(
    () => captureStore.capturedImage,
    (captured) => {
      if (!captureStore.isActive || !captured) return
      if (ocrStore.isProcessing) return

      const canvas = captured.original
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) return

      const currentData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const regions = lastKnownRegions ?? getFallbackRegions(canvas.width, canvas.height)

      if (!hasFrameChanged(currentData, previousImageData, regions)) return

      // Frame changed — snapshot and trigger OCR
      previousImageData = currentData
      status.value = 'processing'

      const cloned = cloneCanvas(canvas)

      void (async () => {
        try {
          await ocrStore.processImage(cloned)

          // Save region positions before acceptResult clears them
          if (ocrStore.detectedRegionPositions) {
            lastKnownRegions = Array.from(ocrStore.detectedRegionPositions.values())
          }

          if (ocrStore.hasResult) {
            ocrStore.acceptResult()
            lastProcessTime.value = new Date()
          } else {
            artifactStore.clearArtifact()
          }
        } catch {
          artifactStore.clearArtifact()
          // Will retry on next detected frame change
        } finally {
          status.value = captureStore.isActive ? 'waiting' : 'idle'
        }
      })()
    },
  )

  return {
    status,
    lastProcessTime,
  }
}
