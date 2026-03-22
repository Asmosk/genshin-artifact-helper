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

  async function sendToOCR(): Promise<void> {
    if (!captureStore.capturedImage) {
      return
    }

    try {
      const overrides = params.enabled.value ? params.options.value : undefined
      await ocrStore.processImage(captureStore.capturedImage.original, overrides)
      if (ocrStore.hasResult) {
        ocrStore.acceptResult()
      }
    } catch (error) {
      console.error('OCR processing failed:', error)
      alert('OCR processing failed. See console for details.')
    }
  }

  return {
    sendToOCR,
  }
}
