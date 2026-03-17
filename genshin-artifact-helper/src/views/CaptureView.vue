<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { useCaptureStore } from '@/stores/capture'
import { useSettingsStore } from '@/stores/settings'
import { useArtifactStore } from '@/stores/artifact'
import { useOCRStore } from '@/stores/ocr'
import { getRegionTemplate, calculateAllRegionPositions, DEFAULT_PREPROCESSING } from '@/utils/ocr-region-templates'
import RegionSelector from '@/components/RegionSelector.vue'
import PreprocessingSettings from '@/components/PreprocessingSettings.vue'
import OCRResults from '@/components/OCRResults.vue'
import OCRRegionOffsetSetup from '@/components/OCRRegionOffsetSetup.vue'
import OCRRegionPreviews from '@/components/OCRRegionPreviews.vue'
import type { CaptureRegion } from '@/utils/capture'
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

// Debug menu state
const showDebugMenu = ref(false)
const debugShowOCRRegions = ref(false)
const debugShowStarDetection = ref(false)
const debugShowHistograms = ref(false)
const debugStarData = ref<StarDetectionDebugData | null>(null)
const starSettings = ref<StarDetectionSettings>({ ...defaultStarDetectionSettings })
const starAlgorithmMode = ref<'legacy' | 'projection'>('projection')
const starCenterFinderMode = ref<'legacy' | 'region'>('legacy')
const starDetector = computed<StarDetectorFn>(() => {
  if (starAlgorithmMode.value === 'projection') return projectionStarDetector
  const finder = starCenterFinderMode.value === 'region' ? regionStarCenterFinder : legacyStarCenterFinder
  return makeLegacyDetector(finder)
})

// Debug preprocessing overrides state
const debugPreprocessingEnabled = ref(false)
const debugPreprocessingOptions = ref<PreprocessingOptions>({ ...DEFAULT_PREPROCESSING })

let preprocessDebounceTimer: ReturnType<typeof setTimeout> | null = null

watch(
  [debugPreprocessingEnabled, debugPreprocessingOptions],
  () => {
    if (!hasImage.value) return
    if (preprocessDebounceTimer) clearTimeout(preprocessDebounceTimer)
    preprocessDebounceTimer = setTimeout(() => { sendToOCR() }, 400)
  },
  { deep: true },
)

// OCR Region Offset Setup state
const showRegionOffsetSetup = ref(false)
const regionEditorScreenType = ref<ScreenType>('inventory')
const regionEditorLayout = ref<ArtifactRegionLayout | null>(null)

function initRegionEditorLayout() {
  const template = JSON.parse(JSON.stringify(getRegionTemplate(regionEditorScreenType.value)))
  if (ocrStore.detectedAnchorPx && previewCanvasRef.value) {
    const w = previewCanvasRef.value.width
    const h = previewCanvasRef.value.height
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
  if (showRegionOffsetSetup.value && regionEditorLayout.value) {
    return regionEditorLayout.value
  }

  const configuredType = settingsStore.ocrSettings.regions.screenType

  if (configuredType === 'auto') {
    // Don't draw anything until processImage has detected the screen type
    if (debugShowOCRRegions.value) {
      return ocrStore.activeLayout ?? getRegionTemplate('inventory')
    }
    return ocrStore.activeLayout
  }

  // Manual mode: always use the selected template so the dropdown
  // change is reflected immediately (never let stale ocrStore.activeLayout win)
  if (settingsStore.ocrSettings.regions.enabled || debugShowOCRRegions.value) {
    try {
      return getRegionTemplate(configuredType as ScreenType)
    } catch {
      return null
    }
  }

  return null
})

