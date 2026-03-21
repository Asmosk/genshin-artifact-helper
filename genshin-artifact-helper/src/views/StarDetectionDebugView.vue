<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { REGION_TEMPLATES } from '@/utils/ocr-region-templates'
import type { ArtifactScreenType } from '@/types/ocr-regions'

interface FixtureMeta {
  name: string
  hasStarCoords: boolean
  screen?: string
}

interface StarCoords {
  x: number
  y: number
}

interface FixtureData {
  expected: {
    screen?: string
    starCoords?: StarCoords
    [key: string]: unknown
  }
}

// ─── State ────────────────────────────────────────────────────────────────────

const fixtures = ref<FixtureMeta[]>([])
const selectedName = ref<string | null>(null)
const fixtureData = ref<FixtureData | null>(null)
const imgRef = ref<HTMLImageElement | null>(null)
const imgLoaded = ref(false)
const imgNaturalSize = ref({ w: 0, h: 0 })

let resizeObserver: ResizeObserver | null = null

watch(imgRef, (img, _, onCleanup) => {
  resizeObserver?.disconnect()
  if (!img) return
  resizeObserver = new ResizeObserver(() => {})
  resizeObserver.observe(img)
  onCleanup(() => resizeObserver?.disconnect())
})

onUnmounted(() => resizeObserver?.disconnect())

// ─── Computed ─────────────────────────────────────────────────────────────────

const screenType = computed((): ArtifactScreenType | null => {
  const s = fixtureData.value?.expected?.screen
  if (s === 'character' || s === 'inventory' || s === 'rewards') return s
  return null
})

/** starSearchBounds in 0–100 SVG viewBox coords */
const searchBounds = computed(() => {
  if (!screenType.value) return null
  const { starSearchBounds: b, id } = REGION_TEMPLATES[screenType.value]
  return {
    x: b.xMin * 100,
    y: b.yMin * 100,
    width: (b.xMax - b.xMin) * 100,
    height: (b.yMax - b.yMin) * 100,
    raw: b,
    layoutId: id,
  }
})

/** starCoords converted from pixels to 0–100 SVG viewBox coords */
const starPct = computed(() => {
  const sc = fixtureData.value?.expected?.starCoords
  const { w, h } = imgNaturalSize.value
  if (!sc || w === 0 || h === 0) return null
  return {
    x: (sc.x / w) * 100,
    y: (sc.y / h) * 100,
    px: sc,
    pctLabel: `${((sc.x / w) * 100).toFixed(1)}% × ${((sc.y / h) * 100).toFixed(1)}%`,
  }
})

/** Whether starCoords falls inside starSearchBounds */
const withinBounds = computed((): boolean | null => {
  const p = starPct.value
  const b = searchBounds.value
  if (!p || !b) return null
  return p.x >= b.raw.xMin * 100 && p.x <= b.raw.xMax * 100 &&
         p.y >= b.raw.yMin * 100 && p.y <= b.raw.yMax * 100
})

const boundsColor = computed(() => {
  if (screenType.value === 'character') return '#dbba7d'
  if (screenType.value === 'inventory') return '#60a5fa'
  if (screenType.value === 'rewards') return '#a78bfa'
  return '#888'
})

const crosshairColor = computed(() => {
  if (withinBounds.value === true) return '#22c55e'
  if (withinBounds.value === false) return '#ef4444'
  return '#fff'
})

// ─── Data ─────────────────────────────────────────────────────────────────────

async function loadFixtures() {
  const res = await fetch('/api/fixtures')
  fixtures.value = (await res.json()) as FixtureMeta[]
}

async function selectFixture(name: string) {
  if (name === selectedName.value) return
  selectedName.value = name
  imgLoaded.value = false
  imgNaturalSize.value = { w: 0, h: 0 }
  const res = await fetch(`/fixtures/${encodeURIComponent(name)}.json`)
  fixtureData.value = (await res.json()) as FixtureData
}

function onImageLoad() {
  imgLoaded.value = true
  const img = imgRef.value
  if (img) imgNaturalSize.value = { w: img.naturalWidth, h: img.naturalHeight }
}

function screenBadgeClass(screen: string | undefined): string {
  if (screen === 'character') return 'badge-char'
  if (screen === 'inventory') return 'badge-inv'
  if (screen === 'rewards') return 'badge-rewards'
  return 'badge-unknown'
}

