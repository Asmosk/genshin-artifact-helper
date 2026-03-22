<script setup lang="ts">
import { computed } from 'vue'
import type { ArtifactRegionLayout, ArtifactScreenType } from '@/types/ocr-regions'

const props = defineProps<{
  modelValue: ArtifactRegionLayout
  screenType: ArtifactScreenType
}>()

const emit = defineEmits<{
  'update:modelValue': [layout: ArtifactRegionLayout]
  'update:screenType': [type: ArtifactScreenType]
  'reset': []
}>()

const SCREEN_TYPES: ArtifactScreenType[] = ['inventory', 'character', 'rewards']

const anchor = computed(() => props.modelValue.anchorPoint ?? { x: 0, y: 0 })

const REGION_KEYS = [
  'pieceName',
  'slotName',
  'level',
  'mainStatName',
  'mainStatValue',
  'substat1',
  'substat2',
  'substat3',
  'substat4',
  'substat4SecondLine',
] as const

type RegionKey = typeof REGION_KEYS[number]

const ANCHOR_RANGE = { min: 0, max: 1, step: 0.001 }
const OFFSET_RANGE = { min: -0.6, max: 0.6, step: 0.001 }
const SIZE_RANGE = { min: 0.005, max: 0.6, step: 0.001 }

const FIELD_RANGES: Record<'x' | 'y' | 'width' | 'height', { min: number; max: number; step: number }> = {
  x: OFFSET_RANGE,
  y: OFFSET_RANGE,
  width: SIZE_RANGE,
  height: SIZE_RANGE,
}

function updateAnchor(axis: 'x' | 'y', value: number) {
  emit('update:modelValue', {
    ...props.modelValue,
    anchorPoint: { ...anchor.value, [axis]: value },
  })
}

function updateRegionField(key: RegionKey, field: 'x' | 'y' | 'width' | 'height', value: number) {
  const region = props.modelValue.regions[key]
  emit('update:modelValue', {
    ...props.modelValue,
    regions: {
      ...props.modelValue.regions,
      [key]: { ...region, [field]: value },
    },
  })
}

function onSliderWheel(
  e: WheelEvent,
  value: number,
  range: { min: number; max: number; step: number },
  update: (v: number) => void,
) {
  const precision = e.shiftKey ? range.step / 10 : range.step
  const delta = e.deltaY < 0 ? precision : -precision
  const raw = value + delta
  const decimals = (precision.toString().split('.')[1] ?? '').length
  const clamped = Math.min(range.max, Math.max(range.min, parseFloat(raw.toFixed(decimals))))
  update(clamped)
}

function fmt(n: number): string {
  return n.toFixed(5)
}

async function copyTypeScript() {
  const layout = props.modelValue
  const ap = anchor.value
  const lines: string[] = [
    `// Layout: ${layout.id} (${layout.referenceResolution?.width ?? '?'}x${layout.referenceResolution?.height ?? '?'})`,
    `anchorPoint: { x: ${fmt(ap.x)}, y: ${fmt(ap.y)} },`,
    '',
  ]

  const maxKeyLen = Math.max(...REGION_KEYS.map((k) => k.length))
  for (const key of REGION_KEYS) {
    const r = layout.regions[key]
    const pad = ' '.repeat(maxKeyLen - key.length)
    lines.push(
      `${key}:${pad}  x: ${fmt(r.x)}, y: ${fmt(r.y)}, w: ${fmt(r.width)}, h: ${fmt(r.height)}`,
    )
  }

  await navigator.clipboard.writeText(lines.join('\n'))
}
</script>

<template>
  <div class="flex flex-col gap-1 py-2 text-xs">
    <!-- Screen Type Selector -->
    <div class="flex items-center gap-2 mb-1">
      <span class="text-gray-400 shrink-0 w-20">Screen Type</span>
      <div class="flex gap-1">
        <button
          v-for="type in SCREEN_TYPES"
          :key="type"
          class="btn btn-small"
          :class="type === screenType ? 'bg-dark-600 text-white border border-dark-500' : ''"
          @click="emit('update:screenType', type)"
        >
          {{ type }}
        </button>
      </div>
    </div>

    <!-- Anchor Point -->
    <details open class="border-t border-dark-800">
      <summary class="section-summary">Anchor Point</summary>
      <div class="flex flex-col gap-1 p-1 pb-2">
        <div v-for="axis in (['x', 'y'] as const)" :key="axis" class="flex items-center gap-1.5">
          <span class="text-gray-mid w-10 shrink-0 text-[11px]">{{ axis }}</span>
          <input
            type="range"
            class="flex-1 h-[3px] cursor-pointer accent-[#559955]"
            :min="ANCHOR_RANGE.min"
            :max="ANCHOR_RANGE.max"
            :step="ANCHOR_RANGE.step"
            :value="anchor[axis]"
            @input="updateAnchor(axis, parseFloat(($event.target as HTMLInputElement).value))"
            @wheel.prevent="onSliderWheel($event, anchor[axis], ANCHOR_RANGE, (v) => updateAnchor(axis, v))"
          />
          <span class="font-mono text-[11px] text-gray-300 w-14 text-right shrink-0">{{ fmt(anchor[axis]) }}</span>
        </div>
      </div>
    </details>

    <!-- One collapsible per region -->
    <details v-for="key in REGION_KEYS" :key="key" class="border-t border-dark-800">
      <summary class="section-summary">{{ key }}</summary>
      <div class="flex flex-col gap-1 p-1 pb-2">
        <div
          v-for="field in (['x', 'y', 'width', 'height'] as const)"
          :key="field"
          class="flex items-center gap-1.5"
        >
          <span class="text-gray-mid w-10 shrink-0 text-[11px]">{{ field }}</span>
          <input
            type="range"
            class="flex-1 h-[3px] cursor-pointer accent-[#559955]"
            :min="FIELD_RANGES[field].min"
            :max="FIELD_RANGES[field].max"
            :step="FIELD_RANGES[field].step"
            :value="modelValue.regions[key][field]"
            @input="updateRegionField(key, field, parseFloat(($event.target as HTMLInputElement).value))"
            @wheel.prevent="onSliderWheel($event, modelValue.regions[key][field], FIELD_RANGES[field], (v) => updateRegionField(key, field, v))"
          />
          <span class="font-mono text-[11px] text-gray-300 w-14 text-right shrink-0">{{ fmt(modelValue.regions[key][field]) }}</span>
        </div>
      </div>
    </details>

    <!-- Actions -->
    <div class="flex gap-1.5 justify-end pt-1.5 border-t border-dark-800">
      <button class="btn btn-small" @click="emit('reset')">Reset to Defaults</button>
      <button
        class="btn btn-small bg-[#1a3a1a] border border-[#2a6a2a] text-[#88cc88] hover:bg-[#2a4a2a]"
        @click="copyTypeScript"
      >Copy Values</button>
    </div>
  </div>
</template>

<style scoped>
.section-summary {
  color: #aaa;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 5px 2px;
  cursor: pointer;
  user-select: none;
  list-style: none;
  display: flex;
  align-items: center;
  gap: 6px;
}

.section-summary::before {
  content: '▶';
  font-size: 8px;
  color: #666;
  transition: transform 0.15s;
  display: inline-block;
  width: 10px;
}

details[open] > .section-summary::before {
  transform: rotate(90deg);
}

.section-summary::-webkit-details-marker {
  display: none;
}
</style>
