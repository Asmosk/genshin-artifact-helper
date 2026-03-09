<script setup lang="ts">
import { computed } from 'vue'
import type { ArtifactRegionLayout, ScreenType } from '@/types/ocr-regions'

const props = defineProps<{
  modelValue: ArtifactRegionLayout
  screenType: ScreenType
}>()

const emit = defineEmits<{
  'update:modelValue': [layout: ArtifactRegionLayout]
  'update:screenType': [type: ScreenType]
  'reset': []
}>()

const SCREEN_TYPES: ScreenType[] = ['inventory', 'character', 'rewards']

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
  <div class="region-offset-setup">
    <!-- Screen Type Selector -->
    <div class="setup-row">
      <span class="setup-label">Screen Type</span>
      <div class="screen-type-buttons">
        <button
          v-for="type in SCREEN_TYPES"
          :key="type"
          class="btn btn-small"
          :class="{ 'btn-active': screenType === type }"
          @click="emit('update:screenType', type)"
        >
          {{ type }}
        </button>
      </div>
    </div>

    <!-- Anchor Point -->
    <details open class="region-section">
      <summary class="section-summary">Anchor Point</summary>
      <div class="fields">
        <div v-for="axis in (['x', 'y'] as const)" :key="axis" class="slider-row">
          <span class="field-label">{{ axis }}</span>
          <input
            type="range"
            class="slider"
            :min="ANCHOR_RANGE.min"
            :max="ANCHOR_RANGE.max"
            :step="ANCHOR_RANGE.step"
            :value="anchor[axis]"
            @input="updateAnchor(axis, parseFloat(($event.target as HTMLInputElement).value))"
            @wheel.prevent="onSliderWheel($event, anchor[axis], ANCHOR_RANGE, (v) => updateAnchor(axis, v))"
          />
          <span class="field-value">{{ fmt(anchor[axis]) }}</span>
        </div>
      </div>
    </details>

    <!-- One collapsible per region -->
    <details v-for="key in REGION_KEYS" :key="key" class="region-section">
      <summary class="section-summary">{{ key }}</summary>
      <div class="fields">
        <div
          v-for="field in (['x', 'y', 'width', 'height'] as const)"
          :key="field"
          class="slider-row"
        >
          <span class="field-label">{{ field }}</span>
          <input
            type="range"
            class="slider"
            :min="FIELD_RANGES[field].min"
            :max="FIELD_RANGES[field].max"
            :step="FIELD_RANGES[field].step"
            :value="modelValue.regions[key][field]"
            @input="updateRegionField(key, field, parseFloat(($event.target as HTMLInputElement).value))"
            @wheel.prevent="onSliderWheel($event, modelValue.regions[key][field], FIELD_RANGES[field], (v) => updateRegionField(key, field, v))"
          />
          <span class="field-value">{{ fmt(modelValue.regions[key][field]) }}</span>
        </div>
      </div>
    </details>

    <!-- Actions -->
    <div class="setup-actions">
      <button class="btn btn-small" @click="emit('reset')">Reset to Defaults</button>
      <button class="btn btn-small btn-accent" @click="copyTypeScript">Copy Values</button>
    </div>
  </div>
</template>

<style scoped>
.region-offset-setup {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 0;
  font-size: 12px;
}

.setup-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.setup-label {
  color: #aaa;
  flex-shrink: 0;
  width: 80px;
}

.screen-type-buttons {
  display: flex;
  gap: 4px;
}

.btn-active {
  background: #444;
  color: #fff;
  border-color: #666;
}

/* Collapsible region sections */
.region-section {
  border-top: 1px solid #2a2a2a;
}

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

/* Slider rows */
.fields {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 4px 4px 8px 4px;
}

.slider-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.field-label {
  color: #888;
  width: 40px;
  flex-shrink: 0;
  font-size: 11px;
}

.slider {
  flex: 1;
  height: 3px;
  accent-color: #559955;
  cursor: pointer;
}

.field-value {
  font-family: monospace;
  font-size: 11px;
  color: #ccc;
  width: 58px;
  text-align: right;
  flex-shrink: 0;
}

.setup-actions {
  display: flex;
  gap: 6px;
  justify-content: flex-end;
  padding-top: 6px;
  border-top: 1px solid #2a2a2a;
}

.btn-accent {
  background: #1a3a1a;
  border-color: #2a6a2a;
  color: #88cc88;
}

.btn-accent:hover {
  background: #2a4a2a;
}
</style>
