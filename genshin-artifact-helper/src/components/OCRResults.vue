<script setup lang="ts">
import { computed } from 'vue'
import { useOCRStore } from '@/stores/ocr'
import type { SubstatType } from '@/types/artifact'

const ocrStore = useOCRStore()

// Computed
const hasResult = computed(() => ocrStore.hasResult && ocrStore.result !== null)
const artifact = computed(() => ocrStore.result?.artifact)
const confidence = computed(() => ocrStore.result?.confidence || 0)
const errors = computed(() => ocrStore.result?.errors || [])
const rawText = computed(() => ocrStore.result?.rawText || '')

const totalRolls = computed(() => {
  if (!artifact.value?.substats) return 0
  return artifact.value.substats.reduce((sum, s) => sum + (s.rollCount ?? 1), 0)
})

const maxRolls = computed(() => {
  const a = artifact.value
  if (!a?.rarity || a.level == null) return undefined
  const maxStart = a.rarity === 5 ? 4 : a.rarity === 4 ? 3 : a.rarity === 3 ? 2 : a.rarity === 2 ? 1 : 0
  return maxStart + Math.floor(a.level / 4)
})

const confidenceColor = computed(() => {
  const conf = confidence.value
  if (conf >= 0.8) return '#4ade80' // green
  if (conf >= 0.6) return '#fbbf24' // yellow
  return '#f87171' // red
})

const confidenceText = computed(() => {
  const conf = confidence.value
  if (conf >= 0.8) return 'High'
  if (conf >= 0.6) return 'Medium'
  return 'Low'
})

// Format stat display
function formatStatValue(type: string, value: number): string {
  // Flat stats (no %)
  if (['HP', 'ATK', 'DEF', 'Elemental Mastery'].includes(type)) {
    return value.toFixed(0)
  }
  // Percentage stats
  return `${value.toFixed(1)}%`
}

// Get stat color for visual coding
function getStatColor(type: SubstatType | string): string {
  if (type.includes('CRIT')) return '#f472b6' // pink
  if (type.includes('ATK')) return '#fb923c' // orange
  if (type.includes('HP')) return '#4ade80' // green
  if (type.includes('DEF')) return '#fbbf24' // yellow
  if (type.includes('Energy')) return '#60a5fa' // blue
  if (type.includes('Elemental Mastery')) return '#a78bfa' // purple
  return '#9ca3af' // gray
}

// Actions
function handleAccept() {
  ocrStore.acceptResult()
}

function handleReject() {
  ocrStore.rejectResult()
}

// Toggle raw text visibility
const showRawText = computed({
  get: () => false,
  set: () => {},
})
</script>

