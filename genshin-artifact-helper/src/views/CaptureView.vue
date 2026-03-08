<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { useCaptureStore } from '@/stores/capture'
import { useSettingsStore } from '@/stores/settings'
import { useArtifactStore } from '@/stores/artifact'
import { useOCRStore } from '@/stores/ocr'
import { getRegionTemplate } from '@/utils/ocr-region-templates'
import RegionSelector from '@/components/RegionSelector.vue'
import PreprocessingSettings from '@/components/PreprocessingSettings.vue'
import OCRResults from '@/components/OCRResults.vue'
import type { CaptureRegion } from '@/utils/capture'

const captureStore = useCaptureStore()
const settingsStore = useSettingsStore()
const artifactStore = useArtifactStore()
const ocrStore = useOCRStore()

const fileInputRef = ref<HTMLInputElement | null>(null)
const previewCanvasRef = ref<HTMLCanvasElement | null>(null)
const showRegionSelector = ref(false)
const regionSelectorCanvas = ref<HTMLCanvasElement | null>(null)
const showAdvancedPreprocessing = ref(false)
const showOCRRegions = ref(true)

// Computed
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

// Watch for captured images and update preview
const activeLayout = computed(() => {
  if (ocrStore.activeLayout) {
    return ocrStore.activeLayout
  }
  // If no active layout from OCR run, but we have a screen type selected, show that template for preview
  if (settingsStore.ocrSettings.regions.enabled && settingsStore.ocrSettings.regions.screenType !== 'auto') {
    try {
      return getRegionTemplate(settingsStore.ocrSettings.regions.screenType as any)
    } catch (e) {
      return null
    }
  }
  return null
})

watch(
  [() => captureStore.capturedImage, activeLayout, showOCRRegions],
  async ([image, layout]) => {
    if (image) {
      // Wait for DOM to update (canvas element to be rendered)
      await nextTick()

      if (previewCanvasRef.value) {
        const ctx = previewCanvasRef.value.getContext('2d')
        if (ctx) {
          const displayCanvas = image.preprocessed ?? image.original
          previewCanvasRef.value.width = displayCanvas.width
          previewCanvasRef.value.height = displayCanvas.height
          ctx.drawImage(displayCanvas, 0, 0)

          // Draw OCR regions if enabled and available
          if (showOCRRegions.value && layout) {
            drawOCRRegions(ctx, layout, previewCanvasRef.value.width, previewCanvasRef.value.height)
          }
        }
      }
    }
  },
)

function drawOCRRegions(
  ctx: CanvasRenderingContext2D,
  layout: any,
  width: number,
  height: number,
): void {
  ctx.strokeStyle = '#00ff00'
  ctx.lineWidth = 2
  ctx.fillStyle = '#00ff00'
  ctx.font = 'bold 12px sans-serif'
  ctx.textBaseline = 'bottom'

  const drawRegion = (region: any, name: string) => {
    const rx = region.x * width
    const ry = region.y * height
    const rw = region.width * width
    const rh = region.height * height

    // Draw rectangle
    ctx.strokeRect(rx, ry, rw, rh)

    // Draw label background for better readability
    const label = name.replace(/([A-Z])/g, ' $1').toLowerCase()
    const textWidth = ctx.measureText(label).width
    ctx.globalAlpha = 0.7
    ctx.fillRect(rx, ry - 18, textWidth + 10, 18)
    ctx.globalAlpha = 1.0

    // Draw label text
    ctx.fillStyle = '#000'
    ctx.fillText(label, rx + 5, ry - 2)
    ctx.fillStyle = '#00ff00'
  }

  // Draw anchor region if it exists
  if (layout.anchorRegion) {
    drawRegion(layout.anchorRegion, 'anchor')
  }

  // Draw all other regions
  for (const [name, region] of Object.entries(layout.regions)) {
    // Skip if it's the same as anchor (avoid double drawing)
    if (region === layout.anchorRegion) continue
    drawRegion(region as any, name)
  }
}

// Actions - Screen Capture
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

