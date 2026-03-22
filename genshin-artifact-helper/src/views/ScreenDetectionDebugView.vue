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
          <span class="truncate flex-1 min-w-0">{{ fixture.name }}</span>
          <span v-if="fixture.screen" class="screen-badge" :class="screenBadgeClass(fixture.screen)">{{ fixture.screen }}</span>
          <span v-else class="screen-badge badge-unknown">?</span>
        </li>
      </ul>
    </aside>

    <!-- ── Main area ── -->
    <main class="flex-1 flex flex-col overflow-hidden">
      <div v-if="!selectedName" class="flex-1 flex items-center justify-center text-dark-500">Select a fixture from the list</div>

      <template v-else>
        <!-- Toggle controls -->
        <div class="flex items-center gap-2 px-4 py-2 border-b border-dark-700 shrink-0">
          <span class="text-gray-mid text-[11px]">Show regions:</span>
          <button
            v-for="group in ['character', 'inventory', 'rewards']"
            :key="group"
            class="px-3 py-0.5 rounded border border-dark-600 bg-dark-800 text-gray-mid cursor-pointer text-[11px] font-mono uppercase tracking-wide transition-opacity"
            :class="[
              { 'opacity-50': !visibleGroups.has(group) },
              visibleGroups.has(group) && group === 'character' ? 'border-[#dbba7d88] text-[#dbba7d] bg-[#3a2a0055]' : '',
              visibleGroups.has(group) && group === 'inventory' ? 'border-[#60a5fa88] text-[#60a5fa] bg-[#001a3a55]' : '',
              visibleGroups.has(group) && group === 'rewards' ? 'border-[#a78bfa88] text-[#a78bfa] bg-[#2a1a4a55]' : '',
            ]"
            @click="toggleGroup(group)"
          >
            {{ group }}
          </button>
        </div>

        <div class="flex-1 overflow-auto p-4">
          <div class="relative inline-block select-none">
            <img
              ref="imgRef"
              :src="`/fixtures/${encodeURIComponent(selectedName)}.png`"
              :alt="selectedName"
              class="block max-w-full pointer-events-none"
              style="max-height: calc(100vh - 180px)"
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
              <rect
                v-for="region in REGIONS"
                v-show="visibleGroups.has(region.group)"
                :key="region.id"
                :x="region.xMin" :y="region.yMin"
                :width="region.xMax - region.xMin" :height="region.yMax - region.yMin"
                :fill="region.color"
                :fill-opacity="hoveredRegion === region.id ? 0.35 : 0.18"
                :stroke="region.color"
                stroke-opacity="0.9" stroke-width="0.4" vector-effect="non-scaling-stroke"
                style="pointer-events: all; cursor: default"
                @mouseenter="onRegionMouseEnter(region.id)"
                @mouseleave="onRegionMouseLeave()"
              />
            </svg>
          </div>
        </div>

        <!-- ── Footer ── -->
        <footer class="border-t border-dark-700 bg-dark-900 shrink-0 px-4 py-2.5 flex flex-col gap-1.5">
          <div class="flex flex-wrap gap-x-5 gap-y-1.5">
            <div
              v-for="region in REGIONS"
              :key="region.id"
              class="flex items-center gap-1.5 transition-opacity"
              :class="{ 'opacity-30': !visibleGroups.has(region.group) }"
            >
              <span
                class="w-2.5 h-2.5 rounded-sm shrink-0 transition-transform"
                :class="{ 'scale-[1.3]': hoveredRegion === region.id }"
                :style="{ background: region.color }"
              />
              <span class="text-[#ccc] text-xs">{{ region.label }}</span>
              <span class="text-dark-500 text-[11px]">{{ region.sublabel }}</span>
            </div>
          </div>

          <div v-if="hoveredRegionInfo() && topColors.length" class="pt-2 border-t border-dark-800 flex flex-col gap-1.5">
            <span class="flex items-baseline gap-2 text-xs">
              <strong class="text-white">{{ hoveredRegionInfo()!.label }}</strong>
              <span class="text-dark-500 text-[11px]">{{ hoveredRegionInfo()!.sublabel }}</span>
            </span>
            <div class="flex flex-wrap gap-1 gap-x-3">
              <div v-for="entry in topColors" :key="entry.hex" class="flex items-center gap-1.5">
                <span class="w-3.5 h-3.5 rounded-sm border border-white/15 shrink-0" :style="{ background: entry.hex }" />
                <span class="text-[11px] text-[#ccc] tracking-[0.03em]">{{ entry.hex }}</span>
                <span class="text-[11px] text-dark-500 min-w-7">{{ entry.pct }}%</span>
              </div>
            </div>
          </div>
        </footer>
      </template>
    </main>
  </div>
</template>
