<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { REGION_TEMPLATES, calculateAllRegionPositions } from '@/utils/ocr-region-templates'
import type { ArtifactScreenType } from '@/types/ocr-regions'

// ─── Interfaces ───────────────────────────────────────────────────────────────

interface FixtureMeta {
  name: string
  hasStarCoords: boolean
  screen?: string
}

interface FixtureData {
  expected: {
    screen?: string
    starCoords?: { x: number; y: number }
    [key: string]: unknown
  }
}

interface DisplayRegion {
  name: string
  /** 0–1 image fractions */
  x: number
  y: number
  width: number
  height: number
  color: string
  optional: boolean
}

// ─── Constants ────────────────────────────────────────────────────────────────

const COLOR_REQUIRED = '#4ade80'
const COLOR_OPTIONAL = '#60a5fa'

// ─── State ────────────────────────────────────────────────────────────────────

const fixtures = ref<FixtureMeta[]>([])
const selectedName = ref<string | null>(null)
const fixtureData = ref<FixtureData | null>(null)
const imgRef = ref<HTMLImageElement | null>(null)
const imgLoaded = ref(false)
const imgNaturalSize = ref({ w: 0, h: 0 })

const displayRegions = ref<DisplayRegion[]>([])
const hoveredRegion = ref<string | null>(null)

// ─── Watchers ─────────────────────────────────────────────────────────────────

watch(
  [imgLoaded, fixtureData] as const,
  ([loaded, data]) => {
    if (loaded && data) computeDisplayRegions()
  },
)

// ─── Computed ─────────────────────────────────────────────────────────────────

const screenType = computed((): ArtifactScreenType | null => {
  const s = fixtureData.value?.expected?.screen
  if (s === 'character' || s === 'inventory' || s === 'rewards') return s
  return null
})

const anchorPx = computed(() => {
  return fixtureData.value?.expected?.starCoords ?? null
})

const anchorSvg = computed(() => {
  const a = anchorPx.value
  const { w, h } = imgNaturalSize.value
  if (!a || w === 0 || h === 0) return null
  return { x: (a.x / w) * 100, y: (a.y / h) * 100 }
})

const hoveredInfo = computed(() => displayRegions.value.find((r) => r.name === hoveredRegion.value) ?? null)

const noRegionsReason = computed(() => {
  if (!screenType.value) return 'No OCR layout for this screen type'
  if (!anchorPx.value) return 'No anchor — starCoords missing'
  return null
})

// ─── Region computation ───────────────────────────────────────────────────────

function computeDisplayRegions() {
  const type = screenType.value
  const anchor = anchorPx.value
  const { w, h } = imgNaturalSize.value

  if (!type || !anchor || w === 0 || h === 0) {
    displayRegions.value = []
    return
  }

  const layout = REGION_TEMPLATES[type]
  const positions = calculateAllRegionPositions(layout, w, h, anchor)

  displayRegions.value = Object.values(layout.regions).map((region) => {
    const pos = positions.get(region.name)
    if (!pos) return null
    return {
      name: region.name,
      x: pos.x / w,
      y: pos.y / h,
      width: pos.width / w,
      height: pos.height / h,
      color: (region.optional ?? false) ? COLOR_OPTIONAL : COLOR_REQUIRED,
      optional: region.optional ?? false,
    }
  }).filter((r): r is DisplayRegion => r !== null)
}

// ─── Data fetching ────────────────────────────────────────────────────────────

async function loadFixtures() {
  const res = await fetch('/api/fixtures')
  fixtures.value = (await res.json()) as FixtureMeta[]
}

async function selectFixture(name: string) {
  if (name === selectedName.value) return
  selectedName.value = name
  imgLoaded.value = false
  imgNaturalSize.value = { w: 0, h: 0 }
  fixtureData.value = null
  displayRegions.value = []
  hoveredRegion.value = null

  const res = await fetch(`/fixtures/${encodeURIComponent(name)}.json`)
  fixtureData.value = (await res.json()) as FixtureData
}

