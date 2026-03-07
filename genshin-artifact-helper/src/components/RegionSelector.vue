<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { useSettingsStore } from '@/stores/settings'
import { useCaptureStore } from '@/stores/capture'
import type { CaptureRegion } from '@/utils/capture'

const props = defineProps<{
  canvas: HTMLCanvasElement
  initialRegion?: CaptureRegion | null
}>()

const emit = defineEmits<{
  regionSelected: [region: CaptureRegion]
  cancel: []
}>()

const settingsStore = useSettingsStore()
const captureStore = useCaptureStore()

const canvasRef = ref<HTMLCanvasElement | null>(null)
const isDragging = ref(false)
const startX = ref(0)
const startY = ref(0)
const currentX = ref(0)
const currentY = ref(0)

const region = computed<CaptureRegion | null>(() => {
  if (!isDragging.value && !startX.value && !startY.value) {
    return props.initialRegion ?? null
  }

  const x = Math.min(startX.value, currentX.value)
  const y = Math.min(startY.value, currentY.value)
  const width = Math.abs(currentX.value - startX.value)
  const height = Math.abs(currentY.value - startY.value)

  return { x, y, width, height }
})

const hasRegion = computed(() => {
  return region.value && region.value.width > 0 && region.value.height > 0
})

// Canvas rendering
function drawCanvas(): void {
  if (!canvasRef.value) return

  const ctx = canvasRef.value.getContext('2d')
  if (!ctx) return

  // Clear canvas
  ctx.clearRect(0, 0, canvasRef.value.width, canvasRef.value.height)

  // Draw source image
  ctx.drawImage(props.canvas, 0, 0)

  if (region.value && region.value.width > 0 && region.value.height > 0) {
    const r = region.value

    // Darken everything outside the region
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)'
    ctx.fillRect(0, 0, canvasRef.value.width, r.y)
    ctx.fillRect(0, r.y, r.x, r.height)
    ctx.fillRect(r.x + r.width, r.y, canvasRef.value.width - (r.x + r.width), r.height)
    ctx.fillRect(0, r.y + r.height, canvasRef.value.width, canvasRef.value.height - (r.y + r.height))

    // Draw selection border
    ctx.strokeStyle = '#00ff00'
    ctx.lineWidth = 2
    ctx.strokeRect(r.x, r.y, r.width, r.height)

    // Draw corner handles
    const handleSize = 8
    ctx.fillStyle = '#00ff00'
    ctx.fillRect(r.x - handleSize / 2, r.y - handleSize / 2, handleSize, handleSize)
    ctx.fillRect(r.x + r.width - handleSize / 2, r.y - handleSize / 2, handleSize, handleSize)
    ctx.fillRect(r.x - handleSize / 2, r.y + r.height - handleSize / 2, handleSize, handleSize)
    ctx.fillRect(r.x + r.width - handleSize / 2, r.y + r.height - handleSize / 2, handleSize, handleSize)

    // Draw dimensions text
    ctx.fillStyle = '#00ff00'
    ctx.font = '14px monospace'
    ctx.fillText(`${r.width} × ${r.height}`, r.x + 4, r.y + 18)
  }
}

// Mouse event handlers
function handleMouseDown(event: MouseEvent): void {
  if (!canvasRef.value) return

  const rect = canvasRef.value.getBoundingClientRect()
  const scaleX = canvasRef.value.width / rect.width
  const scaleY = canvasRef.value.height / rect.height

  startX.value = (event.clientX - rect.left) * scaleX
  startY.value = (event.clientY - rect.top) * scaleY
  currentX.value = startX.value
  currentY.value = startY.value
  isDragging.value = true
}

function handleMouseMove(event: MouseEvent): void {
  if (!isDragging.value || !canvasRef.value) return

  const rect = canvasRef.value.getBoundingClientRect()
  const scaleX = canvasRef.value.width / rect.width
  const scaleY = canvasRef.value.height / rect.height

  currentX.value = Math.max(0, Math.min((event.clientX - rect.left) * scaleX, canvasRef.value.width))
  currentY.value = Math.max(0, Math.min((event.clientY - rect.top) * scaleY, canvasRef.value.height))

  drawCanvas()
}

function handleMouseUp(): void {
  if (!isDragging.value) return
  isDragging.value = false
  drawCanvas()
}

function handleMouseLeave(): void {
  if (isDragging.value) {
    isDragging.value = false
    drawCanvas()
  }
}

// Actions
function confirmSelection(): void {
  if (region.value && hasRegion.value) {
    emit('regionSelected', region.value)
  }
}

function cancelSelection(): void {
  emit('cancel')
}

function clearSelection(): void {
  startX.value = 0
  startY.value = 0
  currentX.value = 0
  currentY.value = 0
  isDragging.value = false
  drawCanvas()
}

// Lifecycle
onMounted(() => {
  if (canvasRef.value && props.canvas) {
    canvasRef.value.width = props.canvas.width
    canvasRef.value.height = props.canvas.height
    drawCanvas()
  }
})

onUnmounted(() => {
  // Cleanup
})
</script>

<template>
  <div class="region-selector">
    <div class="canvas-container">
      <canvas
        ref="canvasRef"
        class="selection-canvas"
        @mousedown="handleMouseDown"
        @mousemove="handleMouseMove"
        @mouseup="handleMouseUp"
        @mouseleave="handleMouseLeave"
      />
    </div>

    <div class="controls">
      <div class="info">
        <p v-if="!hasRegion" class="instruction">
          Click and drag to select the artifact details region
        </p>
        <p v-else class="region-info">
          Region: {{ region!.x }}, {{ region!.y }} - {{ region!.width }} × {{ region!.height }}
        </p>
      </div>

      <div class="buttons">
        <button
          v-if="hasRegion"
          class="btn btn-secondary"
          @click="clearSelection"
        >
          Clear
        </button>
        <button
          class="btn btn-secondary"
          @click="cancelSelection"
        >
          Cancel
        </button>
        <button
          class="btn btn-primary"
          :disabled="!hasRegion"
          @click="confirmSelection"
        >
          Confirm Selection
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.region-selector {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  width: 100%;
  height: 100%;
}

.canvas-container {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: auto;
  background: #1a1a1a;
  border-radius: 8px;
}

.selection-canvas {
  cursor: crosshair;
  max-width: 100%;
  max-height: 100%;
  display: block;
}

.controls {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1rem;
  background: #2a2a2a;
  border-radius: 8px;
}

.info {
  text-align: center;
}

.instruction {
  color: #888;
  font-size: 0.9rem;
  margin: 0;
}

.region-info {
  color: #00ff00;
  font-family: monospace;
  font-size: 0.9rem;
  margin: 0;
}

.buttons {
  display: flex;
  gap: 0.5rem;
  justify-content: center;
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

.btn-secondary:hover {
  background: #555;
}
</style>
