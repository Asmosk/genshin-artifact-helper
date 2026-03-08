<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import type { RegionOCRResult } from '@/types/ocr-regions'

const props = defineProps<{
  regions: RegionOCRResult[]
}>()

// Map of regionName → canvas element ref
const canvasRefs = ref<Map<string, HTMLCanvasElement>>(new Map())

function setCanvasRef(name: string, el: HTMLCanvasElement | null) {
  if (el) {
    canvasRefs.value.set(name, el)
  } else {
    canvasRefs.value.delete(name)
  }
}

function drawRegion(region: RegionOCRResult) {
  const canvas = canvasRefs.value.get(region.regionName)
  const src = region.preprocessedCanvas
  if (!canvas || !src) return

  const ctx = canvas.getContext('2d')
  if (!ctx) return

  // Scale to fit the card canvas, preserving aspect ratio
  const maxW = 200
  const maxH = 90
  const scale = Math.min(maxW / src.width, maxH / src.height, 1)
  canvas.width = Math.round(src.width * scale)
  canvas.height = Math.round(src.height * scale)

  ctx.imageSmoothingEnabled = false
  ctx.drawImage(src, 0, 0, canvas.width, canvas.height)
}

function drawAll() {
  nextTick(() => {
    for (const region of props.regions) {
      drawRegion(region)
    }
  })
}

watch(() => props.regions, drawAll, { immediate: true })

function formatRegionName(name: string): string {
  // camelCase → Title Case with spaces
  return name
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (c) => c.toUpperCase())
    .replace(/(\d+)$/, ' $1')
    .trim()
}

function confidenceColor(confidence: number): string {
  if (confidence >= 0.8) return '#22c55e'
  if (confidence >= 0.5) return '#eab308'
  return '#ef4444'
}
</script>

<template>
  <div class="region-previews">
    <div class="region-previews-header">
      <span class="region-previews-title">OCR Region Previews</span>
      <span class="region-previews-count">{{ regions.length }} regions</span>
    </div>
    <div class="region-cards-scroll">
      <div v-for="region in regions" :key="region.regionName" class="region-card">
        <div class="region-canvas-wrapper">
          <canvas
            :ref="(el) => setCanvasRef(region.regionName, el as HTMLCanvasElement | null)"
            class="region-canvas"
          />
          <span v-if="!region.preprocessedCanvas" class="region-canvas-empty">No preview</span>
        </div>
        <div class="region-card-info">
          <span class="region-name">{{ formatRegionName(region.regionName) }}</span>
          <span
            class="region-confidence"
            :style="{ color: confidenceColor(region.confidence) }"
          >{{ Math.round(region.confidence * 100) }}%</span>
        </div>
        <div class="region-text" :title="region.text">
          {{ region.text || '—' }}
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.region-previews {
  margin-top: 8px;
  border-top: 1px solid #334155;
  padding-top: 8px;
}

.region-previews-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.region-previews-title {
  font-size: 0.75rem;
  font-weight: 600;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.region-previews-count {
  font-size: 0.7rem;
  color: #475569;
}

.region-cards-scroll {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 6px;
  scrollbar-width: thin;
  scrollbar-color: #334155 transparent;
}

.region-card {
  flex: 0 0 auto;
  background: #0f172a;
  border: 1px solid #1e293b;
  border-radius: 6px;
  padding: 6px;
  min-width: 110px;
  max-width: 210px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.region-canvas-wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
  background: #000;
  border-radius: 3px;
  min-height: 36px;
  overflow: hidden;
}

.region-canvas {
  display: block;
  max-width: 100%;
  image-rendering: pixelated;
}

.region-canvas-empty {
  font-size: 0.65rem;
  color: #475569;
}

.region-card-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 4px;
}

.region-name {
  font-size: 0.65rem;
  color: #94a3b8;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.region-confidence {
  font-size: 0.65rem;
  font-weight: 700;
  flex-shrink: 0;
}

.region-text {
  font-size: 0.7rem;
  color: #cbd5e1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}
</style>
