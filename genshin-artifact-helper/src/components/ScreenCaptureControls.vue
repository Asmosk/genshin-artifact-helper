<script setup lang="ts">
import { useSettingsStore } from '@/stores/settings'

defineProps<{
  hasCapture: boolean
  isContinuous: boolean
}>()

const emit = defineEmits<{
  start: []
  stop: []
  captureFrame: []
  toggleContinuous: []
  adjustRate: [delta: number]
}>()

const settingsStore = useSettingsStore()
</script>

<template>
  <section class="control-section">
    <h2>Screen Capture</h2>
    <div class="button-group">
      <button v-if="!hasCapture" class="btn btn-primary" @click="emit('start')">
        Start Screen Capture
      </button>
      <button v-else class="btn btn-danger" @click="emit('stop')">Stop Screen Capture</button>
    </div>

    <div v-if="hasCapture" class="button-group">
      <button
        class="btn btn-secondary"
        :disabled="isContinuous"
        @click="emit('captureFrame')"
      >
        Capture Frame
      </button>
      <button class="btn btn-secondary" @click="emit('toggleContinuous')">
        {{ isContinuous ? 'Stop' : 'Start' }} Continuous
      </button>
    </div>

    <div v-if="isContinuous" class="mt-4">
      <label class="block text-white text-sm mb-2">Capture Rate: {{ settingsStore.captureSettings.captureRate }} FPS</label>
      <div class="button-group">
        <button
          class="btn btn-small"
          :disabled="settingsStore.captureSettings.captureRate <= 1"
          @click="emit('adjustRate', -1)"
        >
          -
        </button>
        <button
          class="btn btn-small"
          :disabled="settingsStore.captureSettings.captureRate >= 10"
          @click="emit('adjustRate', 1)"
        >
          +
        </button>
      </div>
    </div>
  </section>
</template>

