<script setup lang="ts">
import { ref, computed } from 'vue'
import { useCaptureStore } from '@/stores/capture'
import { useOCRStore } from '@/stores/ocr'
import { useArtifactStore } from '@/stores/artifact'
import ArtifactScoreCard from '@/components/ArtifactScoreCard.vue'
import BuildProfileSelector from '@/components/BuildProfileSelector.vue'
import { useCaptureActions } from '@/composables/useCaptureActions'
import { useOCRDispatch } from '@/composables/useOCRDispatch'
import { useCanvasPreview } from '@/composables/useCanvasPreview'
import { defaultStarDetectionSettings } from '@/utils/star-detection'
import { DEFAULT_PREPROCESSING } from '@/utils/ocr-region-templates'
import { clampAspectRatio } from '@/utils/aspect-ratio'

const captureStore = useCaptureStore()
const ocrStore = useOCRStore()
const artifactStore = useArtifactStore()
const captureActions = useCaptureActions()
const previewCanvasRef = ref<HTMLCanvasElement | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)

const ocrDispatch = useOCRDispatch({
  enabled: ref(false),
  options: ref(DEFAULT_PREPROCESSING),
})

useCanvasPreview({
  previewCanvasRef,
  debugShowStarDetection: ref(false),
  debugShowHistograms: ref(false),
  debugStarData: ref(null),
  starSettings: ref(defaultStarDetectionSettings),
  starCenterFinderMode: ref('region'),
  starAlgorithmMode: ref('projection'),
  showRegionOffsetSetup: ref(false),
  regionEditorLayout: ref(null),
  runStarDetectionDebug: () => {},
})

// Status strip
const imageResolution = computed(() => {
  const img = captureStore.capturedImage
  if (!img) return null
  return `${img.original.width}×${img.original.height}`
})

const imageAspectRatio = computed(() => {
  const img = captureStore.capturedImage
  if (!img) return null
  return clampAspectRatio(img.original.width, img.original.height)
})

const ocrPerformed = computed(() => ocrStore.isComplete || artifactStore.hasArtifact)

const noArtifactDetected = computed(
  () =>
    captureActions.hasImage.value &&
    ocrStore.hasError &&
    !ocrStore.isProcessing &&
    !artifactStore.hasArtifact,
)

// File upload
function triggerFileUpload() {
  fileInputRef.value?.click()
}

async function handleFileUpload(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  try {
    await captureStore.uploadImage(file)
  } catch (err) {
    console.error('Failed to upload image:', err)
  }
  ;(event.target as HTMLInputElement).value = ''
}
</script>

