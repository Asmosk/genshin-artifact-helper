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
      class="border-2 border-dashed border-dark-600 rounded-lg p-8 text-center cursor-pointer transition-all duration-200 hover:border-neon-green hover:bg-neon-green/5"
      @drop="emit('file-drop', $event)"
      @dragover="emit('drag-over', $event)"
      @click="triggerFileUpload"
    >
      <p class="m-0 mb-2 text-white">Click or drag image here</p>
      <small class="text-gray-mid">Supports PNG, JPG, WebP</small>
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

