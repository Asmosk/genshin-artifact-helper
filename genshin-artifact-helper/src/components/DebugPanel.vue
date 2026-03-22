<script setup lang="ts">
import { DEFAULT_PREPROCESSING } from '@/utils/ocr-region-templates'
import { defaultStarDetectionSettings } from '@/utils/star-detection'
import type { StarDetectionDebugData, StarDetectionSettings } from '@/utils/star-detection'
import type { ArtifactRegionLayout, ArtifactScreenType, PreprocessingOptions } from '@/types/ocr-regions'
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
  regionEditorScreenType: ArtifactScreenType
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
  'editor-screen-type-change': [type: ArtifactScreenType]
  initRegionEditorLayout: []
}>()
</script>

<template>
  <section class="control-section border border-dark-600">
    <h2 class="cursor-pointer select-none hover:text-gray-400" @click="emit('update:showDebugMenu', !showDebugMenu)">
      {{ showDebugMenu ? '&#x25BC;' : '&#x25B6;' }} Debug
    </h2>
    <div v-if="showDebugMenu" class="flex flex-col gap-2 mt-2">
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
        class="btn btn-secondary text-left text-[0.85rem]"
        :class="debugShowStarDetection ? 'bg-gold-dark text-gold border border-gold' : ''"
        :disabled="!hasImage"
        @click="emit('toggleStarDetectionDebug')"
      >
        Draw Star Detection Data
      </button>
      <button
        class="btn btn-secondary text-left text-[0.85rem]"
        :class="showRegionOffsetSetup ? 'bg-gold-dark text-gold border border-gold' : ''"
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
      <div v-if="debugShowStarDetection && debugStarData" class="flex flex-col gap-1 p-2 bg-dark-900 rounded text-xs font-mono text-gold">
        <span v-if="debugStarData.detectedCenter">
          Center: ({{ debugStarData.detectedCenter.x }}, {{ debugStarData.detectedCenter.y }})
          &mdash; {{ debugStarData.starCount }}&#x2605;
        </span>
        <span v-else class="text-red-400">No stars detected</span>
        <small class="text-gray-mid font-mono"
          >{{ debugStarData.blocks.length }} active blocks &bull; grid
          {{ debugStarData.gridSize }}px</small
        >
      </div>
      <div v-if="debugShowStarDetection" class="flex flex-col gap-1.5 p-2.5 bg-dark-900 rounded border border-gold-dark">
        <div class="flex justify-between items-center text-xs text-gold font-bold mb-1">
          <span>Star Detection Settings</span>
          <button
            class="btn btn-small"
            @click="emit('update:starSettings', { ...defaultStarDetectionSettings })"
          >
            Reset Defaults
          </button>
        </div>
        <!-- Histogram checkbox -->
        <label class="flex items-center gap-1.5 text-xs text-gray-400 font-mono cursor-pointer accent-gold">
          <input
            type="checkbox"
            class="accent-[#ffcc32]"
            :checked="debugShowHistograms"
            :disabled="!debugStarData"
            @change="emit('update:debugShowHistograms', !debugShowHistograms)"
          />
          Draw Color Histograms
        </label>
        <!-- Algorithm selector -->
        <div class="flex flex-col gap-0.5">
          <label class="flex justify-between text-xs text-gray-400 font-mono">Algorithm <span class="text-gold">{{ starAlgorithmMode }}</span></label>
          <div class="flex gap-1">
            <button
              class="btn btn-small"
              :class="starAlgorithmMode === 'legacy' ? 'bg-gold-dark text-gold border border-gold' : ''"
              @click="emit('update:starAlgorithmMode', 'legacy')"
            >Legacy</button>
            <button
              class="btn btn-small"
              :class="starAlgorithmMode === 'projection' ? 'bg-gold-dark text-gold border border-gold' : ''"
              @click="emit('update:starAlgorithmMode', 'projection')"
            >Projection</button>
          </div>
        </div>
        <!-- Color preview -->
        <div class="flex items-center gap-2 text-xs text-gray-400 font-mono mb-1">
          <span>Star Color:</span>
          <div
            class="w-5 h-5 rounded-sm border border-dark-500 shrink-0"
            :style="{ background: `rgb(${starSettings.starColorR}, ${starSettings.starColorG}, ${starSettings.starColorB})` }"
          />
          <code>rgb({{ starSettings.starColorR }}, {{ starSettings.starColorG }}, {{ starSettings.starColorB }})</code>
        </div>
        <!-- RGB sliders -->
        <div v-for="channel in (['starColorR', 'starColorG', 'starColorB'] as const)" :key="channel" class="flex flex-col gap-0.5">
          <label class="flex justify-between text-xs text-gray-400 font-mono">{{ channel.slice(-1) }} <span class="text-gold">{{ starSettings[channel] }}</span></label>
          <input type="range" min="0" max="255" step="1" class="w-full accent-[#ffcc32] cursor-pointer" :value="starSettings[channel]" @input="emit('update:starSettings', { ...starSettings, [channel]: Number(($event.target as HTMLInputElement).value) })" />
        </div>
        <!-- Common sliders -->
        <div class="flex flex-col gap-0.5">
          <label class="flex justify-between text-xs text-gray-400 font-mono">Color Tolerance <span class="text-gold">{{ starSettings.colorTolerance }}</span></label>
          <input type="range" min="0" max="100" step="1" class="w-full accent-[#ffcc32] cursor-pointer" :value="starSettings.colorTolerance" @input="emit('update:starSettings', { ...starSettings, colorTolerance: Number(($event.target as HTMLInputElement).value) })" />
        </div>
        <div class="flex flex-col gap-0.5">
          <label class="flex justify-between text-xs text-gray-400 font-mono">Star Size % <span class="text-gold">{{ starSettings.starSizePercent.toFixed(4) }}</span></label>
          <input type="range" min="0.01" max="0.08" step="0.001" class="w-full accent-[#ffcc32] cursor-pointer" :value="starSettings.starSizePercent" @input="emit('update:starSettings', { ...starSettings, starSizePercent: Number(($event.target as HTMLInputElement).value) })" />
        </div>
        <div class="flex flex-col gap-0.5">
          <label class="flex justify-between text-xs text-gray-400 font-mono">Star Distance % <span class="text-gold">{{ starSettings.starDistancePercent.toFixed(4) }}</span></label>
          <input type="range" min="0.005" max="0.1" step="0.0005" class="w-full accent-[#ffcc32] cursor-pointer" :value="starSettings.starDistancePercent" @input="emit('update:starSettings', { ...starSettings, starDistancePercent: Number(($event.target as HTMLInputElement).value) })" />
        </div>
        <!-- Legacy-specific settings -->
        <template v-if="starAlgorithmMode === 'legacy'">
          <div class="flex flex-col gap-0.5">
            <label class="flex justify-between text-xs text-gray-400 font-mono">Center Finder <span class="text-gold">{{ starCenterFinderMode }}</span></label>
            <div class="flex gap-1">
              <button class="btn btn-small" :class="starCenterFinderMode === 'legacy' ? 'bg-gold-dark text-gold border border-gold' : ''" @click="emit('update:starCenterFinderMode', 'legacy')">Legacy</button>
              <button class="btn btn-small" :class="starCenterFinderMode === 'region' ? 'bg-gold-dark text-gold border border-gold' : ''" @click="emit('update:starCenterFinderMode', 'region')">Region</button>
            </div>
          </div>
          <div v-for="[label, prop, min, max, step] in [
            ['Grid Size %', 'gridSizePercent', '0.002', '0.05', '0.0005'],
            ['Pass 1 Sample %', 'pass1SamplePercent', '0.005', '1', '0.005'],
            ['Pass 1 Threshold', 'pass1MatchThreshold', '0.005', '1', '0.005'],
            ['Pass 2 Sample %', 'pass2SamplePercent', '0.005', '1', '0.005'],
            ['Pass 2 Threshold', 'pass2MatchThreshold', '0.005', '1', '0.005'],
            ['Pass 3 Sample %', 'pass3SamplePercent', '0.005', '1', '0.005'],
            ['Pass 3 Threshold', 'pass3MatchThreshold', '0.005', '1', '0.005'],
            ['Confirm Threshold', 'confirmThreshold', '0.005', '1', '0.005'],
          ] as const" :key="prop" class="flex flex-col gap-0.5">
            <label class="flex justify-between text-xs text-gray-400 font-mono">{{ label }} <span class="text-gold">{{ (starSettings[prop] as number).toFixed(prop.includes('Percent') || prop === 'confirmThreshold' ? 4 : 4) }}</span></label>
            <input type="range" :min="min" :max="max" :step="step" class="w-full accent-[#ffcc32] cursor-pointer" :value="starSettings[prop] as number" @input="emit('update:starSettings', { ...starSettings, [prop]: Number(($event.target as HTMLInputElement).value) })" />
          </div>
        </template>
        <!-- Projection-specific settings -->
        <template v-else>
          <div v-for="[label, prop, min, max, step] in [
            ['Col Min %', 'projColMinPercent', '0.005', '0.1', '0.001'],
            ['Col Max %', 'projColMaxPercent', '0.005', '0.1', '0.001'],
            ['Col Min Pixels', 'projColMinPixels', '1', '20', '1'],
            ['Row Min %', 'projRowMinPercent', '0.005', '0.1', '0.001'],
            ['Row Max %', 'projRowMaxPercent', '0.005', '0.1', '0.001'],
            ['Spacing Tolerance', 'projSpacingTolerance', '0.01', '0.5', '0.01'],
            ['Y Window (px)', 'projYWindowPx', '0', '10', '1'],
          ] as const" :key="prop" class="flex flex-col gap-0.5">
            <label class="flex justify-between text-xs text-gray-400 font-mono">{{ label }} <span class="text-gold">{{ starSettings[prop] as number }}</span></label>
            <input type="range" :min="min" :max="max" :step="step" class="w-full accent-[#ffcc32] cursor-pointer" :value="starSettings[prop] as number" @input="emit('update:starSettings', { ...starSettings, [prop]: Number(($event.target as HTMLInputElement).value) })" />
          </div>
        </template>
      </div>
      <button
        class="btn btn-secondary text-left text-[0.85rem]"
        :class="debugPreprocessingEnabled ? 'bg-gold-dark text-gold border border-gold' : ''"
        @click="emit('update:debugPreprocessingEnabled', !debugPreprocessingEnabled)"
      >
        OCR Region Preprocessing Setup
      </button>
      <div v-if="debugPreprocessingEnabled" class="flex flex-col gap-1.5 p-2.5 bg-dark-900 rounded border border-gold-dark">
        <div class="flex justify-between items-center text-xs text-gold font-bold mb-1">
          <span>Preprocessing Options</span>
          <button
            class="btn btn-small"
            @click="emit('update:debugPreprocessingOptions', { ...DEFAULT_PREPROCESSING })"
          >
            Reset Defaults
          </button>
        </div>
        <div v-for="key in ['grayscale', 'enhanceContrast', 'denoise', 'sharpen', 'adaptive', 'upscale', 'genshinOptimized', 'invert'] as const" :key="key">
          <label class="flex items-center gap-1.5 text-xs text-gray-400 font-mono cursor-pointer">
            <input type="checkbox" class="accent-[#ffcc32]" :checked="debugPreprocessingOptions[key] as boolean" @change="emit('update:debugPreprocessingOptions', { ...debugPreprocessingOptions, [key]: !debugPreprocessingOptions[key] })" />
            {{ key }}
          </label>
        </div>
        <div v-for="[label, prop, min, max, step] in [
          ['contrastFactor', 'contrastFactor', '1.0', '3.0', '0.1'],
          ['adaptiveBlockSize', 'adaptiveBlockSize', '7', '21', '2'],
          ['scaleFactor', 'scaleFactor', '1', '4', '1'],
          ['backgroundThreshold', 'backgroundThreshold', '0', '255', '5'],
        ] as const" :key="prop" class="flex flex-col gap-0.5">
          <label class="flex justify-between text-xs text-gray-400 font-mono">{{ label }} <span class="text-gold">{{ debugPreprocessingOptions[prop] as number }}</span></label>
          <input type="range" :min="min" :max="max" :step="step" class="w-full accent-[#ffcc32] cursor-pointer" :value="debugPreprocessingOptions[prop] as number" @input="emit('update:debugPreprocessingOptions', { ...debugPreprocessingOptions, [prop]: Number(($event.target as HTMLInputElement).value) })" />
        </div>
      </div>
    </div>
  </section>
</template>