function redrawPreview(): void {
  const image = captureStore.capturedImage
  const layout = activeLayout.value
  if (!image || !previewCanvasRef.value) return

  const ctx = previewCanvasRef.value.getContext('2d')
  if (!ctx) return

  const displayCanvas = image.preprocessed ?? image.original
  previewCanvasRef.value.width = displayCanvas.width
  previewCanvasRef.value.height = displayCanvas.height
  ctx.drawImage(displayCanvas, 0, 0)

  if ((showOCRRegions.value || debugShowOCRRegions.value || showRegionOffsetSetup.value) && layout) {
    drawOCRRegions(ctx, layout, previewCanvasRef.value.width, previewCanvasRef.value.height)
  }

  if (debugShowStarDetection.value && debugStarData.value) {
    drawStarDetectionData(ctx, debugStarData.value)
  }

  if (debugShowHistograms.value && debugStarData.value) {
    drawHistograms(ctx, debugStarData.value, previewCanvasRef.value.width, previewCanvasRef.value.height)
  }
}

watch(
  [() => captureStore.capturedImage, activeLayout, showOCRRegions, debugShowOCRRegions, debugShowStarDetection, debugShowHistograms, () => ocrStore.detectedRarityBounds, starSettings, starCenterFinderMode, starAlgorithmMode],
  async ([, , , , newDebugStar]) => {
    await nextTick()
    if (newDebugStar) {
      runStarDetectionDebug()
    }
    redrawPreview()
  },
  { deep: true },
)

watch(
  () => captureStore.capturedImage,
  async (newImage) => {
    if (newImage) {
      await nextTick()
      ocrStore.detectArtifactDescription(newImage.original)
    }
  },
)

function drawOCRRegions(
  ctx: CanvasRenderingContext2D,
  layout: any,
  width: number,
  height: number,
): void {
  ctx.lineWidth = 2
  ctx.font = 'bold 12px sans-serif'
  ctx.textBaseline = 'bottom'

  const drawRegionPixels = (x: number, y: number, w: number, h: number, label: string, color: string) => {
    ctx.strokeStyle = color
    ctx.fillStyle = color
    ctx.strokeRect(x, y, w, h)

    const textWidth = ctx.measureText(label).width
    ctx.globalAlpha = 0.7
    ctx.fillRect(x, y - 18, textWidth + 10, 18)
    ctx.globalAlpha = 1.0
    ctx.fillStyle = '#000'
    ctx.fillText(label, x + 5, y - 2)
  }

  const drawAnchorMarker = (x: number, y: number) => {
    const cs = 10
    ctx.strokeStyle = '#00ccff'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(x - cs, y); ctx.lineTo(x + cs, y)
    ctx.moveTo(x, y - cs); ctx.lineTo(x, y + cs)
    ctx.stroke()
    ctx.fillStyle = '#00ccff'
    ctx.beginPath()
    ctx.arc(x, y, 3, 0, Math.PI * 2)
    ctx.fill()
  }

  const anchor = !showRegionOffsetSetup.value ? ocrStore.detectedAnchorPx : null
  const detectedPositions = anchor ? calculateAllRegionPositions(layout, width, height, anchor) : null

  if (detectedPositions) {
    // Draw all OCR regions in orange, positions recomputed from current layout + detected anchor
    for (const [name, region] of Object.entries(layout.regions)) {
      const pos = detectedPositions.get((region as any).name)
      if (pos) {
        const label = name.replace(/([A-Z])/g, ' $1').toLowerCase()
        drawRegionPixels(pos.x, pos.y, pos.width, pos.height, label, '#ff9900')
      }
    }
    drawAnchorMarker(anchor!.x, anchor!.y)
  } else {
    // No detection yet — draw all regions from template anchorPoint in green
    const anchor = layout.anchorPoint
    if (!anchor) return  // can't draw without an anchor
    const anchorPx = { x: anchor.x * width, y: anchor.y * height }
    const templatePositions = calculateAllRegionPositions(layout, width, height, anchorPx)
    for (const [name, region] of Object.entries(layout.regions)) {
      const pos = templatePositions.get((region as any).name)
      if (pos) {
        const label = name.replace(/([A-Z])/g, ' $1').toLowerCase()
        drawRegionPixels(pos.x, pos.y, pos.width, pos.height, label, '#00ff00')
      }
    }
    drawAnchorMarker(anchorPx.x, anchorPx.y)
  }
}

