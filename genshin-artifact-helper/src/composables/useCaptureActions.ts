import { ref, computed } from 'vue'
import { useCaptureStore } from '@/stores/capture'
import { useSettingsStore } from '@/stores/settings'
import type { CaptureRegion } from '@/types/capture'

export function useCaptureActions() {
  const captureStore = useCaptureStore()
  const settingsStore = useSettingsStore()

  const showRegionSelector = ref(false)
  const regionSelectorCanvas = ref<HTMLCanvasElement | null>(null)

  const hasCapture = computed(() => captureStore.isActive)
  const hasImage = computed(() => captureStore.hasImage)
  const hasRegion = computed(() => settingsStore.captureRegionSet)
  const isContinuous = computed(() => captureStore.isContinuousMode)
  const processingEnabled = computed(() => settingsStore.captureSettings.enablePreprocessing)

  const statusMessage = computed(() => {
    if (captureStore.captureError) {
      return `Error: ${captureStore.captureError}`
    }
    if (captureStore.isCapturing) {
      return 'Capturing...'
    }
    if (isContinuous.value) {
      return 'Continuous capture active'
    }
    if (hasCapture.value) {
      return 'Screen capture ready'
    }
    return 'No active capture'
  })

  async function startScreenCapture(): Promise<void> {
    try {
      await captureStore.startScreenCapture()
    } catch (error) {
      console.error('Failed to start screen capture:', error)
    }
  }

  function stopScreenCapture(): void {
    captureStore.stopScreenCapture()
  }

  async function captureSingleFrame(): Promise<void> {
    try {
      await captureStore.captureSingleFrame()
    } catch (error) {
      console.error('Failed to capture frame:', error)
    }
  }

  function toggleContinuousCapture(): void {
    if (isContinuous.value) {
      captureStore.stopContinuousCapture()
    } else {
      captureStore.startContinuousCapture()
    }
  }

  async function handleFileDrop(event: DragEvent): Promise<void> {
    event.preventDefault()
    const file = event.dataTransfer?.files[0]
    if (!file) return

    try {
      await captureStore.uploadImage(file)
    } catch (error) {
      console.error('Failed to upload image:', error)
    }
  }

  function handleDragOver(event: DragEvent): void {
    event.preventDefault()
  }

  async function startRegionSelection(): Promise<void> {
    if (hasCapture.value && !hasImage.value) {
      await captureSingleFrame()
    }

    if (captureStore.capturedImage) {
      regionSelectorCanvas.value = captureStore.capturedImage.original
      showRegionSelector.value = true
      captureStore.enterRegionSelectionMode()
    }
  }

  function handleRegionSelected(region: CaptureRegion): void {
    settingsStore.setCaptureRegion(region)
    showRegionSelector.value = false
    captureStore.exitRegionSelectionMode()
  }

  function handleRegionCancel(): void {
    showRegionSelector.value = false
    captureStore.exitRegionSelectionMode()
  }

  function clearRegion(): void {
    settingsStore.clearCaptureRegion()
  }

  function togglePreprocessing(): void {
    settingsStore.togglePreprocessing()
    if (hasImage.value) {
      captureStore.reprocessImage(false)
    }
  }

  function adjustCaptureRate(delta: number): void {
    const newRate = settingsStore.captureSettings.captureRate + delta
    settingsStore.setCaptureRate(newRate)
  }

  return {
    showRegionSelector,
    regionSelectorCanvas,
    hasCapture,
    hasImage,
    hasRegion,
    isContinuous,
    processingEnabled,
    statusMessage,
    startScreenCapture,
    stopScreenCapture,
    captureSingleFrame,
    toggleContinuousCapture,
    handleFileDrop,
    handleDragOver,
    startRegionSelection,
    handleRegionSelected,
    handleRegionCancel,
    clearRegion,
    togglePreprocessing,
    adjustCaptureRate,
  }
}
