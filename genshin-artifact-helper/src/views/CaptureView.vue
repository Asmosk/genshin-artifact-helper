<script setup lang="ts">
import { ref } from 'vue'
import { useCaptureStore } from '@/stores/capture'
import { useSettingsStore } from '@/stores/settings'
import { useOCRStore } from '@/stores/ocr'
import OCRResults from '@/components/OCRResults.vue'
import OCRRegionPreviews from '@/components/OCRRegionPreviews.vue'
import ScreenCaptureControls from '@/components/ScreenCaptureControls.vue'
import ManualUploadControls from '@/components/ManualUploadControls.vue'
import DebugPanel from '@/components/DebugPanel.vue'
import { useCaptureActions } from '@/composables/useCaptureActions'
import { useOCRDispatch } from '@/composables/useOCRDispatch'
import { useDebugPanel } from '@/composables/useDebugPanel'
import { useCanvasPreview } from '@/composables/useCanvasPreview'

const captureStore = useCaptureStore()
const settingsStore = useSettingsStore()
const ocrStore = useOCRStore()

const captureActions = useCaptureActions()
const previewCanvasRef = ref<HTMLCanvasElement | null>(null)

const callbacks = { sendToOCR: () => {}, redrawPreview: () => {} }

const debug = useDebugPanel({ callbacks, previewCanvasRef })

const ocrDispatch = useOCRDispatch({
  enabled: debug.debugPreprocessingEnabled,
  options: debug.debugPreprocessingOptions,
})

const canvasPreview = useCanvasPreview({
  previewCanvasRef,
  debugShowStarDetection: debug.debugShowStarDetection,
  debugShowHistograms: debug.debugShowHistograms,
  debugStarData: debug.debugStarData,
  starSettings: debug.starSettings,
  starCenterFinderMode: debug.starCenterFinderMode,
  starAlgorithmMode: debug.starAlgorithmMode,
  showRegionOffsetSetup: debug.showRegionOffsetSetup,
  regionEditorLayout: debug.regionEditorLayout,
  runStarDetectionDebug: debug.runStarDetectionDebug,
})

// Late-bind callbacks to resolve circular dependency
callbacks.sendToOCR = () => ocrDispatch.sendToOCR()
callbacks.redrawPreview = () => canvasPreview.redrawPreview()
</script>

