<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'

interface FixtureMeta {
  name: string
  hasStarCoords: boolean
  screen?: string
}

interface ColorEntry {
  hex: string
  pct: number
}

// ─── Detection region definitions (all coords in 0–100 percent space) ─────────

const REGIONS = [
  {
    id: 'char-strip',
    label: 'Character: ≥3 wide color regions (GOLDEN/LTGRAY/CREAM histogram)',
    sublabel: '70–100% X, 2–10% Y',
    xMin: 70,
    yMin: 2,
    xMax: 100,
    yMax: 10,
    color: '#dbba7d',
    group: 'character',
  },
  {
    id: 'inv-strip',
    label: 'Inventory: cream column histogram (≥2 regions)',
    sublabel: '2–35% X, 91–99% Y',
    xMin: 2,
    yMin: 91,
    xMax: 35,
    yMax: 99,
    color: '#60a5fa',
    group: 'inventory',
  },
  {
    id: 'rewards-upper',
    label: 'Rewards cond 1: upper cream >50%',
    sublabel: '43–56% X, 40–52% Y',
    xMin: 43,
    yMin: 40,
    xMax: 56,
    yMax: 52,
    color: '#a78bfa',
    group: 'rewards',
  },
  {
    id: 'rewards-lower',
    label: 'Rewards cond 2: lower cream >50%',
    sublabel: '43–56% X, 55–70% Y',
    xMin: 43,
    yMin: 55,
    xMax: 56,
    yMax: 70,
    color: '#c4b5fd',
    group: 'rewards',
  },
  {
    id: 'rewards-dark',
    label: 'Rewards cond 3: dark overlay avg <40',
    sublabel: '3–12% X, 40–55% Y',
    xMin: 3,
    yMin: 40,
    xMax: 12,
    yMax: 55,
    color: '#f87171',
    group: 'rewards',
  },
] as const

type RegionId = (typeof REGIONS)[number]['id']

// ─── State ────────────────────────────────────────────────────────────────────

const fixtures = ref<FixtureMeta[]>([])
const selectedName = ref<string | null>(null)
const imgRef = ref<HTMLImageElement | null>(null)
const imgLoaded = ref(false)
const imgDisplaySize = ref({ w: 0, h: 0 })

// Which region groups are visible
const visibleGroups = ref(new Set<string>(['character', 'inventory', 'rewards']))

// Hovered region for footer label
const hoveredRegion = ref<RegionId | null>(null)

// Offscreen canvas for pixel sampling (created once per loaded image)
let offscreenCtx: CanvasRenderingContext2D | null = null

// Top-10 quantized colors for the currently hovered region
const topColors = ref<ColorEntry[]>([])

let resizeObserver: ResizeObserver | null = null

watch(imgRef, (img, _, onCleanup) => {
  resizeObserver?.disconnect()
  if (!img) return
  resizeObserver = new ResizeObserver(() => {
    imgDisplaySize.value = { w: img.clientWidth, h: img.clientHeight }
  })
  resizeObserver.observe(img)
  onCleanup(() => resizeObserver?.disconnect())
})

onUnmounted(() => resizeObserver?.disconnect())

// ─── Data ─────────────────────────────────────────────────────────────────────

async function loadFixtures() {
  const res = await fetch('/api/fixtures')
  fixtures.value = (await res.json()) as FixtureMeta[]
}

function selectFixture(name: string) {
  if (name === selectedName.value) return
  selectedName.value = name
  imgLoaded.value = false
  hoveredRegion.value = null
  topColors.value = []
  offscreenCtx = null
}

function onImageLoad() {
  imgLoaded.value = true
  const img = imgRef.value
  if (!img) return
  imgDisplaySize.value = { w: img.clientWidth, h: img.clientHeight }

  // Build offscreen canvas at native resolution for pixel sampling
  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (ctx) {
    ctx.drawImage(img, 0, 0)
    offscreenCtx = ctx
  }
}

// ─── Color sampling ───────────────────────────────────────────────────────────

/**
 * Quantize a channel value (0–255) to one of 6 levels: 0, 51, 102, 153, 204, 255.
 * Gives ~216 distinct colors across the full RGB space.
 */
function quantize(c: number): number {
  return Math.min(248, Math.round(c / 8) * 8)
}

function toHex(n: number): string {
  return n.toString(16).padStart(2, '0')
}

