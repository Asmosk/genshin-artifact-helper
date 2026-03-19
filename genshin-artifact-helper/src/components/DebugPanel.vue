<script setup lang="ts">
import { DEFAULT_PREPROCESSING } from '@/utils/ocr-region-templates'
import { defaultStarDetectionSettings } from '@/utils/star-detection'
import type { StarDetectionDebugData, StarDetectionSettings } from '@/utils/star-detection'
import type { ArtifactRegionLayout, ScreenType, PreprocessingOptions } from '@/types/ocr-regions'
import OCRRegionOffsetSetup from '@/components/OCRRegionOffsetSetup.vue'
import { useSettingsStore } from '@/stores/settings'

const settingsStore = useSettingsStore()

defineProps<{
  showDebugMenu: boolean
  debugShowStarDetection: boolean
  debugShowHistograms: boolean
  debugStarData: StarDetectionDebugData | null
  starSettings: StarDetectionSettings
  starAlgorithmMode: 'legacy' | 'projection'
  starCenterFinderMode: 'legacy' | 'region'
  debugPreprocessingEnabled: boolean
  debugPreprocessingOptions: PreprocessingOptions
  showRegionOffsetSetup: boolean
  regionEditorScreenType: ScreenType
  regionEditorLayout: ArtifactRegionLayout | null
  hasImage: boolean
}>()

const emit = defineEmits<{
  'update:showDebugMenu': [value: boolean]
  'update:debugShowHistograms': [value: boolean]
  'update:starSettings': [value: StarDetectionSettings]
  'update:starAlgorithmMode': [value: 'legacy' | 'projection']
  'update:starCenterFinderMode': [value: 'legacy' | 'region']
  'update:debugPreprocessingEnabled': [value: boolean]
  'update:debugPreprocessingOptions': [value: PreprocessingOptions]
  'update:regionEditorLayout': [value: ArtifactRegionLayout | null]
  toggleStarDetectionDebug: []
  toggleRegionOffsetSetup: []
  'editor-screen-type-change': [type: ScreenType]
  initRegionEditorLayout: []
}>()
</script>

