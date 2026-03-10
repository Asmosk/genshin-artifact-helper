<script setup lang="ts">
import { computed } from 'vue'
import { useOCRStore } from '@/stores/ocr'
import type { SubstatType } from '@/types/artifact'

const ocrStore = useOCRStore()

// Computed
const hasResult = computed(() => ocrStore.hasResult && ocrStore.result !== null)
const artifact = computed(() => ocrStore.result?.artifact)
const confidence = computed(() => ocrStore.result?.confidence || 0)
const errors = computed(() => ocrStore.result?.errors || [])
const rawText = computed(() => ocrStore.result?.rawText || '')

const totalRolls = computed(() => {
  if (!artifact.value?.substats) return 0
  return artifact.value.substats.reduce((sum, s) => sum + (s.rollCount ?? 1), 0)
})

const maxRolls = computed(() => {
  const a = artifact.value
  if (!a?.rarity || a.level == null) return undefined
  const maxStart = a.rarity === 5 ? 4 : a.rarity === 4 ? 3 : a.rarity === 3 ? 2 : a.rarity === 2 ? 1 : 0
  return maxStart + Math.floor(a.level / 4)
})

const confidenceColor = computed(() => {
  const conf = confidence.value
  if (conf >= 0.8) return '#4ade80' // green
  if (conf >= 0.6) return '#fbbf24' // yellow
  return '#f87171' // red
})

const confidenceText = computed(() => {
  const conf = confidence.value
  if (conf >= 0.8) return 'High'
  if (conf >= 0.6) return 'Medium'
  return 'Low'
})

// Format stat display
function formatStatValue(type: string, value: number): string {
  // Flat stats (no %)
  if (['HP', 'ATK', 'DEF', 'Elemental Mastery'].includes(type)) {
    return value.toFixed(0)
  }
  // Percentage stats
  return `${value.toFixed(1)}%`
}

// Get stat color for visual coding
function getStatColor(type: SubstatType | string): string {
  if (type.includes('CRIT')) return '#f472b6' // pink
  if (type.includes('ATK')) return '#fb923c' // orange
  if (type.includes('HP')) return '#4ade80' // green
  if (type.includes('DEF')) return '#fbbf24' // yellow
  if (type.includes('Energy')) return '#60a5fa' // blue
  if (type.includes('Elemental Mastery')) return '#a78bfa' // purple
  return '#9ca3af' // gray
}

// Actions
function handleAccept() {
  ocrStore.acceptResult()
}

function handleReject() {
  ocrStore.rejectResult()
}

// Toggle raw text visibility
const showRawText = computed({
  get: () => false,
  set: () => {},
})
</script>

<template>
  <div class="ocr-results">
    <div v-if="!hasResult" class="no-results">
      <p>No OCR results yet. Capture and process an image to see artifact data.</p>
    </div>

    <div v-else class="results-container">
      <!-- Header with confidence -->
      <div class="results-header">
        <h3>OCR Results</h3>
        <div class="confidence-badge" :style="{ backgroundColor: confidenceColor }">
          <span>{{ confidenceText }} Confidence</span>
          <span class="confidence-value">{{ (confidence * 100).toFixed(0) }}%</span>
        </div>
        <div class="processing-time">
          <span>Processed in {{ (ocrStore.processingTime / 1000).toFixed(2) }}s</span>
        </div>
      </div>

      <!-- Errors and warnings -->
      <div v-if="errors.length > 0" class="errors-section">
        <h4>⚠️ Warnings</h4>
        <ul>
          <li v-for="(error, index) in errors" :key="index">{{ error }}</li>
        </ul>
      </div>

      <!-- Parsed artifact data -->
      <div class="artifact-data">
        <h4>Parsed Artifact</h4>

        <div class="artifact-grid">
          <!-- Basic info -->
          <div class="info-row">
            <span class="label">Set:</span>
            <span class="value">{{ artifact?.set || 'Unknown' }}</span>
          </div>
          <div class="info-row">
            <span class="label">Slot:</span>
            <span class="value">{{ artifact?.slot || 'Unknown' }}</span>
          </div>
          <div class="info-row">
            <span class="label">Rarity:</span>
            <span class="value">{{ artifact?.rarity ? '★'.repeat(artifact.rarity) : 'Unknown' }}</span>
          </div>
          <div class="info-row">
            <span class="label">Level:</span>
            <span class="value">+{{ artifact?.level ?? '?' }}</span>
          </div>

          <!-- Main stat -->
          <div v-if="artifact?.mainStat" class="main-stat">
            <span class="label">Main Stat:</span>
            <div class="stat-value">
              <span class="stat-type" :style="{ color: getStatColor(artifact.mainStat.type) }">
                {{ artifact.mainStat.type }}
              </span>
              <span class="stat-number">
                {{ formatStatValue(artifact.mainStat.type, artifact.mainStat.value) }}
              </span>
            </div>
          </div>

          <!-- Substats -->
          <div v-if="artifact?.substats && artifact.substats.length > 0" class="substats">
            <span class="label">Substats:</span>
            <div class="substats-list">
              <div
                v-for="(substat, index) in artifact.substats"
                :key="index"
                class="substat-item"
                :class="{ 'substat-item--unactivated': substat.unactivated }"
              >
                <span v-if="substat.rollCount !== undefined" class="roll-badge">{{ substat.rollCount }}</span>
                <span class="stat-type" :style="{ color: getStatColor(substat.type) }">
                  {{ substat.type }}
                </span>
                <span v-if="substat.unactivated" class="unactivated-badge">(unactivated)</span>
                <span class="stat-number">
                  +{{ formatStatValue(substat.type, substat.value) }}
                </span>
              </div>
            </div>
            <div v-if="artifact?.substats && artifact.substats.length > 0" class="total-rolls">
              Total rolls: {{ totalRolls }}{{ maxRolls !== undefined ? ` / ${maxRolls}` : '' }}
            </div>
          </div>
        </div>
      </div>

      <!-- Raw OCR text (collapsible) -->
      <details class="raw-text-section">
        <summary>Show Raw OCR Text</summary>
        <pre class="raw-text">{{ rawText }}</pre>
      </details>

      <!-- Actions -->
      <div class="actions">
        <button @click="handleAccept" class="btn btn-primary">
          ✓ Accept & Score
        </button>
        <button @click="handleReject" class="btn btn-secondary">
          ✗ Reject
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ocr-results {
  background: #1e293b;
  border-radius: 8px;
  padding: 1.5rem;
  color: #e2e8f0;
}

