<script setup lang="ts">
import { computed } from 'vue'
import { useSettingsStore } from '@/stores/settings'
import { useCaptureStore } from '@/stores/capture'

const settingsStore = useSettingsStore()
const captureStore = useCaptureStore()

const options = computed(() => settingsStore.captureSettings.preprocessingOptions)

function updateOption(key: string, value: any) {
  settingsStore.updatePreprocessingOptions({ [key]: value })
  // Reprocess current image if available
  if (captureStore.hasImage) {
    captureStore.reprocessImage(false)
  }
}

function resetOptions() {
  settingsStore.resetPreprocessingOptions()
  // Reprocess current image if available
  if (captureStore.hasImage) {
    captureStore.reprocessImage(false)
  }
}
</script>

<template>
  <div class="preprocessing-settings">
    <div class="settings-header">
      <h3>Advanced Preprocessing</h3>
      <button class="btn btn-small btn-secondary" @click="resetOptions">
        Reset to Defaults
      </button>
    </div>

    <div class="settings-section">
      <div class="setting-item">
        <label class="setting-label">
          <input
            type="checkbox"
            :checked="options.genshinOptimized"
            @change="(e) => updateOption('genshinOptimized', (e.target as HTMLInputElement).checked)"
          >
          <span>Genshin UI Optimization</span>
        </label>
        <small class="setting-description">
          Isolates white text from dark/transparent backgrounds
        </small>
      </div>

      <div v-if="options.genshinOptimized" class="setting-item indented">
        <label class="setting-label">Background Threshold</label>
        <div class="slider-control">
          <input
            type="range"
            min="0"
            max="255"
            :value="options.backgroundThreshold"
            @input="(e) => updateOption('backgroundThreshold', Number((e.target as HTMLInputElement).value))"
          >
          <span class="slider-value">{{ options.backgroundThreshold }}</span>
        </div>
        <small class="setting-description">
          Lower values remove more background (0-255)
        </small>
      </div>
    </div>

    <div class="settings-section">
      <div class="setting-item">
        <label class="setting-label">
          <input
            type="checkbox"
            :checked="options.enhanceContrast"
            @change="(e) => updateOption('enhanceContrast', (e.target as HTMLInputElement).checked)"
          >
          <span>Enhance Contrast</span>
        </label>
        <small class="setting-description">
          Increases difference between light and dark areas
        </small>
      </div>

      <div v-if="options.enhanceContrast" class="setting-item indented">
        <label class="setting-label">Contrast Factor</label>
        <div class="slider-control">
          <input
            type="range"
            min="1.0"
            max="3.0"
            step="0.1"
            :value="options.contrastFactor"
            @input="(e) => updateOption('contrastFactor', Number((e.target as HTMLInputElement).value))"
          >
          <span class="slider-value">{{ options.contrastFactor.toFixed(1) }}</span>
        </div>
        <small class="setting-description">
          Higher values = more contrast (1.0-3.0)
        </small>
      </div>
    </div>

    <div class="settings-section">
      <div class="setting-item">
        <label class="setting-label">
          <input
            type="checkbox"
            :checked="options.adaptive"
            @change="(e) => updateOption('adaptive', (e.target as HTMLInputElement).checked)"
          >
          <span>Adaptive Thresholding</span>
        </label>
        <small class="setting-description">
          Better for varying backgrounds (recommended for Genshin)
        </small>
      </div>

      <div v-if="options.adaptive" class="setting-item indented">
        <label class="setting-label">Block Size</label>
        <div class="slider-control">
          <input
            type="range"
            min="7"
            max="21"
            step="2"
            :value="options.adaptiveBlockSize"
            @input="(e) => updateOption('adaptiveBlockSize', Number((e.target as HTMLInputElement).value))"
          >
          <span class="slider-value">{{ options.adaptiveBlockSize }}</span>
        </div>
        <small class="setting-description">
          Larger values = smoother thresholding (must be odd)
        </small>
      </div>
    </div>

    <div class="settings-section">
      <div class="setting-item">
        <label class="setting-label">
          <input
            type="checkbox"
            :checked="options.denoise"
            @change="(e) => updateOption('denoise', (e.target as HTMLInputElement).checked)"
          >
          <span>Denoise (Median Filter)</span>
        </label>
        <small class="setting-description">
          Reduces noise but may blur fine details
        </small>
      </div>

      <div class="setting-item">
        <label class="setting-label">
          <input
            type="checkbox"
            :checked="options.sharpen"
            @change="(e) => updateOption('sharpen', (e.target as HTMLInputElement).checked)"
          >
          <span>Sharpen</span>
        </label>
        <small class="setting-description">
          Enhances text edges for better OCR
        </small>
      </div>

      <div class="setting-item">
        <label class="setting-label">
          <input
            type="checkbox"
            :checked="options.invert"
            @change="(e) => updateOption('invert', (e.target as HTMLInputElement).checked)"
          >
          <span>Invert Colors</span>
        </label>
        <small class="setting-description">
          Flip black/white after thresholding (helps when text appears white-on-black)
        </small>
      </div>
    </div>

    <div class="settings-section">
      <div class="setting-item">
        <label class="setting-label">
          <input
            type="checkbox"
            :checked="options.upscale"
            @change="(e) => updateOption('upscale', (e.target as HTMLInputElement).checked)"
          >
          <span>Upscale Image</span>
        </label>
        <small class="setting-description">
          Increases image size for better OCR (slower)
        </small>
      </div>

      <div v-if="options.upscale" class="setting-item indented">
        <label class="setting-label">Scale Factor</label>
        <div class="slider-control">
          <input
            type="range"
            min="1"
            max="3"
            step="1"
            :value="options.scaleFactor"
            @input="(e) => updateOption('scaleFactor', Number((e.target as HTMLInputElement).value))"
          >
          <span class="slider-value">{{ options.scaleFactor }}x</span>
        </div>
        <small class="setting-description">
          Higher values = larger image & slower processing
        </small>
      </div>
    </div>

    <div class="warning-message">
      <strong>Note:</strong> If text disappears or becomes unreadable in the preview,
      try disabling "Genshin UI Optimization" or adjusting the background threshold.
    </div>
  </div>
