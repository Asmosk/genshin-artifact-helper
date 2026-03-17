import type { Ref } from 'vue'
import { useCaptureStore } from '@/stores/capture'
import { useOCRStore } from '@/stores/ocr'
import type { PreprocessingOptions } from '@/types/ocr-regions'

export function useOCRDispatch(params: {
  enabled: Ref<boolean>
  options: Ref<PreprocessingOptions>
}) {
  const captureStore = useCaptureStore()
  const ocrStore = useOCRStore()

  function clearImage(): void {
    captureStore.clearImage()
    ocrStore.clearResult()
  }

  function detectArtifactDescription(): void {
    if (!captureStore.capturedImage) return
    ocrStore.detectArtifactDescription(captureStore.capturedImage.original)
  }

  async function sendToOCR(): Promise<void> {
    if (!captureStore.capturedImage) {
      return
    }

    try {
      const imageToProcess =
        captureStore.capturedImage.preprocessed ?? captureStore.capturedImage.original

      const overrides = params.enabled.value ? params.options.value : undefined

      await ocrStore.processImage(imageToProcess, overrides)
    } catch (error) {
      console.error('OCR processing failed:', error)
      alert('OCR processing failed. See console for details.')
    }
  }

  return {
    clearImage,
    detectArtifactDescription,
    sendToOCR,
  }
}