<template>
  <section class="control-section debug-section">
    <h2 class="collapsible-header" @click="emit('update:showDebugMenu', !showDebugMenu)">
      {{ showDebugMenu ? '&#x25BC;' : '&#x25B6;' }} Debug
    </h2>
    <div v-if="showDebugMenu" class="debug-controls">
      <div class="checkbox-control">
        <label>
          <input
            type="checkbox"
            :checked="settingsStore.ocrSettings.regions.parallelProcessing"
            @change="settingsStore.toggleParallelProcessing()"
          />
          Parallel Processing
        </label>
        <small>Process regions simultaneously</small>
      </div>
      <button
        class="btn btn-secondary debug-btn"
        :class="{ 'debug-btn-active': debugShowStarDetection }"
        :disabled="!hasImage"
        @click="emit('toggleStarDetectionDebug')"
      >
        Draw Star Detection Data
      </button>
      <button
        class="btn btn-secondary debug-btn"
        :class="{ 'debug-btn-active': showRegionOffsetSetup }"
        @click="emit('toggleRegionOffsetSetup')"
      >
        OCR Region Offset Setup
      </button>
      <OCRRegionOffsetSetup
        v-if="showRegionOffsetSetup && regionEditorLayout"
        :model-value="regionEditorLayout"
        :screen-type="regionEditorScreenType"
        @update:model-value="emit('update:regionEditorLayout', $event)"
        @update:screen-type="emit('editor-screen-type-change', $event)"
        @reset="emit('initRegionEditorLayout')"
      />
      <div v-if="debugShowStarDetection && debugStarData" class="debug-info">
        <span v-if="debugStarData.detectedCenter">
          Center: ({{ debugStarData.detectedCenter.x }}, {{ debugStarData.detectedCenter.y }})
          &mdash; {{ debugStarData.starCount }}&#x2605;
        </span>
        <span v-else class="debug-no-stars">No stars detected</span>
        <small
          >{{ debugStarData.blocks.length }} active blocks &bull; grid
          {{ debugStarData.gridSize }}px</small
        >
      </div>
      <div v-if="debugShowStarDetection" class="star-settings-panel">
        <div class="star-settings-header">
          <span>Star Detection Settings</span>
          <button
            class="btn btn-small"
            @click="emit('update:starSettings', { ...defaultStarDetectionSettings })"
          >
            Reset Defaults
          </button>
        </div>
        <div class="star-setting-row star-histogram-row">
          <label>
            <input
              type="checkbox"
              :checked="debugShowHistograms"
              :disabled="!debugStarData"
              @change="emit('update:debugShowHistograms', !debugShowHistograms)"
            />
            Draw Color Histograms
          </label>
        </div>
        <!-- Algorithm selector -->
        <div class="star-setting-row">
          <label>Algorithm <span>{{ starAlgorithmMode }}</span></label>
          <div class="star-finder-toggle">
            <button
              class="btn btn-small"
              :class="{ 'star-finder-active': starAlgorithmMode === 'legacy' }"
              @click="emit('update:starAlgorithmMode', 'legacy')"
            >
              Legacy
            </button>
            <button
              class="btn btn-small"
              :class="{ 'star-finder-active': starAlgorithmMode === 'projection' }"
              @click="emit('update:starAlgorithmMode', 'projection')"
            >
              Projection
            </button>
          </div>
        </div>
        <!-- Common settings -->
        <div class="star-color-preview-row">
          <span>Star Color:</span>
          <div
            class="star-color-swatch"
            :style="{
              background: `rgb(${starSettings.starColorR}, ${starSettings.starColorG}, ${starSettings.starColorB})`,
            }"
          />
          <code
            >rgb({{ starSettings.starColorR }}, {{ starSettings.starColorG }},
            {{ starSettings.starColorB }})</code
          >
        </div>
        <div class="star-setting-row">
          <label>R <span>{{ starSettings.starColorR }}</span></label>
          <input
            type="range"
            min="0"
            max="255"
            step="1"
            :value="starSettings.starColorR"
            @input="emit('update:starSettings', { ...starSettings, starColorR: Number(($event.target as HTMLInputElement).value) })"
          />
        </div>
        <div class="star-setting-row">
          <label>G <span>{{ starSettings.starColorG }}</span></label>
          <input
            type="range"
            min="0"
            max="255"
            step="1"
            :value="starSettings.starColorG"
            @input="emit('update:starSettings', { ...starSettings, starColorG: Number(($event.target as HTMLInputElement).value) })"
          />
        </div>
        <div class="star-setting-row">
          <label>B <span>{{ starSettings.starColorB }}</span></label>
          <input
            type="range"
            min="0"
            max="255"
            step="1"
            :value="starSettings.starColorB"
            @input="emit('update:starSettings', { ...starSettings, starColorB: Number(($event.target as HTMLInputElement).value) })"
          />
        </div>
        <div class="star-setting-row">
          <label>Color Tolerance <span>{{ starSettings.colorTolerance }}</span></label>
          <input
            type="range"
            min="0"
            max="100"
            step="1"
            :value="starSettings.colorTolerance"
            @input="emit('update:starSettings', { ...starSettings, colorTolerance: Number(($event.target as HTMLInputElement).value) })"
          />
        </div>
        <div class="star-setting-row">
          <label>Star Size % <span>{{ starSettings.starSizePercent.toFixed(4) }}</span></label>
          <input
            type="range"
            min="0.01"
            max="0.08"
            step="0.001"
            :value="starSettings.starSizePercent"
            @input="emit('update:starSettings', { ...starSettings, starSizePercent: Number(($event.target as HTMLInputElement).value) })"
          />
        </div>
        <div class="star-setting-row">
          <label
            >Star Distance %
            <span>{{ starSettings.starDistancePercent.toFixed(4) }}</span></label
          >
          <input
            type="range"
            min="0.005"
            max="0.1"
            step="0.0005"
            :value="starSettings.starDistancePercent"
            @input="emit('update:starSettings', { ...starSettings, starDistancePercent: Number(($event.target as HTMLInputElement).value) })"
          />
        </div>
        <!-- Legacy-specific settings -->
        <template v-if="starAlgorithmMode === 'legacy'">
          <div class="star-setting-row">
            <label>Center Finder <span>{{ starCenterFinderMode }}</span></label>
            <div class="star-finder-toggle">
              <button
                class="btn btn-small"
                :class="{ 'star-finder-active': starCenterFinderMode === 'legacy' }"
                @click="emit('update:starCenterFinderMode', 'legacy')"
              >
                Legacy
              </button>
              <button
                class="btn btn-small"
                :class="{ 'star-finder-active': starCenterFinderMode === 'region' }"
                @click="emit('update:starCenterFinderMode', 'region')"
              >
                Region
              </button>
            </div>
          </div>
          <div class="star-setting-row">
            <label
              >Grid Size %
              <span>{{ starSettings.gridSizePercent.toFixed(4) }}</span></label
            >
            <input
              type="range"
              min="0.002"
              max="0.05"
              step="0.0005"
              :value="starSettings.gridSizePercent"
              @input="emit('update:starSettings', { ...starSettings, gridSizePercent: Number(($event.target as HTMLInputElement).value) })"
            />
          </div>
          <div class="star-setting-row">
            <label
              >Pass 1 Sample %<span>{{
                starSettings.pass1SamplePercent.toFixed(2)
              }}</span></label
            >
            <input
              type="range"
              min="0.005"
              max="1"
              step="0.005"
              :value="starSettings.pass1SamplePercent"
              @input="emit('update:starSettings', { ...starSettings, pass1SamplePercent: Number(($event.target as HTMLInputElement).value) })"
            />
          </div>
          <div class="star-setting-row">
            <label
              >Pass 1 Threshold
              <span>{{ starSettings.pass1MatchThreshold }}</span></label
            >
            <input
              type="range"
              min="0.005"
              max="1"
              step="0.005"
              :value="starSettings.pass1MatchThreshold"
              @input="emit('update:starSettings', { ...starSettings, pass1MatchThreshold: Number(($event.target as HTMLInputElement).value) })"
            />
          </div>
          <div class="star-setting-row">
            <label
              >Pass 2 Sample %<span>{{
                starSettings.pass2SamplePercent.toFixed(2)
              }}</span></label
            >
            <input
              type="range"
              min="0.005"
              max="1"
              step="0.005"
              :value="starSettings.pass2SamplePercent"
              @input="emit('update:starSettings', { ...starSettings, pass2SamplePercent: Number(($event.target as HTMLInputElement).value) })"
            />
          </div>
          <div class="star-setting-row">
            <label
              >Pass 2 Threshold
              <span>{{ starSettings.pass2MatchThreshold }}</span></label
            >
            <input
              type="range"
              min="0.005"
              max="1"
              step="0.005"
              :value="starSettings.pass2MatchThreshold"
              @input="emit('update:starSettings', { ...starSettings, pass2MatchThreshold: Number(($event.target as HTMLInputElement).value) })"
            />
          </div>
          <div class="star-setting-row">
            <label
              >Pass 3 Sample %<span>{{
                starSettings.pass3SamplePercent.toFixed(2)
              }}</span></label
            >
            <input
              type="range"
              min="0.005"
              max="1"
              step="0.005"
              :value="starSettings.pass3SamplePercent"
              @input="emit('update:starSettings', { ...starSettings, pass3SamplePercent: Number(($event.target as HTMLInputElement).value) })"
            />
          </div>
          <div class="star-setting-row">
            <label
              >Pass 3 Threshold
              <span>{{ starSettings.pass3MatchThreshold }}</span></label
            >
            <input
              type="range"
              min="0.005"
              max="1"
              step="0.005"
              :value="starSettings.pass3MatchThreshold"
              @input="emit('update:starSettings', { ...starSettings, pass3MatchThreshold: Number(($event.target as HTMLInputElement).value) })"
            />
          </div>
          <div class="star-setting-row">
            <label
              >Confirm Threshold
              <span>{{ starSettings.confirmThreshold.toFixed(2) }}</span></label
            >
            <input
              type="range"
              min="0.005"
              max="1"
              step="0.005"
              :value="starSettings.confirmThreshold"
              @input="emit('update:starSettings', { ...starSettings, confirmThreshold: Number(($event.target as HTMLInputElement).value) })"
            />
          </div>
        </template>
        <!-- Projection-specific settings -->
        <template v-else>
          <div class="star-setting-row">
            <label
              >Col Min %
              <span>{{ starSettings.projColMinPercent.toFixed(4) }}</span></label
            >
            <input
              type="range"
              min="0.005"
              max="0.1"
              step="0.001"
              :value="starSettings.projColMinPercent"
              @input="emit('update:starSettings', { ...starSettings, projColMinPercent: Number(($event.target as HTMLInputElement).value) })"
            />
          </div>
          <div class="star-setting-row">
            <label
              >Col Max %
              <span>{{ starSettings.projColMaxPercent.toFixed(4) }}</span></label
            >
            <input
              type="range"
              min="0.005"
              max="0.1"
              step="0.001"
              :value="starSettings.projColMaxPercent"
              @input="emit('update:starSettings', { ...starSettings, projColMaxPercent: Number(($event.target as HTMLInputElement).value) })"
            />
          </div>
          <div class="star-setting-row">
            <label
              >Col Min Pixels
              <span>{{ starSettings.projColMinPixels }}</span></label
            >
            <input
              type="range"
              min="1"
              max="20"
              step="1"
              :value="starSettings.projColMinPixels"
              @input="emit('update:starSettings', { ...starSettings, projColMinPixels: Number(($event.target as HTMLInputElement).value) })"
            />
          </div>
          <div class="star-setting-row">
            <label
              >Row Min %
              <span>{{ starSettings.projRowMinPercent.toFixed(4) }}</span></label
            >
            <input
              type="range"
              min="0.005"
              max="0.1"
              step="0.001"
              :value="starSettings.projRowMinPercent"
              @input="emit('update:starSettings', { ...starSettings, projRowMinPercent: Number(($event.target as HTMLInputElement).value) })"
            />
          </div>
          <div class="star-setting-row">
            <label
              >Row Max %
              <span>{{ starSettings.projRowMaxPercent.toFixed(4) }}</span></label
            >
            <input
              type="range"
              min="0.005"
              max="0.1"
              step="0.001"
              :value="starSettings.projRowMaxPercent"
              @input="emit('update:starSettings', { ...starSettings, projRowMaxPercent: Number(($event.target as HTMLInputElement).value) })"
            />
          </div>
          <div class="star-setting-row">
            <label
              >Spacing Tolerance
              <span>{{ starSettings.projSpacingTolerance.toFixed(2) }}</span></label
            >
            <input
              type="range"
              min="0.01"
              max="0.5"
              step="0.01"
              :value="starSettings.projSpacingTolerance"
              @input="emit('update:starSettings', { ...starSettings, projSpacingTolerance: Number(($event.target as HTMLInputElement).value) })"
            />
          </div>
          <div class="star-setting-row">
            <label
              >Y Window (px)
              <span>{{ starSettings.projYWindowPx }}</span></label
            >
            <input
              type="range"
              min="0"
              max="10"
              step="1"
              :value="starSettings.projYWindowPx"
              @input="emit('update:starSettings', { ...starSettings, projYWindowPx: Number(($event.target as HTMLInputElement).value) })"
            />
          </div>
        </template>
      </div>
      <button
        class="btn btn-secondary debug-btn"
        :class="{ 'debug-btn-active': debugPreprocessingEnabled }"
        @click="emit('update:debugPreprocessingEnabled', !debugPreprocessingEnabled)"
      >
        OCR Region Preprocessing Setup
      </button>
      <div v-if="debugPreprocessingEnabled" class="preproc-settings-panel">
        <div class="preproc-settings-header">
          <span>Preprocessing Options</span>
          <button
            class="btn btn-small"
            @click="emit('update:debugPreprocessingOptions', { ...DEFAULT_PREPROCESSING })"
          >
            Reset Defaults
          </button>
        </div>
        <div class="preproc-bool-row">
            <label
              ><input
                type="checkbox"
                :checked="debugPreprocessingOptions.grayscale"
                @change="emit('update:debugPreprocessingOptions', { ...debugPreprocessingOptions, grayscale: !debugPreprocessingOptions.grayscale })"
              />
              grayscale</label
            >
          </div>
          <div class="preproc-bool-row">
            <label
              ><input
                type="checkbox"
                :checked="debugPreprocessingOptions.enhanceContrast"
                @change="emit('update:debugPreprocessingOptions', { ...debugPreprocessingOptions, enhanceContrast: !debugPreprocessingOptions.enhanceContrast })"
              />
              enhanceContrast</label
            >
          </div>
          <div class="preproc-slider-row">
            <label
              >contrastFactor
              <span>{{ debugPreprocessingOptions.contrastFactor.toFixed(1) }}</span></label
            >
            <input
              type="range"
              min="1.0"
              max="3.0"
              step="0.1"
              :value="debugPreprocessingOptions.contrastFactor"
              @input="emit('update:debugPreprocessingOptions', { ...debugPreprocessingOptions, contrastFactor: Number(($event.target as HTMLInputElement).value) })"
            />
          </div>
          <div class="preproc-bool-row">
            <label
              ><input
                type="checkbox"
                :checked="debugPreprocessingOptions.denoise"
                @change="emit('update:debugPreprocessingOptions', { ...debugPreprocessingOptions, denoise: !debugPreprocessingOptions.denoise })"
              />
              denoise</label
            >
          </div>
          <div class="preproc-bool-row">
            <label
              ><input
                type="checkbox"
                :checked="debugPreprocessingOptions.sharpen"
                @change="emit('update:debugPreprocessingOptions', { ...debugPreprocessingOptions, sharpen: !debugPreprocessingOptions.sharpen })"
              />
              sharpen</label
            >
          </div>
          <div class="preproc-bool-row">
            <label
              ><input
                type="checkbox"
                :checked="debugPreprocessingOptions.adaptive"
                @change="emit('update:debugPreprocessingOptions', { ...debugPreprocessingOptions, adaptive: !debugPreprocessingOptions.adaptive })"
              />
              adaptive</label
            >
          </div>
          <div class="preproc-slider-row">
            <label
              >adaptiveBlockSize
              <span>{{ debugPreprocessingOptions.adaptiveBlockSize }}</span></label
            >
            <input
              type="range"
              min="7"
              max="21"
              step="2"
              :value="debugPreprocessingOptions.adaptiveBlockSize"
              @input="emit('update:debugPreprocessingOptions', { ...debugPreprocessingOptions, adaptiveBlockSize: Number(($event.target as HTMLInputElement).value) })"
            />
          </div>
          <div class="preproc-bool-row">
            <label
              ><input
                type="checkbox"
                :checked="debugPreprocessingOptions.upscale"
                @change="emit('update:debugPreprocessingOptions', { ...debugPreprocessingOptions, upscale: !debugPreprocessingOptions.upscale })"
              />
              upscale</label
            >
          </div>
          <div class="preproc-slider-row">
            <label
              >scaleFactor
              <span>{{ debugPreprocessingOptions.scaleFactor }}</span></label
            >
            <input
              type="range"
              min="1"
              max="4"
              step="1"
              :value="debugPreprocessingOptions.scaleFactor"
              @input="emit('update:debugPreprocessingOptions', { ...debugPreprocessingOptions, scaleFactor: Number(($event.target as HTMLInputElement).value) })"
            />
          </div>
          <div class="preproc-bool-row">
            <label
              ><input
                type="checkbox"
                :checked="debugPreprocessingOptions.genshinOptimized"
                @change="emit('update:debugPreprocessingOptions', { ...debugPreprocessingOptions, genshinOptimized: !debugPreprocessingOptions.genshinOptimized })"
              />
              genshinOptimized</label
            >
          </div>
          <div class="preproc-slider-row">
            <label
              >backgroundThreshold
              <span>{{ debugPreprocessingOptions.backgroundThreshold }}</span></label
            >
            <input
              type="range"
              min="0"
              max="255"
              step="5"
              :value="debugPreprocessingOptions.backgroundThreshold"
              @input="emit('update:debugPreprocessingOptions', { ...debugPreprocessingOptions, backgroundThreshold: Number(($event.target as HTMLInputElement).value) })"
            />
          </div>
          <div class="preproc-bool-row">
            <label
              ><input
                type="checkbox"
                :checked="debugPreprocessingOptions.invert"
                @change="emit('update:debugPreprocessingOptions', { ...debugPreprocessingOptions, invert: !debugPreprocessingOptions.invert })"
              />
              invert</label
            >
          </div>
        </div>
    </div>
  </section>