function onImageLoad() {
  imgLoaded.value = true
  const img = imgRef.value
  if (img) imgNaturalSize.value = { w: img.naturalWidth, h: img.naturalHeight }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function screenBadgeClass(screen: string | undefined): string {
  if (screen === 'character') return 'badge-char'
  if (screen === 'inventory') return 'badge-inv'
  if (screen === 'rewards') return 'badge-rewards'
  return 'badge-unknown'
}

onMounted(loadFixtures)
</script>

<template>
  <div class="ocr-debug">
    <!-- ── Sidebar ── -->
    <aside class="fixture-list">
      <h2>Fixtures</h2>
      <ul>
        <li
          v-for="fixture in fixtures"
          :key="fixture.name"
          :class="{ selected: fixture.name === selectedName, 'no-coords': !fixture.hasStarCoords }"
          @click="selectFixture(fixture.name)"
        >
          <span class="fixture-name">{{ fixture.name }}</span>
          <span class="fixture-indicators">
            <span
              v-if="fixture.screen"
              class="screen-badge"
              :class="screenBadgeClass(fixture.screen)"
            >{{ fixture.screen }}</span>
            <span v-else class="screen-badge badge-unknown">?</span>
            <span
              class="star-indicator"
              :title="fixture.hasStarCoords ? 'Has starCoords' : 'Missing starCoords'"
            >{{ fixture.hasStarCoords ? '★' : '✗' }}</span>
          </span>
        </li>
      </ul>
    </aside>

    <!-- ── Main area ── -->
    <main class="editor-main">
      <div v-if="!selectedName" class="empty-state">Select a fixture from the list</div>

      <template v-else>
        <div class="editor-body">
          <div class="image-wrap">
            <div class="image-container">
              <img
                ref="imgRef"
                :src="`/fixtures/${encodeURIComponent(selectedName)}.png`"
                :alt="selectedName"
                draggable="false"
                @load="onImageLoad"
              />

              <svg
                v-if="imgLoaded && (displayRegions.length > 0 || anchorSvg)"
                class="region-overlay"
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <!-- Region rectangles (read-only) -->
                <g
                  v-for="region in displayRegions"
                  :key="region.name"
                >
                  <rect
                    :x="region.x * 100"
                    :y="region.y * 100"
                    :width="region.width * 100"
                    :height="region.height * 100"
                    :fill="region.color"
                    :fill-opacity="hoveredRegion === region.name ? 0.25 : 0.1"
                    :stroke="region.color"
                    :stroke-opacity="hoveredRegion === region.name ? 0.9 : 0.5"
                    stroke-width="1"
                    vector-effect="non-scaling-stroke"
                    style="pointer-events: all; cursor: default"
                    @mouseenter="hoveredRegion = region.name"
                    @mouseleave="hoveredRegion = null"
                  />
                  <!-- Region label -->
                  <text
                    :x="region.x * 100 + 0.3"
                    :y="region.y * 100 + region.height * 100 - 0.3"
                    :fill="region.color"
                    fill-opacity="0.8"
                    font-size="0.9"
                    font-family="monospace"
                    style="pointer-events: none; user-select: none"
                  >{{ region.name }}</text>
                </g>

                <!-- Anchor crosshair (star position, read-only) -->
                <g v-if="anchorSvg">
                  <line
                    :x1="anchorSvg.x - 1.5" :y1="anchorSvg.y"
                    :x2="anchorSvg.x + 1.5" :y2="anchorSvg.y"
                    stroke="#fff" stroke-width="1.5" stroke-opacity="0.85"
                    vector-effect="non-scaling-stroke"
                  />
                  <line
                    :x1="anchorSvg.x" :y1="anchorSvg.y - 1.5"
                    :x2="anchorSvg.x" :y2="anchorSvg.y + 1.5"
                    stroke="#fff" stroke-width="1.5" stroke-opacity="0.85"
                    vector-effect="non-scaling-stroke"
                  />
                  <circle
                    :cx="anchorSvg.x" :cy="anchorSvg.y" r="0.25"
                    fill="#fff" fill-opacity="0.85"
                    vector-effect="non-scaling-stroke"
                  />
                </g>
              </svg>
            </div>
          </div>
        </div>

        <!-- ── Footer ── -->
        <footer class="debug-footer">
          <div class="controls-row">
            <span class="source-badge source-template">⬤ template</span>

            <div class="spacer" />

            <template v-if="hoveredInfo">
              <span class="legend-swatch" :style="{ background: hoveredInfo.color }" />
              <strong>{{ hoveredInfo.name }}</strong>
              <span v-if="hoveredInfo.optional" class="badge-optional">optional</span>
              <span class="sep">│</span>
              <span class="muted">
                x {{ (hoveredInfo.x * 100).toFixed(1) }}%
                y {{ (hoveredInfo.y * 100).toFixed(1) }}%
                &nbsp;{{ (hoveredInfo.width * 100).toFixed(1) }}×{{ (hoveredInfo.height * 100).toFixed(1) }}%
              </span>
            </template>
            <span v-else-if="noRegionsReason" class="warn">{{ noRegionsReason }}</span>
            <span v-else class="muted">hover a region to inspect</span>

            <div class="spacer" />
          </div>
        </footer>
      </template>
    </main>
  </div>
</template>

<style scoped>
.ocr-debug {
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

.fixture-list li:hover { background: #2a2a2a; }
.fixture-list li.selected { background: #1e3a5f; border-left-color: #4a9eff; }
.fixture-list li.no-coords .fixture-name { color: #f5a623; }

.fixture-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
}

.fixture-indicators {
  display: flex;
  align-items: center;
  gap: 5px;
  flex-shrink: 0;
}

.star-indicator { font-size: 11px; color: #666; }
.fixture-list li.no-coords .star-indicator { color: #f5a623; }

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

.badge-char    { background: #3a2a00; color: #dbba7d; border: 1px solid #dbba7d55; }
.badge-inv     { background: #001a3a; color: #60a5fa; border: 1px solid #60a5fa55; }
.badge-rewards { background: #2a1a4a; color: #a78bfa; border: 1px solid #a78bfa55; }
.badge-unknown { background: #2a2a2a; color: #666;    border: 1px solid #44444455; }

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

.editor-body {
  flex: 1;
  display: flex;
  overflow: hidden;
}

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
  max-height: calc(100vh - 120px);
  pointer-events: none;
}

.region-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: all;
  touch-action: none;
}

/* ── Footer ── */
.debug-footer {
  border-top: 1px solid #333;
  background: #1a1a1a;
  flex-shrink: 0;
  padding: 8px 16px;
}

.controls-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  flex-wrap: wrap;
}

.controls-row strong { color: #fff; }

.spacer { flex: 1; }
.sep    { color: #444; }
.muted  { color: #555; }
.warn   { color: #f5a623; }

.legend-swatch {
  width: 10px;
  height: 10px;
  border-radius: 2px;
  flex-shrink: 0;
  display: inline-block;
}

/* Source badges */
.source-badge {
  font-size: 10px;
  padding: 2px 8px;
  border-radius: 8px;
  font-weight: bold;
}

.source-template { background: #2a2a00; color: #fbbf24; border: 1px solid #fbbf2455; }

.badge-optional {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 8px;
  background: #2a2a1a;
  color: #aaa;
  border: 1px solid #55555544;
}
</style>
