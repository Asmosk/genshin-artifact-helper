<script setup lang="ts">
import { useSettingsStore } from '@/stores/settings'

defineProps<{
  hasRegion: boolean
  hasImage: boolean
  hasCapture: boolean
}>()

const emit = defineEmits<{
  selectRegion: []
  clearRegion: []
}>()

const settingsStore = useSettingsStore()
</script>

<template>
  <section class="control-section">
    <h2>Capture Region</h2>
    <div class="region-info">
      <p v-if="hasRegion" class="region-set">
        Region configured: {{ settingsStore.captureSettings.region?.width }} x
        {{ settingsStore.captureSettings.region?.height }}
      </p>
      <p v-else class="region-not-set">No region set (full screen)</p>
    </div>
    <div class="button-group">
      <button
        class="btn btn-secondary"
        :disabled="!hasImage && !hasCapture"
        @click="emit('selectRegion')"
      >
        {{ hasRegion ? 'Change' : 'Set' }} Region
      </button>
      <button v-if="hasRegion" class="btn btn-small" @click="emit('clearRegion')">Clear</button>
    </div>
  </section>
</template>

<style scoped>
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
</style>