</template>

<style scoped>
.debug-section {
  border: 1px solid #444;
}

.collapsible-header {
  cursor: pointer;
  user-select: none;
}

.collapsible-header:hover {
  color: #aaa;
}

.debug-controls {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-top: 0.5rem;
}

.debug-btn {
  text-align: left;
  font-size: 0.85rem;
}

.debug-btn-active {
  background: #554400;
  color: #ffcc32;
  border: 1px solid #ffcc32;
}

.debug-btn-active:hover:not(:disabled) {
  background: #665500;
}

.debug-info {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0.5rem;
  background: #1a1a1a;
  border-radius: 4px;
  font-size: 0.8rem;
  font-family: monospace;
  color: #ffcc32;
}

.debug-no-stars {
  color: #ff6666;
}

.debug-info small {
  color: #888;
  font-family: monospace;
}

.star-settings-panel {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  padding: 0.6rem;
  background: #1a1a1a;
  border-radius: 4px;
  border: 1px solid #554400;
}

.star-settings-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.8rem;
  color: #ffcc32;
  font-weight: bold;
  margin-bottom: 0.25rem;
}

.star-color-preview-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.75rem;
  color: #aaa;
  font-family: monospace;
  margin-bottom: 0.25rem;
}

.star-color-swatch {
  width: 1.2rem;
  height: 1.2rem;
  border-radius: 3px;
  border: 1px solid #666;
  flex-shrink: 0;
}

