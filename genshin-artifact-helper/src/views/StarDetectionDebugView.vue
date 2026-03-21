<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { REGION_TEMPLATES } from '@/utils/ocr-region-templates'
import { debugProjectionDetect, defaultStarDetectionSettings } from '@/utils/star-detection'
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
    rarity?: number
    [key: string]: unknown
  }
}

type DebugResult = ReturnType<typeof debugProjectionDetect>

// ─── State ────────────────────────────────────────────────────────────────────

const fixtures = ref<FixtureMeta[]>([])
const selectedName = ref<string | null>(null)
const fixtureData = ref<FixtureData | null>(null)
const imgRef = ref<HTMLImageElement | null>(null)
const imgLoaded = ref(false)
const imgNaturalSize = ref({ w: 0, h: 0 })
const debugResult = ref<DebugResult | null>(null)

let resizeObserver: ResizeObserver | null = null

watch(imgRef, (img, _, onCleanup) => {
  resizeObserver?.disconnect()
  if (!img) return
  resizeObserver = new ResizeObserver(() => {})
  resizeObserver.observe(img)
  onCleanup(() => resizeObserver?.disconnect())
})

onUnmounted(() => resizeObserver?.disconnect())

// Auto-run detection when both image and fixture data are ready
watch([imgLoaded, fixtureData], ([loaded]) => {
  if (loaded && fixtureData.value && screenType.value) runDetection()
})

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

// ─── Detection overlays ───────────────────────────────────────────────────────

/** Column blob regions, each tagged with its filter stage */
const colRegionsSvg = computed(() => {
  const d = debugResult.value
  const { w, h } = imgNaturalSize.value
  const sb = searchBounds.value
  if (!d || w === 0 || h === 0 || !sb) return []

  const validatedSet = new Set(d.validatedRegions.map(r => r.start))
  const starSet = new Set(d.starRegions.map(r => r.start))

  return d.colRegions.map(r => {
    const x = (r.start / w) * 100
    const width = ((r.end - r.start + 1) / w) * 100
    const stage: 'validated' | 'star' | 'col' = validatedSet.has(r.start)
      ? 'validated'
      : starSet.has(r.start)
        ? 'star'
        : 'col'
    return { x, y: sb.y, width, height: sb.height, stage }
  })
})

/** Row band regions in 0–100 SVG coords */
const rowRegionsSvg = computed(() => {
  const d = debugResult.value
  const { h } = imgNaturalSize.value
  const sb = searchBounds.value
  if (!d || h === 0 || !sb) return []
  return d.rowRegions.map(r => ({
    x: sb.x,
    y: (r.start / h) * 100,
    width: sb.width,
    height: ((r.end - r.start + 1) / h) * 100,
  }))
})

/** Peak Y as a 0–100 SVG coordinate */
const peakYSvg = computed(() => {
  const d = debugResult.value
  const { h } = imgNaturalSize.value
  if (!d || d.peakY === null || h === 0) return null
  return (d.peakY / h) * 100
})

/** Detected star center in 0–100 SVG coords */
const detectedCenterSvg = computed(() => {
  const d = debugResult.value
  const { w, h } = imgNaturalSize.value
  if (!d?.result || w === 0 || h === 0) return null
  return {
    x: (d.result.center.x / w) * 100,
    y: (d.result.center.y / h) * 100,
    px: d.result.center,
    count: d.result.count,
  }
})

/** Stage-specific failure diagnosis when detection returns null */
const detectionFailureInfo = computed(() => {
  const d = debugResult.value
  if (!d || d.result) return null

  // Max star-colored pixels in any single column — tells us if the color was seen at all
  const colHistMax = d.colHist.reduce((m, v) => Math.max(m, v), 0)
  // How many columns had at least one star-colored pixel
  const colsWithPixels = d.colHist.reduce((n, v) => n + (v > 0 ? 1 : 0), 0)

  if (d.colRegions.length === 0) {
    return {
      stage: 2,
      label: 'no col blobs',
      reason: colHistMax === 0
        ? 'zero star-colored pixels in search region — check color or bounds'
        : `${colsWithPixels} col(s) have star pixels but all blobs filtered — max: ${colHistMax}px tall (too narrow/wide for screenHeight)`,
      colHistMax,
      colsWithPixels,
    }
  }

  if (d.rowRegions.length === 0) {
    return {
      stage: 4,
      label: 'no row bands',
      reason: `${d.colRegions.length} col blob(s) found but no horizontal band detected — pixels may be vertically scattered`,
      colHistMax,
      colsWithPixels,
    }
  }

  if (d.starRegions.length === 0) {
    return {
      stage: 6,
      label: 'Y-band failed',
      reason: `${d.colRegions.length} col blob(s) and peakY=${d.peakY}px found but no blob has star pixels within ±${defaultStarDetectionSettings.projYWindowPx}px of peakY`,
      colHistMax,
      colsWithPixels,
    }
  }

  return {
    stage: 7,
    label: 'spacing failed',
    reason: `${d.starRegions.length} confirmed blob(s) but center-to-center spacing is inconsistent (tolerance: ±${(defaultStarDetectionSettings.projSpacingTolerance * 100).toFixed(0)}%)`,
    colHistMax,
    colsWithPixels,
  }
})

