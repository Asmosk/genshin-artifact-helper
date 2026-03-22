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
  <div class="flex h-screen font-mono text-[13px] bg-dark-900 text-[#e0e0e0]">
    <!-- ── Sidebar ── -->
    <aside class="w-[260px] shrink-0 overflow-y-auto border-r border-dark-700 py-2">
      <h2 class="text-[11px] uppercase tracking-widest text-gray-mid px-3 pt-1 pb-2 m-0">Fixtures</h2>
      <ul class="list-none m-0 p-0">
        <li
          v-for="fixture in fixtures"
          :key="fixture.name"
          class="flex items-center justify-between px-3 py-1.5 cursor-pointer gap-1.5 border-l-[3px] border-transparent hover:bg-dark-800"
          :class="{
            'bg-[#1e3a5f] border-l-[#4a9eff]': fixture.name === selectedName,
          }"
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
        <div class="flex-1 flex overflow-hidden">
          <div class="flex-1 overflow-auto p-4">
            <div class="relative inline-block select-none">
              <img
                ref="imgRef"
                :src="`/fixtures/${encodeURIComponent(selectedName)}.png`"
                :alt="selectedName"
                class="block max-w-full pointer-events-none"
                style="max-height: calc(100vh - 120px)"
                draggable="false"
                @load="onImageLoad"
              />

              <svg
                v-if="imgLoaded && (displayRegions.length > 0 || anchorSvg)"
                class="absolute inset-0 w-full h-full pointer-events-all touch-none"
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <g v-for="region in displayRegions" :key="region.name">
                  <rect
                    :x="region.x * 100" :y="region.y * 100"
                    :width="region.width * 100" :height="region.height * 100"
                    :fill="region.color"
                    :fill-opacity="hoveredRegion === region.name ? 0.25 : 0.1"
                    :stroke="region.color"
                    :stroke-opacity="hoveredRegion === region.name ? 0.9 : 0.5"
                    stroke-width="1" vector-effect="non-scaling-stroke"
                    style="pointer-events: all; cursor: default"
                    @mouseenter="hoveredRegion = region.name"
                    @mouseleave="hoveredRegion = null"
                  />
                  <text
                    :x="region.x * 100 + 0.3" :y="region.y * 100 + region.height * 100 - 0.3"
                    :fill="region.color" fill-opacity="0.8" font-size="0.9" font-family="monospace"
                    style="pointer-events: none; user-select: none"
                  >{{ region.name }}</text>
                </g>
                <g v-if="anchorSvg">
                  <line :x1="anchorSvg.x - 1.5" :y1="anchorSvg.y" :x2="anchorSvg.x + 1.5" :y2="anchorSvg.y" stroke="#fff" stroke-width="1.5" stroke-opacity="0.85" vector-effect="non-scaling-stroke" />
                  <line :x1="anchorSvg.x" :y1="anchorSvg.y - 1.5" :x2="anchorSvg.x" :y2="anchorSvg.y + 1.5" stroke="#fff" stroke-width="1.5" stroke-opacity="0.85" vector-effect="non-scaling-stroke" />
                  <circle :cx="anchorSvg.x" :cy="anchorSvg.y" r="0.25" fill="#fff" fill-opacity="0.85" vector-effect="non-scaling-stroke" />
                </g>
              </svg>
            </div>
          </div>
        </div>

        <!-- ── Footer ── -->
        <footer class="border-t border-dark-700 bg-dark-900 shrink-0 px-4 py-2">
          <div class="flex items-center gap-2 text-xs flex-wrap">
            <span class="text-[10px] px-2 py-0.5 rounded-full font-bold bg-[#2a2a00] text-amber-400 border border-amber-400/30">⬤ template</span>
            <div class="flex-1" />
            <template v-if="hoveredInfo">
              <span class="w-2.5 h-2.5 rounded-sm shrink-0 inline-block" :style="{ background: hoveredInfo.color }" />
              <strong class="text-white">{{ hoveredInfo.name }}</strong>
              <span v-if="hoveredInfo.optional" class="text-[10px] px-1.5 py-0.5 rounded-full bg-[#2a2a1a] text-gray-400 border border-[#55555544]">optional</span>
              <span class="text-dark-600">│</span>
              <span class="text-dark-500">
                x {{ (hoveredInfo.x * 100).toFixed(1) }}%
                y {{ (hoveredInfo.y * 100).toFixed(1) }}%
                &nbsp;{{ (hoveredInfo.width * 100).toFixed(1) }}×{{ (hoveredInfo.height * 100).toFixed(1) }}%
              </span>
            </template>
            <span v-else-if="noRegionsReason" class="text-[#f5a623]">{{ noRegionsReason }}</span>
            <span v-else class="text-dark-500">hover a region to inspect</span>
            <div class="flex-1" />
          </div>
        </footer>
      </template>
    </main>
  </div>
</template>