<template>
  <div class="flex flex-col h-full p-4 gap-4">
    <div class="flex justify-between items-center pb-4 border-b border-dark-700">
      <h1 class="m-0 text-2xl text-white">Capture Artifact</h1>
      <div
        class="px-4 py-2 bg-dark-800 rounded text-sm text-gray-mid"
        :class="{ 'bg-red-500 text-white': captureStore.captureError }"
      >
        {{ captureActions.statusMessage.value }}
      </div>
    </div>

    <!-- Main Content -->
    <div class="content flex-1 overflow-hidden grid gap-4">
      <!-- Controls Panel -->
      <div class="flex flex-col gap-4 overflow-y-auto">
        <ScreenCaptureControls
          :has-capture="captureActions.hasCapture.value"
          :is-continuous="captureActions.isContinuous.value"
          @start="captureActions.startScreenCapture"
          @stop="captureActions.stopScreenCapture"
          @capture-frame="captureActions.captureSingleFrame"
          @toggle-continuous="captureActions.toggleContinuousCapture"
          @adjust-rate="captureActions.adjustCaptureRate"
        />

        <ManualUploadControls
          @file-drop="captureActions.handleFileDrop"
          @drag-over="captureActions.handleDragOver"
        />

        <section class="control-section">
          <h2>OCR Settings</h2>

          <div class="select-control">
            <label>Screen Type:</label>
            <select
              :value="settingsStore.ocrSettings.regions.screenType"
              @change="
                (e) =>
                  settingsStore.setOCRScreenType(
                    (e.target as HTMLSelectElement).value as any,
                  )
              "
            >
              <option value="auto">Auto-detect</option>
              <option value="inventory">Inventory</option>
              <option value="character">Character</option>
              <option value="rewards">Rewards</option>
            </select>
            <small>Which screen shows the artifact</small>
          </div>

          <div class="checkbox-control">
            <label>
              <input
                type="checkbox"
                :checked="canvasPreview.showOCRRegions.value"
                @change="canvasPreview.showOCRRegions.value = !canvasPreview.showOCRRegions.value"
              />
              Show Regions on Preview
            </label>
            <small>Highlight identified OCR areas</small>
          </div>
        </section>

        <DebugPanel
          :show-debug-menu="debug.showDebugMenu.value"
          :debug-show-star-detection="debug.debugShowStarDetection.value"
          :debug-show-histograms="debug.debugShowHistograms.value"
          :debug-star-data="debug.debugStarData.value"
          :star-settings="debug.starSettings.value"
          :star-algorithm-mode="debug.starAlgorithmMode.value"
          :star-center-finder-mode="debug.starCenterFinderMode.value"
          :debug-preprocessing-enabled="debug.debugPreprocessingEnabled.value"
          :debug-preprocessing-options="debug.debugPreprocessingOptions.value"
          :show-region-offset-setup="debug.showRegionOffsetSetup.value"
          :region-editor-screen-type="debug.regionEditorScreenType.value"
          :region-editor-layout="debug.regionEditorLayout.value"
          :has-image="captureActions.hasImage.value"
          @update:show-debug-menu="debug.showDebugMenu.value = $event"
          @update:debug-show-histograms="debug.debugShowHistograms.value = $event"
          @update:star-settings="debug.starSettings.value = $event"
          @update:star-algorithm-mode="debug.starAlgorithmMode.value = $event"
          @update:star-center-finder-mode="debug.starCenterFinderMode.value = $event"
          @update:debug-preprocessing-enabled="debug.debugPreprocessingEnabled.value = $event"
          @update:debug-preprocessing-options="debug.debugPreprocessingOptions.value = $event"
          @update:region-editor-layout="debug.regionEditorLayout.value = $event"
          @toggle-star-detection-debug="debug.toggleStarDetectionDebug"
          @toggle-region-offset-setup="debug.toggleRegionOffsetSetup"
          @editor-screen-type-change="debug.onEditorScreenTypeChange"
          @init-region-editor-layout="debug.initRegionEditorLayout"
        />
      </div>

      <!-- Preview Panel -->
      <div class="flex flex-col bg-dark-800 rounded-lg overflow-hidden">
        <div class="flex justify-between items-center p-4 border-b border-dark-700">
          <h2 class="m-0 text-base text-white">Preview</h2>
          <div v-if="captureActions.hasImage.value" class="flex gap-2">
            <button
              class="btn btn-primary"
              :disabled="ocrStore.isProcessing"
              @click="ocrDispatch.sendToOCR"
            >
              {{ ocrStore.isProcessing ? 'Processing...' : 'Process with OCR' }}
            </button>
          </div>
        </div>

        <div class="flex-1 flex items-center justify-center overflow-auto bg-dark-900 p-4">
          <div v-if="!captureActions.hasImage.value" class="text-center text-gray-mid">
            <p class="m-0 mb-2 text-lg">No image captured</p>
            <small>Start screen capture or upload an image</small>
          </div>
          <canvas v-else ref="previewCanvasRef" class="max-w-full max-h-full border border-dark-600" />
        </div>

        <!-- Region Previews -->
        <OCRRegionPreviews
          v-if="ocrStore.regionResults.length > 0"
          :regions="ocrStore.regionResults"
        />

        <!-- OCR Progress -->
        <div v-if="ocrStore.isProcessing" class="p-4 border-t border-dark-700 bg-dark-800">
          <div class="w-full h-2 bg-dark-900 rounded overflow-hidden mb-2">
            <div
              class="h-full transition-[width] duration-300 ease-out"
              style="background: linear-gradient(90deg, #00ff00, #00dd00)"
              :style="{ width: ocrStore.progress + '%' }"
            />
          </div>
          <div class="text-xs text-gray-mid text-center">
            {{ ocrStore.progressStatus }} ({{ ocrStore.progress }}%)
          </div>
        </div>

        <div
          v-if="captureActions.hasImage.value && captureStore.capturedImage"
          class="flex gap-8 p-4 border-t border-dark-700"
        >
          <div class="flex gap-2 text-sm">
            <label class="text-gray-mid">Dimensions:</label>
            <span class="text-white font-mono">
              {{ captureStore.capturedImage.original.width }} x
              {{ captureStore.capturedImage.original.height }}
            </span>
          </div>
          <div class="flex gap-2 text-sm">
            <label class="text-gray-mid">Timestamp:</label>
            <span class="text-white font-mono">{{ captureStore.capturedImage.timestamp.toLocaleTimeString() }}</span>
          </div>
          <div
            v-if="
              settingsStore.ocrSettings.regions.screenType === 'auto' &&
              ocrStore.detectedScreenType
            "
            class="flex gap-2 text-sm"
          >
            <label class="text-gray-mid">Screen Type:</label>
            <span class="text-white font-mono">{{ ocrStore.detectedScreenType }}</span>
          </div>
        </div>
      </div>

      <!-- OCR Results Panel -->
      <div v-if="ocrStore.hasResult || ocrStore.hasError" class="flex flex-col overflow-y-auto">
        <OCRResults />
      </div>
    </div>
  </div>
</template>

<style scoped>
.content {
  grid-template-columns: 300px 1fr 400px;
}

.content:not(:has(.ocr-panel > *)) {
  grid-template-columns: 300px 1fr;
}
</style>