<template>
  <div class="flex flex-col h-full bg-dark-900 text-white overflow-hidden">

    <!-- Header -->
    <div class="flex justify-between items-center px-6 py-4 border-b border-dark-700 shrink-0">
      <h1 class="m-0 text-xl font-semibold">Artifact Scanner</h1>
      <BuildProfileSelector />
    </div>

    <!-- Main: centered score card or empty state -->
    <div class="flex-1 flex items-center justify-center p-6 overflow-y-auto">
      <ArtifactScoreCard v-if="artifactStore.hasArtifact" class="w-full max-w-lg" />
      <div v-else class="flex flex-col items-center gap-3 text-center text-slate-500">
        <div class="text-6xl opacity-20">⚔</div>
        <p class="m-0 text-lg">Capture an artifact to see its score</p>
        <p class="m-0 text-sm">Start screen capture or upload a screenshot below</p>
        <p v-if="noArtifactDetected" class="m-0 text-sm text-amber-400/80">
          No artifact details found in the current image
        </p>
      </div>
    </div>

    <!-- Bottom dock -->
    <div class="relative shrink-0 border-t border-dark-700 bg-dark-800 flex items-center gap-5 px-4 py-3">

      <!-- OCR progress overlay -->
      <Transition name="fade">
        <div
          v-if="ocrStore.isProcessing"
          class="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-dark-800/90 backdrop-blur-sm z-10 rounded-none px-8"
        >
          <div class="w-full max-w-sm">
            <div class="w-full h-1.5 bg-dark-700 rounded-full overflow-hidden">
              <div
                class="h-full rounded-full transition-[width] duration-300 ease-out bg-neon-green"
                :style="{ width: ocrStore.progress + '%' }"
              />
            </div>
            <div class="text-xs text-gray-mid text-center mt-1.5">
              {{ ocrStore.progressStatus }} ({{ ocrStore.progress }}%)
            </div>
          </div>
        </div>
      </Transition>

      <!-- Preview thumbnail -->
      <div
        class="w-44 h-[100px] shrink-0 bg-dark-900 rounded-lg overflow-hidden flex items-center justify-center"
      >
        <span v-if="!captureActions.hasImage.value" class="text-xs text-dark-500">No image</span>
        <canvas v-else ref="previewCanvasRef" class="max-w-full max-h-full object-contain" />
      </div>

      <!-- Status strip -->
      <div class="flex flex-col gap-1 text-xs w-44 shrink-0">
        <template v-if="captureActions.hasImage.value">
          <div class="flex justify-between gap-2">
            <span class="text-gray-mid">Resolution</span>
            <span class="font-mono">{{ imageResolution }}</span>
          </div>
          <div class="flex justify-between gap-2">
            <span class="text-gray-mid">Aspect Ratio</span>
            <span class="font-mono">{{ imageAspectRatio }}</span>
          </div>
          <div class="flex justify-between gap-2">
            <span class="text-gray-mid">Screen Type</span>
            <span :class="ocrStore.detectedScreenType ? 'text-blue-300' : 'text-dark-500'">
              {{ ocrStore.detectedScreenType ?? '—' }}
            </span>
          </div>
          <div class="flex justify-between gap-2">
            <span class="text-gray-mid">Stars</span>
            <span v-if="ocrStore.detectedStarCount" class="text-gold text-[10px] tracking-wide">
              {{ '★'.repeat(ocrStore.detectedStarCount) }}
            </span>
            <span v-else class="text-dark-500">—</span>
          </div>
          <div class="flex justify-between gap-2">
            <span class="text-gray-mid">OCR</span>
            <span :class="ocrPerformed ? 'text-neon-green' : 'text-dark-500'">
              {{ ocrPerformed ? 'done' : '—' }}
            </span>
          </div>
        </template>
        <span v-else class="text-dark-500 italic text-center">No image captured</span>
      </div>

      <div class="flex-1" />

      <!-- Capture + upload controls -->
      <div class="flex items-center gap-2 shrink-0">
        <button
          v-if="!captureActions.hasCapture.value"
          class="btn btn-primary"
          @click="captureActions.startScreenCapture"
        >
          Start Capture
        </button>
        <template v-else>
          <button class="btn btn-danger" @click="captureActions.stopScreenCapture">
            Stop Capture
          </button>
          <button
            class="btn btn-secondary"
            :disabled="captureActions.isContinuous.value"
            @click="captureActions.captureSingleFrame"
          >
            Capture Frame
          </button>
          <button class="btn btn-secondary" @click="captureActions.toggleContinuousCapture">
            {{ captureActions.isContinuous.value ? 'Stop Continuous' : 'Start Continuous' }}
          </button>
        </template>

        <button class="btn btn-secondary" @click="triggerFileUpload">Upload Image</button>

        <button
          class="btn btn-secondary"
          :disabled="!captureActions.hasImage.value || ocrStore.isProcessing"
          @click="ocrDispatch.sendToOCR"
        >
          {{ ocrStore.isProcessing ? 'Processing…' : 'Process with OCR' }}
        </button>

        <input
          ref="fileInputRef"
          type="file"
          accept="image/*"
          class="hidden"
          @change="handleFileUpload"
        />
      </div>
    </div>

  </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