function drawStarDetectionData(ctx: CanvasRenderingContext2D, data: StarDetectionDebugData): void {
  const { blocks, detectedCenter, starCount } = data

  // ── Legacy grid blocks ─────────────────────────────────────────────────────
  for (const block of blocks) {
    if (block.isConfirmed) {
      // Confirmed star — both tests passed
      ctx.fillStyle = 'rgba(149,255,50,0.35)'
      ctx.strokeStyle = 'rgba(94,255,50,0.9)'
    } else if (block.isPass1Match) {
      // Passed Only First Test
      ctx.fillStyle = 'rgba(255, 80, 80, 0.25)'
      ctx.strokeStyle = 'rgba(255, 80, 80, 0.7)'
    } else {
      // Some star pixels but below for passing first test
      ctx.fillStyle = 'rgba(158,158,158,0.18)'
      ctx.strokeStyle = 'rgba(55,55,55,0.58)'
    }
    ctx.lineWidth = 1
    ctx.fillRect(block.x, block.y, block.size, block.size)
    ctx.strokeRect(block.x, block.y, block.size, block.size)
  }

  // ── Projection overlays ────────────────────────────────────────────────────
  if (data.projColumnRegions !== null) {
    const canvasH = ctx.canvas.height

    // Column regions (step 3 output) — amber boxes along bottom edge
    ctx.lineWidth = 1
    for (const col of data.projColumnRegions) {
      const w = col.end - col.start + 1
      const boxH = Math.round(canvasH * 0.06)
      ctx.fillStyle = 'rgba(255, 180, 0, 0.30)'
      ctx.strokeStyle = 'rgba(255, 180, 0, 0.70)'
      ctx.fillRect(col.start, canvasH - boxH, w, boxH)
      ctx.strokeRect(col.start, canvasH - boxH, w, boxH)
    }

    // Row region bands (step 5 output) — horizontal light overlay
    if (data.projRowRegions) {
      for (const row of data.projRowRegions) {
        ctx.fillStyle = 'rgba(0, 220, 255, 0.08)'
        ctx.fillRect(0, row.start, ctx.canvas.width, row.end - row.start + 1)
      }
    }

    // Peak Y line
    if (data.projPeakY !== null) {
      ctx.strokeStyle = 'rgba(0, 220, 255, 0.80)'
      ctx.lineWidth = 1.5
      ctx.setLineDash([4, 4])
      ctx.beginPath()
      ctx.moveTo(0, data.projPeakY)
      ctx.lineTo(ctx.canvas.width, data.projPeakY)
      ctx.stroke()
      ctx.setLineDash([])
    }

    // Final star regions (step 9) — bright gold boxes along bottom, labeled
    if (data.projStarRegions) {
      ctx.font = 'bold 11px sans-serif'
      ctx.textBaseline = 'bottom'
      for (let i = 0; i < data.projStarRegions.length; i++) {
        const col = data.projStarRegions[i]!
        const w = col.end - col.start + 1
        const boxH = Math.round(canvasH * 0.04)
        ctx.fillStyle = 'rgba(255, 215, 0, 0.45)'
        ctx.strokeStyle = 'rgba(255, 215, 0, 1.0)'
        ctx.lineWidth = 1.5
        ctx.fillRect(col.start, canvasH - boxH, w, boxH)
        ctx.strokeRect(col.start, canvasH - boxH, w, boxH)
        ctx.fillStyle = 'rgba(255, 215, 0, 1.0)'
        ctx.fillText(`${i + 1}`, col.start + 1, canvasH - boxH - 1)
      }
    }
  }

  // ── Detected center crosshair ──────────────────────────────────────────────
  if (detectedCenter) {
    const cs = 12
    ctx.strokeStyle = '#ff2222'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(detectedCenter.x - cs, detectedCenter.y)
    ctx.lineTo(detectedCenter.x + cs, detectedCenter.y)
    ctx.moveTo(detectedCenter.x, detectedCenter.y - cs)
    ctx.lineTo(detectedCenter.x, detectedCenter.y + cs)
    ctx.stroke()

    ctx.fillStyle = '#ff2222'
    ctx.beginPath()
    ctx.arc(detectedCenter.x, detectedCenter.y, 4, 0, Math.PI * 2)
    ctx.fill()

    if (starCount !== null) {
      ctx.font = 'bold 14px sans-serif'
      ctx.fillStyle = '#ff2222'
      ctx.textBaseline = 'middle'
      ctx.fillText(`${starCount}★`, detectedCenter.x + 14, detectedCenter.y)
    }
  }
}

