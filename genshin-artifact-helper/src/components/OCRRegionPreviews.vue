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
  <div class="mt-2 pt-2 border-t border-slate-700">
    <div class="flex items-center gap-2 mb-1.5">
      <span class="text-xs font-semibold text-slate-400 uppercase tracking-wide">OCR Region Previews</span>
      <span class="text-[0.7rem] text-slate-600">{{ regions.length }} regions</span>
    </div>
    <div class="flex gap-2 overflow-x-auto pb-1.5 [scrollbar-width:thin] [scrollbar-color:#334155_transparent]">
      <div v-for="region in regions" :key="region.regionName" class="shrink-0 bg-slate-950 border border-slate-800 rounded-md p-1.5 min-w-[110px] max-w-[210px] flex flex-col gap-1">
        <div class="flex items-center justify-center bg-black rounded-sm min-h-9 overflow-hidden">
          <canvas
            :ref="(el) => setCanvasRef(region.regionName, el as HTMLCanvasElement | null)"
            class="block max-w-full [image-rendering:pixelated]"
          />
          <span v-if="!region.preprocessedCanvas" class="text-[0.65rem] text-slate-600">No preview</span>
        </div>
        <div class="flex justify-between items-center gap-1">
          <span class="text-[0.65rem] text-slate-400 font-semibold truncate">{{ formatRegionName(region.regionName) }}</span>
          <span
            class="text-[0.65rem] font-bold shrink-0"
            :style="{ color: confidenceColor(region.confidence) }"
          >{{ Math.round(region.confidence * 100) }}%</span>
        </div>
        <div class="text-[0.7rem] text-slate-300 truncate max-w-full" :title="region.text">
          {{ region.text || '—' }}
        </div>
      </div>
    </div>
  </div>
</template>