<template>
  <div class="bg-slate-800 rounded-lg p-6 text-slate-200">
    <div v-if="!hasResult" class="text-center p-8 text-slate-400">
      <p>No OCR results yet. Capture and process an image to see artifact data.</p>
    </div>

    <div v-else class="flex flex-col gap-6">
      <!-- Header with confidence -->
      <div class="flex items-center gap-4 pb-4 border-b border-slate-700">
        <h3 class="m-0 text-xl flex-1">OCR Results</h3>
        <div
          class="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-semibold text-slate-900"
          :style="{ backgroundColor: confidenceColor }"
        >
          <span>{{ confidenceText }} Confidence</span>
          <span class="text-base">{{ (confidence * 100).toFixed(0) }}%</span>
        </div>
        <div class="text-sm text-slate-400">
          <span>Processed in {{ (ocrStore.processingTime / 1000).toFixed(2) }}s</span>
        </div>
      </div>

      <!-- Errors and warnings -->
      <div v-if="errors.length > 0" class="bg-red-950 border border-red-600 rounded-md p-4">
        <h4 class="mt-0 mb-2 text-base text-red-300">⚠️ Warnings</h4>
        <ul class="m-0 pl-6 text-red-200">
          <li v-for="(error, index) in errors" :key="index" class="mb-1">{{ error }}</li>
        </ul>
      </div>

      <!-- Parsed artifact data -->
      <div>
        <h4 class="mt-0 mb-4 text-base text-slate-300">Parsed Artifact</h4>

        <div class="grid gap-3">
          <!-- Basic info -->
          <div class="flex justify-between py-2 border-b border-slate-700">
            <span class="font-semibold text-slate-400">Set:</span>
            <span class="text-slate-200">{{ artifact?.set || 'Unknown' }}</span>
          </div>
          <div class="flex justify-between py-2 border-b border-slate-700">
            <span class="font-semibold text-slate-400">Slot:</span>
            <span class="text-slate-200">{{ artifact?.slot || 'Unknown' }}</span>
          </div>
          <div class="flex justify-between py-2 border-b border-slate-700">
            <span class="font-semibold text-slate-400">Rarity:</span>
            <span class="text-slate-200">{{ artifact?.rarity ? '★'.repeat(artifact.rarity) : 'Unknown' }}</span>
          </div>
          <div class="flex justify-between py-2 border-b border-slate-700">
            <span class="font-semibold text-slate-400">Level:</span>
            <span class="text-slate-200">+{{ artifact?.level ?? '?' }}</span>
          </div>

          <!-- Main stat -->
          <div v-if="artifact?.mainStat" class="p-3 bg-slate-950 rounded-md border-l-[3px] border-blue-500">
            <span class="block font-semibold text-slate-400 mb-2">Main Stat:</span>
            <div class="flex justify-between items-center">
              <span class="font-semibold" :style="{ color: getStatColor(artifact.mainStat.type) }">
                {{ artifact.mainStat.type }}
              </span>
              <span class="text-lg font-bold">
                {{ formatStatValue(artifact.mainStat.type, artifact.mainStat.value) }}
              </span>
            </div>
          </div>

          <!-- Substats -->
          <div v-if="artifact?.substats && artifact.substats.length > 0" class="p-3 bg-slate-950 rounded-md border-l-[3px] border-violet-500">
            <span class="block font-semibold text-slate-400 mb-2">Substats:</span>
            <div class="grid gap-2">
              <div
                v-for="(substat, index) in artifact.substats"
                :key="index"
                class="flex items-center gap-2 py-1.5 px-2 bg-slate-800 rounded"
                :class="{ 'opacity-50': substat.unactivated }"
              >
                <span
                  v-if="substat.rollCount !== undefined"
                  class="text-xs font-bold text-amber-400 bg-amber-400/15 rounded-full w-[1.4rem] h-[1.4rem] flex items-center justify-center shrink-0"
                >{{ substat.rollCount }}</span>
                <span class="font-semibold" :style="{ color: getStatColor(substat.type) }">
                  {{ substat.type }}
                </span>
                <span v-if="substat.unactivated" class="text-[0.7rem] text-slate-500 italic">(unactivated)</span>
                <span class="text-lg font-bold ml-auto">
                  +{{ formatStatValue(substat.type, substat.value) }}
                </span>
              </div>
            </div>
            <div v-if="artifact?.substats && artifact.substats.length > 0" class="mt-2 text-sm text-slate-400 text-right">
              Total rolls: {{ totalRolls }}{{ maxRolls !== undefined ? ` / ${maxRolls}` : '' }}
            </div>
          </div>
        </div>
      </div>

      <!-- Raw OCR text (collapsible) -->
      <details class="border border-slate-700 rounded-md p-3">
        <summary class="cursor-pointer font-semibold text-slate-400 select-none hover:text-slate-300">Show Raw OCR Text</summary>
        <pre class="mt-3 p-3 bg-slate-950 rounded text-sm text-slate-400 overflow-x-auto whitespace-pre-wrap break-words font-['Courier_New',monospace]">{{ rawText }}</pre>
      </details>

      <!-- Actions -->
      <div class="flex gap-4 pt-4 border-t border-slate-700">
        <button
          class="flex-1 py-3 px-6 border-0 rounded-md text-base font-semibold cursor-pointer transition-all duration-200 bg-blue-500 text-white hover:bg-blue-600"
          @click="handleAccept"
        >
          ✓ Accept & Score
        </button>
        <button
          class="flex-1 py-3 px-6 border-0 rounded-md text-base font-semibold cursor-pointer transition-all duration-200 bg-slate-600 text-slate-200 hover:bg-slate-500"
          @click="handleReject"
        >
          ✗ Reject
        </button>
      </div>
    </div>
  </div>
</template>