function sampleRegionColors(regionId: RegionId): ColorEntry[] {
  const ctx = offscreenCtx
  if (!ctx) return []
  const region = REGIONS.find((r) => r.id === regionId)
  if (!region) return []

  const cw = ctx.canvas.width
  const ch = ctx.canvas.height
  const x = Math.round((region.xMin / 100) * cw)
  const y = Math.round((region.yMin / 100) * ch)
  const w = Math.max(1, Math.round(((region.xMax - region.xMin) / 100) * cw))
  const h = Math.max(1, Math.round(((region.yMax - region.yMin) / 100) * ch))

  const data = ctx.getImageData(x, y, w, h).data
  const counts = new Map<string, number>()

  for (let i = 0; i < data.length; i += 4) {
    const r = quantize(data[i] ?? 0)
    const g = quantize(data[i + 1] ?? 0)
    const b = quantize(data[i + 2] ?? 0)
    const key = `${r},${g},${b}`
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  const total = data.length / 4
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([key, count]) => {
      const parts = key.split(',')
      const r = Number(parts[0] ?? '0')
      const g = Number(parts[1] ?? '0')
      const b = Number(parts[2] ?? '0')
      return {
        hex: `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase(),
        pct: Math.round((count / total) * 100),
      }
    })
}

function onRegionMouseEnter(id: RegionId) {
  hoveredRegion.value = id
  topColors.value = sampleRegionColors(id)
}

function onRegionMouseLeave() {
  hoveredRegion.value = null
  topColors.value = []
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toggleGroup(group: string) {
  if (visibleGroups.value.has(group)) {
    visibleGroups.value.delete(group)
  } else {
    visibleGroups.value.add(group)
  }
}

function screenBadgeClass(screen: string | undefined): string {
  if (screen === 'character') return 'badge-char'
  if (screen === 'inventory') return 'badge-inv'
  if (screen === 'rewards') return 'badge-rewards'
  return 'badge-unknown'
}

const hoveredRegionInfo = () => REGIONS.find((r) => r.id === hoveredRegion.value) ?? null

onMounted(loadFixtures)
</script>

<template>
  <div class="screen-debug">
    <!-- ── Sidebar ── -->
    <aside class="fixture-list">
      <h2>Fixtures</h2>
      <ul>
        <li
          v-for="fixture in fixtures"
          :key="fixture.name"
          :class="{ selected: fixture.name === selectedName }"
          @click="selectFixture(fixture.name)"
        >
          <span class="fixture-name">{{ fixture.name }}</span>
          <span
            v-if="fixture.screen"
            class="screen-badge"
            :class="screenBadgeClass(fixture.screen)"
          >{{ fixture.screen }}</span>
          <span v-else class="screen-badge badge-unknown">?</span>
        </li>
      </ul>
    </aside>

    <!-- ── Main area ── -->
    <main class="editor-main">
      <div v-if="!selectedName" class="empty-state">Select a fixture from the list</div>

      <template v-else>
        <!-- Toggle controls -->
        <div class="controls">
          <span class="controls-label">Show regions:</span>
          <button
            v-for="group in ['character', 'inventory', 'rewards']"
            :key="group"
            class="toggle-btn"
            :class="[`toggle-${group}`, { active: visibleGroups.has(group) }]"
            @click="toggleGroup(group)"
          >
            {{ group }}
          </button>
        </div>

        <div class="image-wrap">
          <div class="image-container">
            <img
              ref="imgRef"
              :src="`/fixtures/${encodeURIComponent(selectedName)}.png`"
              :alt="selectedName"
              draggable="false"
              @load="onImageLoad"
            />

            <!-- SVG region overlay — viewBox 0 0 100 100 maps directly to % coords -->
            <svg
              v-if="imgLoaded"
              class="region-overlay"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <rect
                v-for="region in REGIONS"
                v-show="visibleGroups.has(region.group)"
                :key="region.id"
                :x="region.xMin"
                :y="region.yMin"
                :width="region.xMax - region.xMin"
                :height="region.yMax - region.yMin"
                :fill="region.color"
                :fill-opacity="hoveredRegion === region.id ? 0.35 : 0.18"
                :stroke="region.color"
                stroke-opacity="0.9"
                stroke-width="0.4"
                vector-effect="non-scaling-stroke"
                style="pointer-events: all; cursor: default"
                @mouseenter="onRegionMouseEnter(region.id)"
                @mouseleave="onRegionMouseLeave()"
              />
            </svg>
          </div>
        </div>

        <!-- ── Footer ── -->
        <footer class="debug-footer">
          <!-- Region legend -->
          <div class="legend">
            <div
              v-for="region in REGIONS"
              :key="region.id"
              class="legend-item"
              :class="{ 'legend-dim': !visibleGroups.has(region.group), 'legend-hover': hoveredRegion === region.id }"
            >
              <span class="legend-swatch" :style="{ background: region.color }" />
              <span class="legend-label">{{ region.label }}</span>
              <span class="legend-sub">{{ region.sublabel }}</span>
            </div>
          </div>

          <!-- Hover color readout -->
          <div v-if="hoveredRegionInfo() && topColors.length" class="hover-colors">
            <span class="hover-title">
              <strong>{{ hoveredRegionInfo()!.label }}</strong>
              <span class="hover-sub">{{ hoveredRegionInfo()!.sublabel }}</span>
            </span>
            <div class="color-grid">
              <div v-for="entry in topColors" :key="entry.hex" class="color-entry">
                <span class="color-swatch" :style="{ background: entry.hex }" />
                <span class="color-hex">{{ entry.hex }}</span>
                <span class="color-pct">{{ entry.pct }}%</span>
              </div>
            </div>
          </div>
        </footer>
      </template>
    </main>
  </div>
</template>

<style scoped>
.screen-debug {
  display: flex;
  height: 100vh;
  font-family: monospace;
  font-size: 13px;
  background: #1a1a1a;
  color: #e0e0e0;
}

/* ── Sidebar ── */
.fixture-list {
  width: 260px;
  flex-shrink: 0;
  overflow-y: auto;
  border-right: 1px solid #333;
  padding: 8px 0;
}

.fixture-list h2 {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #888;
  padding: 4px 12px 8px;
  margin: 0;
}

.fixture-list ul {
  list-style: none;
  margin: 0;
  padding: 0;
}

.fixture-list li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 5px 12px;
  cursor: pointer;
  gap: 6px;
  border-left: 3px solid transparent;
}

.fixture-list li:hover {
  background: #2a2a2a;
}

.fixture-list li.selected {
  background: #1e3a5f;
  border-left-color: #4a9eff;
}

.fixture-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
}

/* ── Screen type badges ── */
.screen-badge {
  flex-shrink: 0;
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 8px;
  font-weight: bold;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.badge-char {
  background: #3a2a00;
  color: #dbba7d;
  border: 1px solid #dbba7d55;
}

.badge-inv {
  background: #001a3a;
  color: #60a5fa;
  border: 1px solid #60a5fa55;
}

.badge-rewards {
  background: #2a1a4a;
  color: #a78bfa;
  border: 1px solid #a78bfa55;
}

.badge-unknown {
  background: #2a2a2a;
  color: #666;
  border: 1px solid #44444455;
}

/* ── Main area ── */
.editor-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.empty-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #555;
}

/* ── Controls ── */
.controls {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border-bottom: 1px solid #333;
  flex-shrink: 0;
}

.controls-label {
  color: #888;
  font-size: 11px;
}

.toggle-btn {
  padding: 3px 12px;
  border-radius: 4px;
  border: 1px solid #444;
  background: #2a2a2a;
  color: #888;
  cursor: pointer;
  font-size: 11px;
  font-family: monospace;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  opacity: 0.5;
  transition: opacity 0.1s;
}

.toggle-btn.active {
  opacity: 1;
}

.toggle-character.active {
  border-color: #dbba7d88;
  color: #dbba7d;
  background: #3a2a0055;
}

.toggle-inventory.active {
  border-color: #60a5fa88;
  color: #60a5fa;
  background: #001a3a55;
}

.toggle-rewards.active {
  border-color: #a78bfa88;
  color: #a78bfa;
  background: #2a1a4a55;
}

/* ── Image area ── */
.image-wrap {
  flex: 1;
  overflow: auto;
  padding: 16px;
}

.image-container {
  position: relative;
  display: inline-block;
  user-select: none;
}

.image-container img {
  display: block;
  max-width: 100%;
  max-height: calc(100vh - 180px);
  pointer-events: none;
}

.region-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  /* pointer-events: none on SVG itself; rects override with pointer-events: all */
  pointer-events: none;
}

/* ── Footer ── */
.debug-footer {
  border-top: 1px solid #333;
  background: #1a1a1a;
  flex-shrink: 0;
  padding: 10px 16px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 20px;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
  transition: opacity 0.15s;
}

.legend-item.legend-dim {
  opacity: 0.3;
}

.legend-item.legend-hover .legend-swatch {
  transform: scale(1.3);
}

.legend-swatch {
  width: 10px;
  height: 10px;
  border-radius: 2px;
  flex-shrink: 0;
  transition: transform 0.1s;
}

.legend-label {
  color: #ccc;
  font-size: 12px;
}

.legend-sub {
  color: #666;
  font-size: 11px;
}

.hover-colors {
  border-top: 1px solid #2a2a2a;
  padding-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.hover-title {
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: 12px;
}

.hover-title strong {
  color: #fff;
}

.hover-sub {
  color: #666;
  font-size: 11px;
}

.color-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
}

.color-entry {
  display: flex;
  align-items: center;
  gap: 5px;
}

.color-swatch {
  width: 14px;
  height: 14px;
  border-radius: 2px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  flex-shrink: 0;
}

.color-hex {
  font-size: 11px;
  color: #ccc;
  letter-spacing: 0.03em;
}

.color-pct {
  font-size: 11px;
  color: #666;
  min-width: 28px;
}
</style>