onMounted(loadFixtures)
</script>

<template>
  <div class="star-debug">
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
              v-if="imgLoaded"
              class="region-overlay"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <!-- starSearchBounds rectangle -->
              <rect
                v-if="searchBounds"
                :x="searchBounds.x"
                :y="searchBounds.y"
                :width="searchBounds.width"
                :height="searchBounds.height"
                :fill="boundsColor"
                fill-opacity="0.12"
                :stroke="boundsColor"
                stroke-opacity="0.85"
                stroke-width="0.5"
                vector-effect="non-scaling-stroke"
              />

              <!-- starCoords crosshair -->
              <g v-if="starPct">
                <!-- Horizontal arm -->
                <line
                  :x1="starPct.x - 2"
                  :y1="starPct.y"
                  :x2="starPct.x + 2"
                  :y2="starPct.y"
                  :stroke="crosshairColor"
                  stroke-width="1.5"
                  vector-effect="non-scaling-stroke"
                />
                <!-- Vertical arm -->
                <line
                  :x1="starPct.x"
                  :y1="starPct.y - 2"
                  :x2="starPct.x"
                  :y2="starPct.y + 2"
                  :stroke="crosshairColor"
                  stroke-width="1.5"
                  vector-effect="non-scaling-stroke"
                />
                <!-- Centre dot -->
                <circle
                  :cx="starPct.x"
                  :cy="starPct.y"
                  r="0.3"
                  :fill="crosshairColor"
                  vector-effect="non-scaling-stroke"
                />
              </g>
            </svg>
          </div>
        </div>

        <!-- ── Footer ── -->
        <footer class="debug-footer">
          <!-- Bounds info -->
          <div v-if="searchBounds" class="footer-row">
            <span class="label">Layout:</span>
            <span class="value">{{ searchBounds.layoutId }}</span>
            <span class="sep">│</span>
            <span class="label">starSearchBounds:</span>
            <span class="value mono">
              x {{ (searchBounds.raw.xMin * 100).toFixed(0) }}–{{ (searchBounds.raw.xMax * 100).toFixed(0) }}%
              &nbsp; y {{ (searchBounds.raw.yMin * 100).toFixed(0) }}–{{ (searchBounds.raw.yMax * 100).toFixed(0) }}%
            </span>
          </div>
          <div v-else class="footer-row muted">
            No starSearchBounds — screen type
            <span class="screen-badge badge-unknown" style="margin-left:4px">
              {{ fixtureData?.expected?.screen ?? '?' }}
            </span>
            has no layout
          </div>

          <!-- starCoords info -->
          <div class="footer-row">
            <template v-if="starPct">
              <span class="label">starCoords:</span>
              <span class="value mono">px {{ starPct.px.x }}, {{ starPct.px.y }}</span>
              <span class="value muted">({{ starPct.pctLabel }})</span>
              <span class="sep">│</span>
              <span
                class="bounds-badge"
                :class="withinBounds ? 'bounds-ok' : 'bounds-fail'"
              >
                {{ withinBounds ? '✓ within bounds' : '✗ outside bounds' }}
              </span>
            </template>
            <span v-else class="muted">no starCoords in fixture</span>
          </div>
        </footer>
      </template>
    </main>
  </div>
</template>

<style scoped>
.star-debug {
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

.fixture-list li.no-coords .fixture-name {
  color: #f5a623;
}

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

.star-indicator {
  font-size: 11px;
  color: #666;
}

.fixture-list li.no-coords .star-indicator {
  color: #f5a623;
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
  max-height: calc(100vh - 100px);
  pointer-events: none;
}

.region-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
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

.footer-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  flex-wrap: wrap;
}

.label {
  color: #888;
}

.value {
  color: #e0e0e0;
}

.mono {
  letter-spacing: 0.03em;
}

.sep {
  color: #444;
}

.muted {
  color: #555;
}

.bounds-badge {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 10px;
  font-weight: bold;
}

.bounds-ok {
  background: #1a3a1a;
  color: #4caf50;
  border: 1px solid #4caf5055;
}

.bounds-fail {
  background: #3a1a1a;
  color: #f44336;
  border: 1px solid #f4433655;
}
</style>
