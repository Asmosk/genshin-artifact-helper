import { ref, computed, watch, type Ref } from 'vue'
import { useOCRStore } from '@/stores/ocr'
import { useCaptureStore } from '@/stores/capture'
import { getRegionTemplate, DEFAULT_PREPROCESSING } from '@/utils/ocr-region-templates'
import type { ArtifactRegionLayout, ScreenType, PreprocessingOptions } from '@/types/ocr-regions'
import {
  debugDetectStars,
  defaultStarDetectionSettings,
  legacyStarCenterFinder,
  regionStarCenterFinder,
  makeLegacyDetector,
  projectionStarDetector,
  type StarDetectionDebugData,
  type StarDetectionSettings,
  type StarDetectorFn,
} from '@/utils/star-detection'

export function useDebugPanel(params: {
  callbacks: { sendToOCR: () => void; redrawPreview: () => void }
  previewCanvasRef: Ref<HTMLCanvasElement | null>
}) {
  const ocrStore = useOCRStore()
  const captureStore = useCaptureStore()

  const showDebugMenu = ref(false)
  const debugShowStarDetection = ref(false)
  const debugShowHistograms = ref(false)
  const debugStarData = ref<StarDetectionDebugData | null>(null)
  const starSettings = ref<StarDetectionSettings>({ ...defaultStarDetectionSettings })
  const starAlgorithmMode = ref<'legacy' | 'projection'>('projection')
  const starCenterFinderMode = ref<'legacy' | 'region'>('legacy')

  const starDetector = computed<StarDetectorFn>(() => {
    if (starAlgorithmMode.value === 'projection') return projectionStarDetector
    const finder =
      starCenterFinderMode.value === 'region' ? regionStarCenterFinder : legacyStarCenterFinder
    return makeLegacyDetector(finder)
  })

  // Debug preprocessing overrides
  const debugPreprocessingEnabled = ref(false)
  const debugPreprocessingOptions = ref<PreprocessingOptions>({ ...DEFAULT_PREPROCESSING })

  let preprocessDebounceTimer: ReturnType<typeof setTimeout> | null = null

  watch(
    [debugPreprocessingEnabled, debugPreprocessingOptions],
    () => {
      if (!captureStore.hasImage) return
      if (preprocessDebounceTimer) clearTimeout(preprocessDebounceTimer)
      preprocessDebounceTimer = setTimeout(() => {
        params.callbacks.sendToOCR()
      }, 400)
    },
    { deep: true },
  )

  // Region editor state
  const showRegionOffsetSetup = ref(false)
  const regionEditorScreenType = ref<ScreenType>('inventory')
  const regionEditorLayout = ref<ArtifactRegionLayout | null>(null)

  function initRegionEditorLayout() {
    const template = JSON.parse(
      JSON.stringify(getRegionTemplate(regionEditorScreenType.value)),
    ) as ArtifactRegionLayout
    if (ocrStore.detectedAnchorPx && params.previewCanvasRef.value) {
      const w = params.previewCanvasRef.value.width
      const h = params.previewCanvasRef.value.height
      template.anchorPoint = {
        x: ocrStore.detectedAnchorPx.x / w,
        y: ocrStore.detectedAnchorPx.y / h,
      }
    }
    regionEditorLayout.value = template
  }

  function toggleRegionOffsetSetup() {
    showRegionOffsetSetup.value = !showRegionOffsetSetup.value
    if (showRegionOffsetSetup.value && !regionEditorLayout.value) {
      initRegionEditorLayout()
    }
  }

  function onEditorScreenTypeChange(type: ScreenType) {
    regionEditorScreenType.value = type
    initRegionEditorLayout()
  }

  function runStarDetectionDebug(): void {
    const canvas = captureStore.capturedImage?.original
    if (canvas) {
      debugStarData.value = debugDetectStars(
        canvas,
        canvas.height,
        starSettings.value,
        starDetector.value,
      )
    } else {
      debugStarData.value = null
    }
  }

  function toggleStarDetectionDebug(): void {
    debugShowStarDetection.value = !debugShowStarDetection.value
    if (debugShowStarDetection.value) {
      runStarDetectionDebug()
    } else {
      debugStarData.value = null
    }
    params.callbacks.redrawPreview()
  }

  return {
    showDebugMenu,
    debugShowStarDetection,
    debugShowHistograms,
    debugStarData,
    starSettings,
    starAlgorithmMode,
    starCenterFinderMode,
    starDetector,
    debugPreprocessingEnabled,
    debugPreprocessingOptions,
    showRegionOffsetSetup,
    regionEditorScreenType,
    regionEditorLayout,
    initRegionEditorLayout,
    toggleRegionOffsetSetup,
    onEditorScreenTypeChange,
    runStarDetectionDebug,
    toggleStarDetectionDebug,
  }
}