</template>

<style scoped>
.preprocessing-settings {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.settings-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
}

.settings-header h3 {
  margin: 0;
  font-size: 0.95rem;
  color: #fff;
}

.settings-section {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 0.75rem;
  background: #1a1a1a;
  border-radius: 6px;
}

.setting-item {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.setting-item.indented {
  margin-left: 1.5rem;
  padding-left: 0.75rem;
  border-left: 2px solid #444;
}

.setting-label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: #fff;
  font-size: 0.9rem;
  font-weight: 500;
}

.setting-label input[type="checkbox"] {
  width: 1rem;
  height: 1rem;
  cursor: pointer;
}

.setting-label span {
  cursor: pointer;
}

.slider-control {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.slider-control input[type="range"] {
  flex: 1;
  height: 4px;
  border-radius: 2px;
  background: #333;
  outline: none;
  cursor: pointer;
}

.slider-control input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #00ff00;
  cursor: pointer;
}

.slider-control input[type="range"]::-moz-range-thumb {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #00ff00;
  cursor: pointer;
  border: none;
}

.slider-value {
  min-width: 3rem;
  text-align: right;
  color: #00ff00;
  font-family: monospace;
  font-size: 0.85rem;
}

.setting-description {
  color: #888;
  font-size: 0.8rem;
  line-height: 1.3;
}

.warning-message {
  padding: 0.75rem;
  background: rgba(255, 165, 0, 0.1);
  border-left: 3px solid orange;
  border-radius: 4px;
  color: #ddd;
  font-size: 0.85rem;
  line-height: 1.4;
}

.warning-message strong {
  color: orange;
}

.btn {
  padding: 0.25rem 0.5rem;
  border: none;
  border-radius: 4px;
  font-size: 0.8rem;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-small {
  padding: 0.25rem 0.5rem;
  font-size: 0.8rem;
}

.btn-secondary {
  background: #444;
  color: #fff;
}

.btn-secondary:hover {
  background: #555;
}
</style>