/** Detection result compared against expected rarity + starCoords */
const detectionMatch = computed(() => {
  const d = debugResult.value
  const expected = fixtureData.value?.expected
  if (!d || !expected) return null

  if (!d.result) return { status: 'no-detection' as const }

  const expectedRarity = expected.rarity as number | undefined
  const countOk = expectedRarity !== undefined ? d.result.count === expectedRarity : null

  const sc = expected.starCoords
  const posOk = sc
    ? Math.abs(d.result.center.x - sc.x) <= 10 && Math.abs(d.result.center.y - sc.y) <= 10
    : null

  const status =
    countOk === false
      ? ('count-mismatch' as const)
      : posOk === false
        ? ('pos-mismatch' as const)
        : ('ok' as const)

  return { status, count: d.result.count, center: d.result.center, countOk, posOk }
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
  fixtureData.value = null
  debugResult.value = null
  const res = await fetch(`/fixtures/${encodeURIComponent(name)}.json`)
  fixtureData.value = (await res.json()) as FixtureData
}

function onImageLoad() {
  imgLoaded.value = true
  const img = imgRef.value
  if (img) imgNaturalSize.value = { w: img.naturalWidth, h: img.naturalHeight }
}

function runDetection() {
  const img = imgRef.value
  const st = screenType.value
  if (!img || !st) return

  const w = img.naturalWidth
  const h = img.naturalHeight
  const { starSearchBounds } = REGION_TEMPLATES[st]

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return
  ctx.drawImage(img, 0, 0)
  const imageData = ctx.getImageData(0, 0, w, h)

  const pixelBounds = {
    xMin: Math.round(starSearchBounds.xMin * w),
    xMax: Math.round(starSearchBounds.xMax * w),
    yMin: Math.round(starSearchBounds.yMin * h),
    yMax: Math.round(starSearchBounds.yMax * h),
  }

  const effectiveH = Math.min(h, w / (16 / 9))
  debugResult.value = debugProjectionDetect(
    imageData.data,
    w,
    h,
    effectiveH,
    defaultStarDetectionSettings,
    pixelBounds,
  )
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

              <!-- Column regions — color-coded by filter stage -->
              <rect
                v-for="(r, i) in colRegionsSvg"
                :key="`col-${i}`"
                :x="r.x"
                :y="r.y"
                :width="r.width"
                :height="r.height"
                :fill="r.stage === 'validated' ? '#4ade80' : r.stage === 'star' ? '#fb923c' : '#6b7280'"
                :fill-opacity="r.stage === 'validated' ? 0.35 : r.stage === 'star' ? 0.3 : 0.15"
                :stroke="r.stage === 'validated' ? '#4ade80' : r.stage === 'star' ? '#fb923c' : '#6b7280'"
                :stroke-opacity="r.stage === 'col' ? 0.4 : 0.9"
                stroke-width="0.5"
                vector-effect="non-scaling-stroke"
              />

              <!-- Row band regions -->
              <rect
                v-for="(r, i) in rowRegionsSvg"
                :key="`row-${i}`"
                :x="r.x"
                :y="r.y"
                :width="r.width"
                :height="r.height"
                fill="#93c5fd"
                fill-opacity="0.2"
                stroke="#93c5fd"
                stroke-opacity="0.6"
                stroke-width="0.4"
                vector-effect="non-scaling-stroke"
              />

              <!-- Peak Y dashed line -->
              <line
                v-if="peakYSvg !== null && searchBounds"
                :x1="searchBounds.x"
                :y1="peakYSvg"
                :x2="searchBounds.x + searchBounds.width"
                :y2="peakYSvg"
                stroke="#fbbf24"
                stroke-width="0.6"
                stroke-dasharray="1.5 1"
                vector-effect="non-scaling-stroke"
              />

              <!-- Detected star center crosshair (magenta) -->
              <g v-if="detectedCenterSvg">
                <line
                  :x1="detectedCenterSvg.x - 2.5"
                  :y1="detectedCenterSvg.y"
                  :x2="detectedCenterSvg.x + 2.5"
                  :y2="detectedCenterSvg.y"
                  stroke="#e879f9"
                  stroke-width="1.5"
                  vector-effect="non-scaling-stroke"
                />
                <line
                  :x1="detectedCenterSvg.x"
                  :y1="detectedCenterSvg.y - 2.5"
                  :x2="detectedCenterSvg.x"
                  :y2="detectedCenterSvg.y + 2.5"
                  stroke="#e879f9"
                  stroke-width="1.5"
                  vector-effect="non-scaling-stroke"
                />
                <circle
                  :cx="detectedCenterSvg.x"
                  :cy="detectedCenterSvg.y"
                  r="0.3"
                  fill="#e879f9"
                  vector-effect="non-scaling-stroke"
                />
              </g>

              <!-- Expected starCoords crosshair -->
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
              <span class="label">expected:</span>
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

          <!-- Detection result -->
          <div class="footer-row">
            <template v-if="debugResult">
              <template v-if="detectedCenterSvg">
                <span class="label">detected:</span>
                <span class="value mono detected-count">{{ detectedCenterSvg.count }}★</span>
                <span class="value mono">px {{ detectedCenterSvg.px.x }}, {{ detectedCenterSvg.px.y }}</span>
                <span class="sep">│</span>
                <span
                  class="bounds-badge"
                  :class="{
                    'bounds-ok': detectionMatch?.status === 'ok',
                    'bounds-warn': detectionMatch?.status === 'pos-mismatch',
                    'bounds-fail': detectionMatch?.status === 'count-mismatch',
                  }"
                >
                  <template v-if="detectionMatch?.status === 'ok'">✓ match</template>
                  <template v-else-if="detectionMatch?.status === 'pos-mismatch'">~ pos off</template>
                  <template v-else>✗ wrong count</template>
                </span>
              </template>
              <template v-else>
                <span class="label">detected:</span>
                <span class="bounds-badge bounds-fail">✗ no detection</span>
                <template v-if="detectionFailureInfo">
                  <span class="sep">│</span>
                  <span class="failure-stage">stage {{ detectionFailureInfo.stage }}/7</span>
                  <span class="failure-label bounds-badge bounds-warn">{{ detectionFailureInfo.label }}</span>
                  <span class="sep">│</span>
                  <span class="muted failure-reason">{{ detectionFailureInfo.reason }}</span>
                </template>
              </template>
            </template>
            <span v-else class="muted">detection pending…</span>
          </div>

          <!-- Legend -->
          <div v-if="debugResult" class="footer-row legend-row">
            <span class="legend-item">
              <span class="legend-swatch" style="background:#4ade80"></span>validated
            </span>
            <span class="legend-item">
              <span class="legend-swatch" style="background:#fb923c"></span>Y-confirmed
            </span>
            <span class="legend-item">
              <span class="legend-swatch" style="background:#6b7280"></span>col blob
            </span>
            <span class="legend-item">
              <span class="legend-swatch" style="background:#93c5fd"></span>row band
            </span>
            <span class="legend-item">
              <span class="legend-swatch" style="background:#fbbf24"></span>peakY
            </span>
            <span class="legend-item">
              <span class="legend-swatch" style="background:#e879f9"></span>detected
            </span>
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
  max-height: calc(100vh - 130px);
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

.detected-count {
  color: #e879f9;
}

.failure-stage {
  font-size: 11px;
  color: #888;
  white-space: nowrap;
}

.failure-label {
  white-space: nowrap;
}

.failure-reason {
  font-size: 11px;
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

.bounds-warn {
  background: #3a2a00;
  color: #fb923c;
  border: 1px solid #fb923c55;
}

.bounds-fail {
  background: #3a1a1a;
  color: #f44336;
  border: 1px solid #f4433655;
}

/* ── Legend ── */
.legend-row {
  padding-top: 2px;
  border-top: 1px solid #2a2a2a;
  gap: 12px;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: #888;
}

.legend-swatch {
  width: 10px;
  height: 10px;
  border-radius: 2px;
  flex-shrink: 0;
  opacity: 0.85;
}
</style>
