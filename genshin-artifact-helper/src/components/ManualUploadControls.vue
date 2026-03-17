<script setup lang="ts">
import { ref } from 'vue'
import { useCaptureStore } from '@/stores/capture'

const emit = defineEmits<{
  'file-drop': [event: DragEvent]
  'drag-over': [event: DragEvent]
}>()

const captureStore = useCaptureStore()
const fileInputRef = ref<HTMLInputElement | null>(null)

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

  target.value = ''
}
</script>

<template>
  <section class="control-section">
    <h2>Manual Upload</h2>
    <div
      class="drop-zone"
      @drop="emit('file-drop', $event)"
      @dragover="emit('drag-over', $event)"
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
    />
  </section>
</template>

<style scoped>
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
</style>
