<script setup lang="ts">
import { computed, ref } from 'vue'
import { useSettingsStore } from '@/stores/settings'
import { COMMON_BUILD_PROFILES } from '@/types/artifact'
import type { SubstatType } from '@/types/artifact'
import BuildProfileSelector from '@/components/BuildProfileSelector.vue'

const settingsStore = useSettingsStore()

const ALL_SUBSTATS: SubstatType[] = [
  'CRIT Rate',
  'CRIT DMG',
  'ATK%',
  'ATK',
  'HP%',
  'HP',
  'DEF%',
  'DEF',
  'Elemental Mastery',
  'Energy Recharge',
]

const MARKERS = [0, 0.25, 0.5, 0.75, 1] as const

function getStatColor(type: SubstatType): string {
  if (type.includes('CRIT')) return '#f472b6'
  if (type.includes('ATK')) return '#fb923c'
  if (type.includes('HP')) return '#4ade80'
  if (type.includes('DEF')) return '#fbbf24'
  if (type.includes('Energy')) return '#60a5fa'
  if (type.includes('Elemental Mastery')) return '#a78bfa'
  return '#9ca3af'
}

const currentWeights = computed(() => settingsStore.currentBuildProfile.weights)

function getWeight(type: SubstatType): number {
  return currentWeights.value[type] ?? 0
}

function setWeight(type: SubstatType, value: number) {
  const snapped = Math.round(value * 20) / 20 // snap to 0.05 steps
  const clamped = Math.max(0, Math.min(1, snapped))
  const profile = settingsStore.currentBuildProfile
  settingsStore.updateBuildProfile(settingsStore.currentProfileIndex, {
    ...profile,
    weights: { ...profile.weights, [type]: clamped },
  })
}

// Custom slider drag handling
const dragging = ref<SubstatType | null>(null)

function valueFromPointer(el: HTMLElement, clientX: number): number {
  const rect = el.getBoundingClientRect()
  return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
}

function onTrackPointerDown(stat: SubstatType, e: PointerEvent) {
  const el = e.currentTarget as HTMLElement
  el.setPointerCapture(e.pointerId)
  dragging.value = stat
  setWeight(stat, valueFromPointer(el, e.clientX))
}

function onTrackPointerMove(stat: SubstatType, e: PointerEvent) {
  if (dragging.value !== stat) return
  setWeight(stat, valueFromPointer(e.currentTarget as HTMLElement, e.clientX))
}

function onTrackPointerUp() {
  dragging.value = null
}

function resetToDefault() {
  const defaultProfile = COMMON_BUILD_PROFILES[settingsStore.currentProfileIndex]
  if (!defaultProfile) return
  settingsStore.updateBuildProfile(settingsStore.currentProfileIndex, {
    ...settingsStore.currentBuildProfile,
    weights: { ...defaultProfile.weights },
  })
}

const canReset = computed(() => COMMON_BUILD_PROFILES[settingsStore.currentProfileIndex] !== undefined)
</script>

<template>
  <div class="flex flex-col gap-3">
    <!-- Build profile selector -->
    <div class="flex flex-col gap-1">
      <span class="text-xs text-gray-mid">Build Profile</span>
      <BuildProfileSelector />
    </div>

    <!-- Divider -->
    <div class="border-t border-dark-700" />

    <!-- Substat weights -->
    <div class="flex flex-col gap-1.5">

      <!-- Column header -->
      <div class="flex items-center gap-2">
        <span class="w-28 shrink-0 text-xs text-gray-mid">Substat</span>
        <!-- Header labels aligned with slider positions -->
        <div class="flex-1 relative h-4">
          <span
            v-for="m in MARKERS"
            :key="m"
            class="absolute text-[10px] text-dark-500 leading-none"
            :style="{
              left: m * 100 + '%',
              transform: m === 0 ? 'none' : m === 1 ? 'translateX(-100%)' : 'translateX(-50%)',
              top: '50%',
              marginTop: '-0.4em',
            }"
          >{{ Math.round(m * 100) }}</span>
        </div>
      </div>

      <!-- Substat rows -->
      <div
        v-for="stat in ALL_SUBSTATS"
        :key="stat"
        class="flex items-center gap-2"
        :class="{ 'opacity-40': getWeight(stat) === 0 }"
      >
        <span class="w-28 text-xs font-semibold shrink-0" :style="{ color: getStatColor(stat) }">
          {{ stat }}
        </span>

        <!-- Custom slider track -->
        <div
          class="flex-1 relative h-5 flex items-center cursor-pointer touch-none"
          @pointerdown="onTrackPointerDown(stat, $event)"
          @pointermove="onTrackPointerMove(stat, $event)"
          @pointerup="onTrackPointerUp"
          @pointercancel="onTrackPointerUp"
        >
          <!-- Track background -->
          <div class="absolute inset-x-0 h-px bg-dark-600" />

          <!-- Filled portion -->
          <div
            class="absolute left-0 h-px bg-neon-green"
            :style="{ width: getWeight(stat) * 100 + '%' }"
          />

          <!-- Marker dots at 25%, 50%, 75% -->
          <div
            v-for="m in [0.25, 0.5, 0.75]"
            :key="m"
            class="absolute w-1 h-1 rounded-full bg-dark-500 -translate-x-1/2"
            :style="{ left: m * 100 + '%' }"
          />

          <!-- Thumb -->
          <div
            class="absolute w-2 h-2 rounded-full bg-neon-green -translate-x-1/2 shadow-sm pointer-events-none"
            :style="{ left: getWeight(stat) * 100 + '%' }"
          />
        </div>
      </div>
    </div>

    <!-- Reset button -->
    <button v-if="canReset" class="btn btn-secondary text-xs py-1" @click="resetToDefault">
      Reset to Default
    </button>
  </div>
</template>