.star-setting-row {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.star-setting-row label {
  display: flex;
  justify-content: space-between;
  font-size: 0.75rem;
  color: #aaa;
  font-family: monospace;
}

.star-setting-row label span {
  color: #ffcc32;
}

.star-setting-row input[type='range'] {
  width: 100%;
  accent-color: #ffcc32;
  cursor: pointer;
}

.star-histogram-row label {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.8rem;
  color: #aaa;
  font-family: monospace;
  cursor: pointer;
}

.star-histogram-row input[type='checkbox'] {
  accent-color: #ffcc32;
}

.star-finder-toggle {
  display: flex;
  gap: 0.25rem;
}

.star-finder-active {
  background: #554400;
  color: #ffcc32;
  border: 1px solid #ffcc32;
}

.preproc-settings-panel {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  padding: 0.6rem;
  background: #1a1a1a;
  border-radius: 4px;
  border: 1px solid #554400;
}

.preproc-settings-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.8rem;
  color: #ffcc32;
  font-weight: bold;
  margin-bottom: 0.25rem;
}

.preproc-bool-row label {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.75rem;
  color: #aaa;
  font-family: monospace;
  cursor: pointer;
}

.preproc-bool-row input[type='checkbox'] {
  accent-color: #ffcc32;
}

.preproc-slider-row {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.preproc-slider-row label {
  display: flex;
  justify-content: space-between;
  font-size: 0.75rem;
  color: #aaa;
  font-family: monospace;
}

.preproc-slider-row label span {
  color: #ffcc32;
}

.preproc-slider-row input[type='range'] {
  width: 100%;
  accent-color: #ffcc32;
  cursor: pointer;
}
</style>