function drawHistograms(
  ctx: CanvasRenderingContext2D,
  data: StarDetectionDebugData,
  width: number,
  height: number,
): void {
  const { columnHistogram, rowHistogram } = data
  const maxCol = Math.max(1, ...columnHistogram)
  const maxRow = Math.max(1, ...rowHistogram)
  const colBarMaxH = Math.round(height * 0.20)
  const rowBarMaxW = Math.round(width * 0.20)

  ctx.fillStyle = 'rgba(255, 204, 50, 0.55)'

  for (let x = 0; x < columnHistogram.length; x++) {
    const barH = Math.round(((columnHistogram[x] ?? 0) / maxCol) * colBarMaxH)
    if (barH > 0) ctx.fillRect(x, height - barH, 1, barH)
  }

  for (let y = 0; y < rowHistogram.length; y++) {
    const barW = Math.round(((rowHistogram[y] ?? 0) / maxRow) * rowBarMaxW)
    if (barW > 0) ctx.fillRect(width - barW, y, barW, 1)
  }

  ctx.strokeStyle = 'rgba(255, 204, 50, 0.35)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(0, height - colBarMaxH)
  ctx.lineTo(width, height - colBarMaxH)
  ctx.moveTo(width - rowBarMaxW, 0)
  ctx.lineTo(width - rowBarMaxW, height)
  ctx.stroke()
}