.no-results {
  text-align: center;
  padding: 2rem;
  color: #94a3b8;
}

.results-container {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.results-header {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid #334155;
}

.results-header h3 {
  margin: 0;
  font-size: 1.25rem;
  flex: 1;
}

.confidence-badge {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  border-radius: 6px;
  font-size: 0.875rem;
  font-weight: 600;
  color: #1e293b;
}

.confidence-value {
  font-size: 1rem;
}

.processing-time {
  font-size: 0.875rem;
  color: #94a3b8;
}

.errors-section {
  background: #7f1d1d;
  border: 1px solid #dc2626;
  border-radius: 6px;
  padding: 1rem;
}

.errors-section h4 {
  margin: 0 0 0.5rem 0;
  font-size: 1rem;
  color: #fca5a5;
}

.errors-section ul {
  margin: 0;
  padding-left: 1.5rem;
  color: #fecaca;
}

.errors-section li {
  margin-bottom: 0.25rem;
}

.artifact-data h4 {
  margin: 0 0 1rem 0;
  font-size: 1rem;
  color: #cbd5e1;
}

.artifact-grid {
  display: grid;
  gap: 0.75rem;
}

.info-row {
  display: flex;
  justify-content: space-between;
  padding: 0.5rem 0;
  border-bottom: 1px solid #334155;
}

.label {
  font-weight: 600;
  color: #94a3b8;
}

.value {
  color: #e2e8f0;
}

.main-stat {
  padding: 0.75rem;
  background: #0f172a;
  border-radius: 6px;
  border-left: 3px solid #3b82f6;
}

.main-stat .label {
  display: block;
  margin-bottom: 0.5rem;
}

.stat-value {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.stat-type {
  font-weight: 600;
}

.stat-number {
  font-size: 1.125rem;
  font-weight: 700;
}

.substats {
  padding: 0.75rem;
  background: #0f172a;
  border-radius: 6px;
  border-left: 3px solid #8b5cf6;
}

.substats .label {
  display: block;
  margin-bottom: 0.5rem;
}

.substats-list {
  display: grid;
  gap: 0.5rem;
}

.substat-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.375rem 0.5rem;
  background: #1e293b;
  border-radius: 4px;
}

.substat-item .stat-number {
  margin-left: auto;
}

.substat-item--unactivated {
  opacity: 0.5;
}

.unactivated-badge {
  font-size: 0.7rem;
  color: #64748b;
  font-style: italic;
}

.roll-badge {
  font-size: 0.75rem;
  font-weight: 700;
  color: #fbbf24;
  background: rgba(251, 191, 36, 0.15);
  border-radius: 50%;
  width: 1.4rem;
  height: 1.4rem;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.total-rolls {
  margin-top: 0.5rem;
  font-size: 0.875rem;
  color: #94a3b8;
  text-align: right;
}

.raw-text-section {
  border: 1px solid #334155;
  border-radius: 6px;
  padding: 0.75rem;
}

.raw-text-section summary {
  cursor: pointer;
  font-weight: 600;
  color: #94a3b8;
  user-select: none;
}

.raw-text-section summary:hover {
  color: #cbd5e1;
}

.raw-text {
  margin-top: 0.75rem;
  padding: 0.75rem;
  background: #0f172a;
  border-radius: 4px;
  font-family: 'Courier New', monospace;
  font-size: 0.875rem;
  color: #94a3b8;
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-word;
}

.actions {
  display: flex;
  gap: 1rem;
  padding-top: 1rem;
  border-top: 1px solid #334155;
}

.btn {
  flex: 1;
  padding: 0.75rem 1.5rem;
  border: none;
  border-radius: 6px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-primary {
  background: #3b82f6;
  color: white;
}

.btn-primary:hover {
  background: #2563eb;
}

.btn-secondary {
  background: #475569;
  color: #e2e8f0;
}

.btn-secondary:hover {
  background: #64748b;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
