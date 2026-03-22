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
  <div class="flex h-screen font-mono text-[13px] bg-dark-900 text-[#e0e0e0]">
    <!-- ── Sidebar ── -->
    <aside class="w-[260px] shrink-0 overflow-y-auto border-r border-dark-700 py-2">
      <h2 class="text-[11px] uppercase tracking-widest text-gray-mid px-3 pt-1 pb-2 m-0">Fixtures</h2>
      <ul class="list-none m-0 p-0">
        <li
          v-for="fixture in fixtures"
          :key="fixture.name"
          class="flex items-center justify-between px-3 py-1.5 cursor-pointer gap-1.5 border-l-[3px] border-transparent hover:bg-dark-800"
          :class="{ 'bg-[#1e3a5f] border-l-[#4a9eff]': fixture.name === selectedName }"
          @click="selectFixture(fixture.name)"
        >
          <span class="truncate flex-1 min-w-0" :class="{ 'text-[#f5a623]': !fixture.hasStarCoords }">{{ fixture.name }}</span>
          <span class="flex items-center gap-1 shrink-0">
            <span v-if="fixture.screen" class="screen-badge" :class="screenBadgeClass(fixture.screen)">{{ fixture.screen }}</span>
            <span v-else class="screen-badge badge-unknown">?</span>
            <span class="text-[11px]" :class="fixture.hasStarCoords ? 'text-dark-500' : 'text-[#f5a623]'" :title="fixture.hasStarCoords ? 'Has starCoords' : 'Missing starCoords'">{{ fixture.hasStarCoords ? '★' : '✗' }}</span>
          </span>
        </li>
      </ul>
    </aside>

    <!-- ── Main area ── -->
    <main class="flex-1 flex flex-col overflow-hidden">
      <div v-if="!selectedName" class="flex-1 flex items-center justify-center text-dark-500">Select a fixture from the list</div>

      <template v-else>
        <div class="flex-1 overflow-auto p-4">
          <div class="relative inline-block select-none">
            <img
              ref="imgRef"
              :src="`/fixtures/${encodeURIComponent(selectedName)}.png`"
              :alt="selectedName"
              class="block max-w-full pointer-events-none"
              style="max-height: calc(100vh - 130px)"
              draggable="false"
              @load="onImageLoad"
            />

            <svg
              v-if="imgLoaded"
              class="absolute inset-0 w-full h-full pointer-events-none"
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
        <footer class="border-t border-dark-700 bg-dark-900 shrink-0 px-4 py-2.5 flex flex-col gap-1.5">
          <div v-if="searchBounds" class="flex items-center gap-2 text-xs flex-wrap">
            <span class="text-gray-mid">Layout:</span>
            <span class="text-[#e0e0e0]">{{ searchBounds.layoutId }}</span>
            <span class="text-dark-600">│</span>
            <span class="text-gray-mid">starSearchBounds:</span>
            <span class="text-[#e0e0e0] tracking-[0.03em]">
              x {{ (searchBounds.raw.xMin * 100).toFixed(0) }}–{{ (searchBounds.raw.xMax * 100).toFixed(0) }}%
              &nbsp; y {{ (searchBounds.raw.yMin * 100).toFixed(0) }}–{{ (searchBounds.raw.yMax * 100).toFixed(0) }}%
            </span>
          </div>
          <div v-else class="flex items-center gap-2 text-xs text-dark-500">
            No starSearchBounds — screen type
            <span class="screen-badge badge-unknown ml-1">{{ fixtureData?.expected?.screen ?? '?' }}</span>
            has no layout
          </div>

          <div class="flex items-center gap-2 text-xs flex-wrap">
            <template v-if="starPct">
              <span class="text-gray-mid">expected:</span>
              <span class="text-[#e0e0e0] tracking-[0.03em]">px {{ starPct.px.x }}, {{ starPct.px.y }}</span>
              <span class="text-dark-500">({{ starPct.pctLabel }})</span>
              <span class="text-dark-600">│</span>
              <span class="text-[11px] px-2 py-0.5 rounded-full font-bold" :class="withinBounds ? 'bg-[#1a3a1a] text-green-500 border border-green-500/30' : 'bg-[#3a1a1a] text-red-500 border border-red-500/30'">
                {{ withinBounds ? '✓ within bounds' : '✗ outside bounds' }}
              </span>
            </template>
            <span v-else class="text-dark-500">no starCoords in fixture</span>
          </div>

          <div class="flex items-center gap-2 text-xs flex-wrap">
            <template v-if="debugResult">
              <template v-if="detectedCenterSvg">
                <span class="text-gray-mid">detected:</span>
                <span class="text-[#e879f9] tracking-[0.03em]">{{ detectedCenterSvg.count }}★</span>
                <span class="text-[#e0e0e0] tracking-[0.03em]">px {{ detectedCenterSvg.px.x }}, {{ detectedCenterSvg.px.y }}</span>
                <span class="text-dark-600">│</span>
                <span class="text-[11px] px-2 py-0.5 rounded-full font-bold"
                  :class="{
                    'bg-[#1a3a1a] text-green-500 border border-green-500/30': detectionMatch?.status === 'ok',
                    'bg-[#3a2a00] text-orange-400 border border-orange-400/30': detectionMatch?.status === 'pos-mismatch',
                    'bg-[#3a1a1a] text-red-500 border border-red-500/30': detectionMatch?.status === 'count-mismatch',
                  }"
                >
                  <template v-if="detectionMatch?.status === 'ok'">✓ match</template>
                  <template v-else-if="detectionMatch?.status === 'pos-mismatch'">~ pos off</template>
                  <template v-else>✗ wrong count</template>
                </span>
              </template>
              <template v-else>
                <span class="text-gray-mid">detected:</span>
                <span class="text-[11px] px-2 py-0.5 rounded-full font-bold bg-[#3a1a1a] text-red-500 border border-red-500/30">✗ no detection</span>
                <template v-if="detectionFailureInfo">
                  <span class="text-dark-600">│</span>
                  <span class="text-[11px] text-gray-mid whitespace-nowrap">stage {{ detectionFailureInfo.stage }}/7</span>
                  <span class="text-[11px] px-2 py-0.5 rounded-full font-bold bg-[#3a2a00] text-orange-400 border border-orange-400/30 whitespace-nowrap">{{ detectionFailureInfo.label }}</span>
                  <span class="text-dark-600">│</span>
                  <span class="text-[11px] text-dark-500">{{ detectionFailureInfo.reason }}</span>
                </template>
              </template>
            </template>
            <span v-else class="text-dark-500">detection pending…</span>
          </div>

          <div v-if="debugResult" class="flex items-center gap-3 text-[11px] text-gray-mid pt-0.5 border-t border-dark-800">
            <span v-for="[color, label] in [['#4ade80','validated'],['#fb923c','Y-confirmed'],['#6b7280','col blob'],['#93c5fd','row band'],['#fbbf24','peakY'],['#e879f9','detected']] as const" :key="label" class="flex items-center gap-1">
              <span class="w-2.5 h-2.5 rounded-sm shrink-0 opacity-85" :style="{ background: color }" />{{ label }}
            </span>
          </div>
        </footer>
      </template>
    </main>
  </div>
</template>