// Actions - File Upload
function triggerFileUpload(): void {
  fileInputRef.value?.click()
}

async function handleFileUpload(event: Event): Promise<void> {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return

  try {
    await captureStore.uploadImage(file)
  } catch (error) {
    console.error('Failed to upload image:', error)
  }

  // Reset file input
  target.value = ''
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

// Actions - Region Selection
async function startRegionSelection(): Promise<void> {
  // Capture a frame first if we have an active stream
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

// Actions - Settings
function togglePreprocessing(): void {
  settingsStore.togglePreprocessing()
  // Reprocess current image if available
  if (hasImage.value) {
    captureStore.reprocessImage(false)
  }
}

function adjustCaptureRate(delta: number): void {
  const newRate = settingsStore.captureSettings.captureRate + delta
  settingsStore.setCaptureRate(newRate)
}

// Actions - Image Processing
function clearImage(): void {
  captureStore.clearImage()
  ocrStore.clearResult()
}

async function sendToOCR(): Promise<void> {
  if (!captureStore.capturedImage) {
    return
  }

  try {
    // Use preprocessed image if available, otherwise original
    const imageToProcess = captureStore.capturedImage.preprocessed ?? captureStore.capturedImage.original

    // Use processImageAuto which automatically selects region-based or full-image OCR
    await ocrStore.processImageAuto(imageToProcess)
  } catch (error) {
    console.error('OCR processing failed:', error)
    alert('OCR processing failed. See console for details.')
  }
}
</script>

<template>
  <div class="capture-view">
    <div class="header">
      <h1>Capture Artifact</h1>
      <div class="status" :class="{ error: captureStore.captureError }">
        {{ statusMessage }}
      </div>
    </div>

    <!-- Region Selector Modal -->
    <div v-if="showRegionSelector" class="modal-overlay">
      <div class="modal-content">
        <RegionSelector
          v-if="regionSelectorCanvas"
          :canvas="regionSelectorCanvas"
          :initial-region="settingsStore.captureSettings.region"
          @region-selected="handleRegionSelected"
          @cancel="handleRegionCancel"
        />
      </div>
    </div>

    <!-- Main Content -->
    <div class="content">
      <!-- Controls Panel -->
      <div class="controls-panel">
        <section class="control-section">
          <h2>Screen Capture</h2>
          <div class="button-group">
            <button
              v-if="!hasCapture"
              class="btn btn-primary"
              @click="startScreenCapture"
            >
              Start Screen Capture
            </button>
            <button
              v-else
              class="btn btn-danger"
              @click="stopScreenCapture"
            >
              Stop Screen Capture
            </button>
          </div>

          <div v-if="hasCapture" class="button-group">
            <button
              class="btn btn-secondary"
              :disabled="isContinuous"
              @click="captureSingleFrame"
            >
              Capture Frame
            </button>
            <button
              class="btn btn-secondary"
              @click="toggleContinuousCapture"
            >
              {{ isContinuous ? 'Stop' : 'Start' }} Continuous
            </button>
          </div>

          <div v-if="isContinuous" class="capture-rate-control">
            <label>Capture Rate: {{ settingsStore.captureSettings.captureRate }} FPS</label>
            <div class="button-group">
              <button
                class="btn btn-small"
                :disabled="settingsStore.captureSettings.captureRate <= 1"
                @click="adjustCaptureRate(-1)"
              >
                -
              </button>
              <button
                class="btn btn-small"
                :disabled="settingsStore.captureSettings.captureRate >= 10"
                @click="adjustCaptureRate(1)"
              >
                +
              </button>
            </div>
          </div>
        </section>

        <section class="control-section">
          <h2>Manual Upload</h2>
          <div
            class="drop-zone"
            @drop="handleFileDrop"
            @dragover="handleDragOver"
            @click="triggerFileUpload"
          >
            <p>Click or drag image here</p>
            <small>Supports PNG, JPG, WebP</small>
          </div>
          <input
            ref="fileInputRef"
            type="file"
            accept="image/*"
            style="display: none"
            @change="handleFileUpload"
          >
        </section>

        <section class="control-section">
          <h2>Capture Region</h2>
          <div class="region-info">
            <p v-if="hasRegion" class="region-set">
              Region configured:
              {{ settingsStore.captureSettings.region?.width }} ×
              {{ settingsStore.captureSettings.region?.height }}
            </p>
            <p v-else class="region-not-set">
              No region set (full screen)
            </p>
          </div>
          <div class="button-group">
            <button
              class="btn btn-secondary"
              :disabled="!hasImage && !hasCapture"
              @click="startRegionSelection"
            >
              {{ hasRegion ? 'Change' : 'Set' }} Region
            </button>
            <button
              v-if="hasRegion"
              class="btn btn-small"
              @click="clearRegion"
            >
              Clear
            </button>
          </div>
        </section>

        <section class="control-section">
          <h2>Processing</h2>
          <div class="checkbox-control">
            <label>
              <input
                type="checkbox"
                :checked="processingEnabled"
                @change="togglePreprocessing"
              >
              Enable Preprocessing
            </label>
            <small>Improves OCR accuracy</small>
          </div>

          <button
            v-if="processingEnabled"
            class="btn btn-secondary advanced-toggle"
            @click="showAdvancedPreprocessing = !showAdvancedPreprocessing"
          >
            {{ showAdvancedPreprocessing ? '▼' : '▶' }} Advanced Settings
          </button>

          <div v-if="processingEnabled && showAdvancedPreprocessing" class="advanced-settings">
            <PreprocessingSettings />
          </div>
        </section>

        <section class="control-section">
          <h2>OCR Settings</h2>

          <div class="checkbox-control">
            <label>
              <input
                type="checkbox"
                :checked="settingsStore.ocrSettings.regions.enabled"
                @change="settingsStore.toggleRegionBasedOCR()"
              >
              Use Region-Based OCR
            </label>
            <small>Faster and more accurate</small>
          </div>

          <div v-if="settingsStore.ocrSettings.regions.enabled" class="select-control">
            <label>Screen Type:</label>
            <select
              :value="settingsStore.ocrSettings.regions.screenType"
              @change="(e) => settingsStore.setOCRScreenType((e.target as HTMLSelectElement).value as any)"
            >
              <option value="auto">Auto-detect</option>
              <option value="inventory">Inventory</option>
              <option value="character">Character</option>
              <option value="rewards">Rewards</option>
            </select>
            <small>Which screen shows the artifact</small>
          </div>

          <div v-if="settingsStore.ocrSettings.regions.enabled" class="checkbox-control">
            <label>
              <input
                type="checkbox"
                :checked="settingsStore.ocrSettings.regions.parallelProcessing"
                @change="settingsStore.toggleParallelProcessing()"
              >
              Parallel Processing
            </label>
            <small>Process regions simultaneously</small>
          </div>

          <div v-if="settingsStore.ocrSettings.regions.enabled" class="checkbox-control">
            <label>
              <input
                type="checkbox"
                v-model="showOCRRegions"
              >
              Show Regions on Preview
            </label>
            <small>Highlight identified OCR areas</small>
          </div>
        </section>
      </div>

      <!-- Preview Panel -->
      <div class="preview-panel">
        <div class="preview-header">
          <h2>Preview</h2>
          <div v-if="hasImage" class="preview-actions">
            <button class="btn btn-small btn-secondary" @click="clearImage">
              Clear
            </button>
            <button
              class="btn btn-primary"
              :disabled="ocrStore.isProcessing"
              @click="sendToOCR"
            >
              {{ ocrStore.isProcessing ? 'Processing...' : 'Process with OCR' }}
            </button>
          </div>
        </div>

        <div class="preview-content">
          <div v-if="!hasImage" class="preview-placeholder">
            <p>No image captured</p>
            <small>Start screen capture or upload an image</small>
          </div>
          <canvas
            v-else
            ref="previewCanvasRef"
            class="preview-canvas"
          />
        </div>

        <!-- OCR Progress -->
        <div v-if="ocrStore.isProcessing" class="ocr-progress">
          <div class="progress-bar">
            <div class="progress-fill" :style="{ width: ocrStore.progress + '%' }" />
          </div>
          <div class="progress-text">
            {{ ocrStore.progressStatus }} ({{ ocrStore.progress }}%)
          </div>
        </div>

        <div v-if="hasImage && captureStore.capturedImage" class="preview-info">
          <div class="info-item">
            <label>Dimensions:</label>
            <span>
              {{ captureStore.capturedImage.original.width }} ×
              {{ captureStore.capturedImage.original.height }}
            </span>
          </div>
          <div class="info-item">
            <label>Timestamp:</label>
            <span>{{ captureStore.capturedImage.timestamp.toLocaleTimeString() }}</span>
          </div>
          <div class="info-item">
            <label>Preprocessed:</label>
            <span>{{ captureStore.capturedImage.preprocessed ? 'Yes' : 'No' }}</span>
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

.control-section {
  background: #2a2a2a;
  padding: 1rem;
  border-radius: 8px;
}

.control-section h2 {
  margin: 0 0 1rem 0;
  font-size: 1rem;
  color: #fff;
}

.button-group {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.btn {
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 4px;
  font-size: 0.9rem;
  cursor: pointer;
  transition: all 0.2s;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-primary {
  background: #00ff00;
  color: #000;
}

.btn-primary:hover:not(:disabled) {
  background: #00dd00;
}

.btn-secondary {
  background: #444;
  color: #fff;
}

.btn-secondary:hover:not(:disabled) {
  background: #555;
}

.btn-danger {
  background: #ff4444;
  color: #fff;
}

.btn-danger:hover {
  background: #ff2222;
}

.btn-small {
  padding: 0.25rem 0.5rem;
  font-size: 0.8rem;
}

.drop-zone {
  border: 2px dashed #444;
  border-radius: 8px;
  padding: 2rem;
  text-align: center;
  cursor: pointer;
  transition: all 0.2s;
}

.drop-zone:hover {
  border-color: #00ff00;
  background: rgba(0, 255, 0, 0.05);
}

.drop-zone p {
  margin: 0 0 0.5rem 0;
  color: #fff;
}

.drop-zone small {
  color: #888;
}

.region-info {
  margin-bottom: 1rem;
}

.region-info p {
  margin: 0;
  font-size: 0.9rem;
}

.region-set {
  color: #00ff00;
  font-family: monospace;
}

.region-not-set {
  color: #888;
}

.checkbox-control label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: #fff;
  cursor: pointer;
  margin-bottom: 0.5rem;
}

.checkbox-control input[type="checkbox"] {
  width: 1rem;
  height: 1rem;
}

.checkbox-control small {
  display: block;
  color: #888;
  font-size: 0.8rem;
}

.select-control {
  margin-top: 1rem;
}

.select-control label {
  display: block;
  color: #fff;
  font-size: 0.9rem;
  margin-bottom: 0.5rem;
}

.select-control select {
  width: 100%;
  padding: 0.5rem;
  background: #2a2a2a;
  color: #fff;
  border: 1px solid #444;
  border-radius: 4px;
  font-size: 0.9rem;
  cursor: pointer;
  margin-bottom: 0.25rem;
}

.select-control select:hover {
  border-color: #666;
}

.select-control select:focus {
  outline: none;
  border-color: #00ff00;
}

.select-control small {
  display: block;
  color: #888;
  font-size: 0.8rem;
}

.capture-rate-control {
  margin-top: 1rem;
}

.capture-rate-control label {
  display: block;
  color: #fff;
  font-size: 0.9rem;
  margin-bottom: 0.5rem;
}

.advanced-toggle {
  width: 100%;
  margin-top: 0.5rem;
  text-align: left;
  font-size: 0.85rem;
}

.advanced-settings {
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px solid #333;
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

.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 2rem;
}

.modal-content {
  background: #1a1a1a;
  border-radius: 8px;
  padding: 1rem;
  max-width: 90vw;
  max-height: 90vh;
  width: 1200px;
  height: 800px;
  display: flex;
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
