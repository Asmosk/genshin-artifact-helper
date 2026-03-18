import { computed } from 'vue'
import { useCaptureStore } from '@/stores/capture'
import { useSettingsStore } from '@/stores/settings'

export function useCaptureActions() {
  const captureStore = useCaptureStore()
  const settingsStore = useSettingsStore()

  const hasCapture = computed(() => captureStore.isActive)
  const hasImage = computed(() => captureStore.hasImage)
  const isContinuous = computed(() => captureStore.isContinuousMode)

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

  function adjustCaptureRate(delta: number): void {
    const newRate = settingsStore.captureSettings.captureRate + delta
    settingsStore.setCaptureRate(newRate)
  }

  return {
    hasCapture,
    hasImage,
    isContinuous,
    statusMessage,
    startScreenCapture,
    stopScreenCapture,
    captureSingleFrame,
    toggleContinuousCapture,
    handleFileDrop,
    handleDragOver,
    adjustCaptureRate,
  }
}