function runStarDetectionDebug(): void {
  const canvas = captureStore.capturedImage?.original
  if (canvas) {
    debugStarData.value = debugDetectStars(canvas, canvas.height, starSettings.value, starDetector.value)
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
  redrawPreview()
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

function detectArtifactDescription(): void {
  if (!captureStore.capturedImage) return
  ocrStore.detectArtifactDescription(captureStore.capturedImage.original)
}

async function sendToOCR(): Promise<void> {
  if (!captureStore.capturedImage) {
    return
  }

  try {
    // Use preprocessed image if available, otherwise original
    const imageToProcess = captureStore.capturedImage.preprocessed ?? captureStore.capturedImage.original

    const overrides = debugPreprocessingEnabled.value ? debugPreprocessingOptions.value : undefined

    await ocrStore.processImage(imageToProcess, overrides)
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

        <section class="control-section debug-section">
          <h2 class="collapsible-header" @click="showDebugMenu = !showDebugMenu">
            {{ showDebugMenu ? '▼' : '▶' }} Debug
          </h2>
          <div v-if="showDebugMenu" class="debug-controls">
            <button
              class="btn btn-secondary debug-btn"
              :class="{ 'debug-btn-active': debugShowOCRRegions }"
              :disabled="!hasImage"
              @click="debugShowOCRRegions = !debugShowOCRRegions"
            >
              Draw OCR Regions
            </button>
            <button
              class="btn btn-secondary debug-btn"
              :class="{ 'debug-btn-active': debugShowStarDetection }"
              :disabled="!hasImage"
              @click="toggleStarDetectionDebug"
            >
              Draw Star Detection Data
            </button>
            <button
              class="btn btn-secondary debug-btn"
              :class="{ 'debug-btn-active': debugShowHistograms }"
              :disabled="!debugShowStarDetection || !debugStarData"
              @click="debugShowHistograms = !debugShowHistograms"
            >
              Draw Color Histograms
            </button>
            <button
              class="btn btn-secondary debug-btn"
              :class="{ 'debug-btn-active': showRegionOffsetSetup }"
              @click="toggleRegionOffsetSetup"
            >
              OCR Region Offset Setup
            </button>
            <OCRRegionOffsetSetup
              v-if="showRegionOffsetSetup && regionEditorLayout"
              v-model="regionEditorLayout"
              :screen-type="regionEditorScreenType"
              @update:screen-type="onEditorScreenTypeChange"
              @reset="initRegionEditorLayout"
            />
            <div v-if="debugShowStarDetection && debugStarData" class="debug-info">
              <span v-if="debugStarData.detectedCenter">
                Center: ({{ debugStarData.detectedCenter.x }}, {{ debugStarData.detectedCenter.y }})
                &mdash; {{ debugStarData.starCount }}★
              </span>
              <span v-else class="debug-no-stars">No stars detected</span>
              <small>{{ debugStarData.blocks.length }} active blocks &bull; grid {{ debugStarData.gridSize }}px</small>
            </div>
            <div v-if="debugShowStarDetection" class="star-settings-panel">
              <div class="star-settings-header">
                <span>Star Detection Settings</span>
                <button class="btn btn-small" @click="starSettings = { ...defaultStarDetectionSettings }">Reset Defaults</button>
              </div>
              <!-- Algorithm selector -->
              <div class="star-setting-row">
                <label>Algorithm <span>{{ starAlgorithmMode }}</span></label>
                <div class="star-finder-toggle">
                  <button
                    class="btn btn-small"
                    :class="{ 'star-finder-active': starAlgorithmMode === 'legacy' }"
                    @click="starAlgorithmMode = 'legacy'"
                  >Legacy</button>
                  <button
                    class="btn btn-small"
                    :class="{ 'star-finder-active': starAlgorithmMode === 'projection' }"
                    @click="starAlgorithmMode = 'projection'"
                  >Projection</button>
                </div>
              </div>
              <!-- Common settings -->
              <div class="star-color-preview-row">
                <span>Star Color:</span>
                <div
                  class="star-color-swatch"
                  :style="{ background: `rgb(${starSettings.starColorR}, ${starSettings.starColorG}, ${starSettings.starColorB})` }"
                />
                <code>rgb({{ starSettings.starColorR }}, {{ starSettings.starColorG }}, {{ starSettings.starColorB }})</code>
              </div>
              <div class="star-setting-row">
                <label>R <span>{{ starSettings.starColorR }}</span></label>
                <input type="range" min="0" max="255" step="1" v-model.number="starSettings.starColorR" />
              </div>
              <div class="star-setting-row">
                <label>G <span>{{ starSettings.starColorG }}</span></label>
                <input type="range" min="0" max="255" step="1" v-model.number="starSettings.starColorG" />
              </div>
              <div class="star-setting-row">
                <label>B <span>{{ starSettings.starColorB }}</span></label>
                <input type="range" min="0" max="255" step="1" v-model.number="starSettings.starColorB" />
              </div>
              <div class="star-setting-row">
                <label>Color Tolerance <span>{{ starSettings.colorTolerance }}</span></label>
                <input type="range" min="0" max="100" step="1" v-model.number="starSettings.colorTolerance" />
              </div>
              <div class="star-setting-row">
                <label>Star Size % <span>{{ starSettings.starSizePercent.toFixed(4) }}</span></label>
                <input type="range" min="0.01" max="0.08" step="0.001" v-model.number="starSettings.starSizePercent" />
              </div>
              <div class="star-setting-row">
                <label>Star Distance % <span>{{ starSettings.starDistancePercent.toFixed(4) }}</span></label>
                <input type="range" min="0.005" max="0.1" step="0.0005" v-model.number="starSettings.starDistancePercent" />
              </div>
              <!-- Legacy-specific settings -->
              <template v-if="starAlgorithmMode === 'legacy'">
                <div class="star-setting-row">
                  <label>Center Finder <span>{{ starCenterFinderMode }}</span></label>
                  <div class="star-finder-toggle">
                    <button
                      class="btn btn-small"
                      :class="{ 'star-finder-active': starCenterFinderMode === 'legacy' }"
                      @click="starCenterFinderMode = 'legacy'"
                    >Legacy</button>
                    <button
                      class="btn btn-small"
                      :class="{ 'star-finder-active': starCenterFinderMode === 'region' }"
                      @click="starCenterFinderMode = 'region'"
                    >Region</button>
                  </div>
                </div>
                <div class="star-setting-row">
                  <label>Grid Size % <span>{{ starSettings.gridSizePercent.toFixed(4) }}</span></label>
                  <input type="range" min="0.002" max="0.05" step="0.0005" v-model.number="starSettings.gridSizePercent" />
                </div>
                <div class="star-setting-row">
                  <label>Pass 1 Sample %<span>{{ starSettings.pass1SamplePercent.toFixed(2) }}</span></label>
                  <input type="range" min="0.005" max="1" step="0.005" v-model.number="starSettings.pass1SamplePercent" />
                </div>
                <div class="star-setting-row">
                  <label>Pass 1 Threshold <span>{{ starSettings.pass1MatchThreshold }}</span></label>
                  <input type="range" min="0.005" max="1" step="0.005" v-model.number="starSettings.pass1MatchThreshold" />
                </div>
                <div class="star-setting-row">
                  <label>Pass 2 Sample %<span>{{ starSettings.pass2SamplePercent.toFixed(2) }}</span></label>
                  <input type="range" min="0.005" max="1" step="0.005" v-model.number="starSettings.pass2SamplePercent" />
                </div>
                <div class="star-setting-row">
                  <label>Pass 2 Threshold <span>{{ starSettings.pass2MatchThreshold }}</span></label>
                  <input type="range" min="0.005" max="1" step="0.005" v-model.number="starSettings.pass2MatchThreshold" />
                </div>
                <div class="star-setting-row">
                  <label>Pass 3 Sample %<span>{{ starSettings.pass3SamplePercent.toFixed(2) }}</span></label>
                  <input type="range" min="0.005" max="1" step="0.005" v-model.number="starSettings.pass3SamplePercent" />
                </div>
                <div class="star-setting-row">
                  <label>Pass 3 Threshold <span>{{ starSettings.pass3MatchThreshold }}</span></label>
                  <input type="range" min="0.005" max="1" step="0.005" v-model.number="starSettings.pass3MatchThreshold" />
                </div>
                <div class="star-setting-row">
                  <label>Confirm Threshold <span>{{ starSettings.confirmThreshold.toFixed(2) }}</span></label>
                  <input type="range" min="0.005" max="1" step="0.005" v-model.number="starSettings.confirmThreshold" />
                </div>
              </template>
              <!-- Projection-specific settings -->
              <template v-else>
                <div class="star-setting-row">
                  <label>Col Min % <span>{{ starSettings.projColMinPercent.toFixed(4) }}</span></label>
                  <input type="range" min="0.005" max="0.1" step="0.001" v-model.number="starSettings.projColMinPercent" />
                </div>
                <div class="star-setting-row">
                  <label>Col Max % <span>{{ starSettings.projColMaxPercent.toFixed(4) }}</span></label>
                  <input type="range" min="0.005" max="0.1" step="0.001" v-model.number="starSettings.projColMaxPercent" />
                </div>
                <div class="star-setting-row">
                  <label>Col Min Pixels <span>{{ starSettings.projColMinPixels }}</span></label>
                  <input type="range" min="1" max="20" step="1" v-model.number="starSettings.projColMinPixels" />
                </div>
                <div class="star-setting-row">
                  <label>Row Min % <span>{{ starSettings.projRowMinPercent.toFixed(4) }}</span></label>
                  <input type="range" min="0.005" max="0.1" step="0.001" v-model.number="starSettings.projRowMinPercent" />
                </div>
                <div class="star-setting-row">
                  <label>Row Max % <span>{{ starSettings.projRowMaxPercent.toFixed(4) }}</span></label>
                  <input type="range" min="0.005" max="0.1" step="0.001" v-model.number="starSettings.projRowMaxPercent" />
                </div>
                <div class="star-setting-row">
                  <label>Spacing Tolerance <span>{{ starSettings.projSpacingTolerance.toFixed(2) }}</span></label>
                  <input type="range" min="0.01" max="0.5" step="0.01" v-model.number="starSettings.projSpacingTolerance" />
                </div>
                <div class="star-setting-row">
                  <label>Y Window (px) <span>{{ starSettings.projYWindowPx }}</span></label>
                  <input type="range" min="0" max="10" step="1" v-model.number="starSettings.projYWindowPx" />
                </div>
              </template>
            </div>
            <div class="preproc-override-panel">
              <div class="preproc-override-header">
                <span>OCR Region Preprocessing Overrides</span>
                <div class="preproc-override-header-controls">
                  <label>
                    <input type="checkbox" v-model="debugPreprocessingEnabled" />
                    Enable
                  </label>
                  <button
                    class="btn btn-small"
                    @click="debugPreprocessingOptions = { ...DEFAULT_PREPROCESSING }"
                  >Reset</button>
                </div>
              </div>
              <div v-if="debugPreprocessingEnabled" class="preproc-override-controls">
                <div class="preproc-bool-row">
                  <label><input type="checkbox" v-model="debugPreprocessingOptions.grayscale" /> grayscale</label>
                </div>
                <div class="preproc-bool-row">
                  <label><input type="checkbox" v-model="debugPreprocessingOptions.enhanceContrast" /> enhanceContrast</label>
                </div>
                <div class="preproc-slider-row">
                  <label>contrastFactor <span>{{ debugPreprocessingOptions.contrastFactor.toFixed(1) }}</span></label>
                  <input type="range" min="1.0" max="3.0" step="0.1" v-model.number="debugPreprocessingOptions.contrastFactor" />
                </div>
                <div class="preproc-bool-row">
                  <label><input type="checkbox" v-model="debugPreprocessingOptions.denoise" /> denoise</label>
                </div>
                <div class="preproc-bool-row">
                  <label><input type="checkbox" v-model="debugPreprocessingOptions.sharpen" /> sharpen</label>
                </div>
                <div class="preproc-bool-row">
                  <label><input type="checkbox" v-model="debugPreprocessingOptions.adaptive" /> adaptive</label>
                </div>
                <div class="preproc-slider-row">
                  <label>adaptiveBlockSize <span>{{ debugPreprocessingOptions.adaptiveBlockSize }}</span></label>
                  <input type="range" min="7" max="21" step="2" v-model.number="debugPreprocessingOptions.adaptiveBlockSize" />
                </div>
                <div class="preproc-bool-row">
                  <label><input type="checkbox" v-model="debugPreprocessingOptions.upscale" /> upscale</label>
                </div>
                <div class="preproc-slider-row">
                  <label>scaleFactor <span>{{ debugPreprocessingOptions.scaleFactor }}</span></label>
                  <input type="range" min="1" max="4" step="1" v-model.number="debugPreprocessingOptions.scaleFactor" />
                </div>
                <div class="preproc-bool-row">
                  <label><input type="checkbox" v-model="debugPreprocessingOptions.genshinOptimized" /> genshinOptimized</label>
                </div>
                <div class="preproc-slider-row">
                  <label>backgroundThreshold <span>{{ debugPreprocessingOptions.backgroundThreshold }}</span></label>
                  <input type="range" min="0" max="255" step="5" v-model.number="debugPreprocessingOptions.backgroundThreshold" />
                </div>
                <div class="preproc-bool-row">
                  <label><input type="checkbox" v-model="debugPreprocessingOptions.invert" /> invert</label>
                </div>
              </div>
            </div>
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
              class="btn btn-secondary"
              :disabled="ocrStore.isProcessing"
              @click="detectArtifactDescription"
            >
              Detect Artifact Description
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

.debug-section {
  border: 1px solid #444;
}

.collapsible-header {
  cursor: pointer;
  user-select: none;
}

.collapsible-header:hover {
  color: #aaa;
}

.debug-controls {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-top: 0.5rem;
}

.debug-btn {
  text-align: left;
  font-size: 0.85rem;
}

.debug-btn-active {
  background: #554400;
  color: #ffcc32;
  border: 1px solid #ffcc32;
}

.debug-btn-active:hover:not(:disabled) {
  background: #665500;
}

.debug-info {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0.5rem;
  background: #1a1a1a;
  border-radius: 4px;
  font-size: 0.8rem;
  font-family: monospace;
  color: #ffcc32;
}

.debug-no-stars {
  color: #ff6666;
}

.debug-info small {
  color: #888;
  font-family: monospace;
}

.star-settings-panel {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  padding: 0.6rem;
  background: #1a1a1a;
  border-radius: 4px;
  border: 1px solid #554400;
}

.star-settings-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.8rem;
  color: #ffcc32;
  font-weight: bold;
  margin-bottom: 0.25rem;
}

.star-color-preview-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.75rem;
  color: #aaa;
  font-family: monospace;
  margin-bottom: 0.25rem;
}

.star-color-swatch {
  width: 1.2rem;
  height: 1.2rem;
  border-radius: 3px;
  border: 1px solid #666;
  flex-shrink: 0;
}

.star-setting-row {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.star-setting-row label {
  display: flex;
  justify-content: space-between;
  font-size: 0.75rem;
  color: #aaa;
  font-family: monospace;
}

.star-setting-row label span {
  color: #ffcc32;
}

.star-setting-row input[type='range'] {
  width: 100%;
  accent-color: #ffcc32;
  cursor: pointer;
}

.star-finder-toggle {
  display: flex;
  gap: 0.25rem;
}

.star-finder-active {
  background: #554400;
  color: #ffcc32;
  border: 1px solid #ffcc32;
}

.preproc-override-panel {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  padding: 0.6rem;
  background: #1a1a1a;
  border-radius: 4px;
  border: 1px solid #2200aa;
}

.preproc-override-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.8rem;
  color: #aaaaff;
  font-weight: bold;
  font-family: monospace;
  margin-bottom: 0.25rem;
}

.preproc-override-header-controls {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.preproc-override-header-controls label {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.75rem;
  color: #aaa;
  cursor: pointer;
}

.preproc-override-controls {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.preproc-bool-row label {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.75rem;
  color: #aaa;
  font-family: monospace;
  cursor: pointer;
}

.preproc-bool-row input[type='checkbox'] {
  accent-color: #aaaaff;
}

.preproc-slider-row {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  padding-left: 0.5rem;
}

.preproc-slider-row label {
  display: flex;
  justify-content: space-between;
  font-size: 0.75rem;
  color: #aaa;
  font-family: monospace;
}

.preproc-slider-row label span {
  color: #aaaaff;
}

.preproc-slider-row input[type='range'] {
  width: 100%;
  accent-color: #aaaaff;
  cursor: pointer;
}
</style>
