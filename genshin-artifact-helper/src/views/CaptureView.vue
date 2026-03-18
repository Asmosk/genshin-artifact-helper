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
  <div class="capture-view">
    <div class="header">
      <h1>Capture Artifact</h1>
      <div class="status" :class="{ error: captureStore.captureError }">
        {{ captureActions.statusMessage.value }}
      </div>
    </div>

    <!-- Main Content -->
    <div class="content">
      <!-- Controls Panel -->
      <div class="controls-panel">
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
      <div class="preview-panel">
        <div class="preview-header">
          <h2>Preview</h2>
          <div v-if="captureActions.hasImage.value" class="preview-actions">
            <button
              class="btn btn-primary"
              :disabled="ocrStore.isProcessing"
              @click="ocrDispatch.sendToOCR"
            >
              {{ ocrStore.isProcessing ? 'Processing...' : 'Process with OCR' }}
            </button>
          </div>
        </div>

        <div class="preview-content">
          <div v-if="!captureActions.hasImage.value" class="preview-placeholder">
            <p>No image captured</p>
            <small>Start screen capture or upload an image</small>
          </div>
          <canvas v-else ref="previewCanvasRef" class="preview-canvas" />
        </div>

        <!-- Region Previews -->
        <OCRRegionPreviews
          v-if="ocrStore.regionResults.length > 0"
          :regions="ocrStore.regionResults"
        />

        <!-- OCR Progress -->
        <div v-if="ocrStore.isProcessing" class="ocr-progress">
          <div class="progress-bar">
            <div class="progress-fill" :style="{ width: ocrStore.progress + '%' }" />
          </div>
          <div class="progress-text">
            {{ ocrStore.progressStatus }} ({{ ocrStore.progress }}%)
          </div>
        </div>

        <div
          v-if="captureActions.hasImage.value && captureStore.capturedImage"
          class="preview-info"
        >
          <div class="info-item">
            <label>Dimensions:</label>
            <span>
              {{ captureStore.capturedImage.original.width }} x
              {{ captureStore.capturedImage.original.height }}
            </span>
          </div>
          <div class="info-item">
            <label>Timestamp:</label>
            <span>{{ captureStore.capturedImage.timestamp.toLocaleTimeString() }}</span>
          </div>
          <div
            v-if="
              settingsStore.ocrSettings.regions.screenType === 'auto' &&
              ocrStore.detectedScreenType
            "
            class="info-item"
          >
            <label>Screen Type:</label>
            <span>{{ ocrStore.detectedScreenType }}</span>
          </div>
        </div>
      </div>

      <!-- OCR Results Panel -->
      <div v-if="ocrStore.hasResult || ocrStore.hasError" class="ocr-panel">
        <OCRResults />
      </div>
    </div>
  </div>
</template>

<style scoped>
.capture-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 1rem;
  gap: 1rem;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 1rem;
  border-bottom: 1px solid #333;
}

.header h1 {
  margin: 0;
  font-size: 1.5rem;
  color: #fff;
}

.status {
  padding: 0.5rem 1rem;
  background: #2a2a2a;
  border-radius: 4px;
  font-size: 0.9rem;
  color: #888;
}

.status.error {
  background: #ff4444;
  color: #fff;
}

.content {
  display: grid;
  grid-template-columns: 300px 1fr 400px;
  gap: 1rem;
  flex: 1;
  overflow: hidden;
}

.content:not(:has(.ocr-panel)) {
  grid-template-columns: 300px 1fr;
}

.controls-panel {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  overflow-y: auto;
}

.preview-panel {
  display: flex;
  flex-direction: column;
  background: #2a2a2a;
  border-radius: 8px;
  overflow: hidden;
}

.preview-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem;
  border-bottom: 1px solid #333;
}

.preview-header h2 {
  margin: 0;
  font-size: 1rem;
  color: #fff;
}

.preview-actions {
  display: flex;
  gap: 0.5rem;
}

.preview-content {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: auto;
  background: #1a1a1a;
  padding: 1rem;
}

.preview-placeholder {
  text-align: center;
  color: #888;
}

.preview-placeholder p {
  margin: 0 0 0.5rem 0;
  font-size: 1.1rem;
}

.preview-canvas {
  max-width: 100%;
  max-height: 100%;
  border: 1px solid #444;
}

.preview-info {
  padding: 1rem;
  border-top: 1px solid #333;
  display: flex;
  gap: 2rem;
}

.info-item {
  display: flex;
  gap: 0.5rem;
  font-size: 0.9rem;
}

.info-item label {
  color: #888;
}

.info-item span {
  color: #fff;
  font-family: monospace;
}

.ocr-progress {
  padding: 1rem;
  border-top: 1px solid #333;
  background: #2a2a2a;
}

.progress-bar {
  width: 100%;
  height: 8px;
  background: #1a1a1a;
  border-radius: 4px;
  overflow: hidden;
  margin-bottom: 0.5rem;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #00ff00, #00dd00);
  transition: width 0.3s ease;
}

.progress-text {
  font-size: 0.85rem;
  color: #888;
  text-align: center;
}

.ocr-panel {
  display: flex;
  flex-direction: column;
  overflow-y: auto;
}
</style>
