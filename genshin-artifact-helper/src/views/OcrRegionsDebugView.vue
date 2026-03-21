<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { REGION_TEMPLATES } from '@/utils/ocr-region-templates'
import type { ArtifactScreenType } from '@/types/ocr-regions'

// ─── Interfaces ───────────────────────────────────────────────────────────────

interface FixtureMeta {
  name: string
  hasStarCoords: boolean
  screen?: string
}

interface SavedRegion {
  x: number
  y: number
  width: number
  height: number
}

interface FixtureData {
  expected: {
    screen?: string
    starCoords?: { x: number; y: number }
    ocrRegions?: Record<string, SavedRegion>
    [key: string]: unknown
  }
}

/** Mutable working copy of a region, all coords in 0–1 image fractions */
interface WorkingRegion {
  name: string
  x: number
  y: number
  width: number
  height: number
  color: string
  ocrMode: string
  optional: boolean
  missing: boolean
}

/** An edge or corner hit zone for resizing */
interface HandleDef {
  key: string
  regionName: string
  // SVG rect geometry (0–100 viewBox)
  hx: number
  hy: number
  hw: number
  hh: number
  // which sides this handle moves
  moveLeft: boolean
  moveTop: boolean
  moveRight: boolean
  moveBottom: boolean
  cursor: string
  isCorner: boolean
  // which edges are "lit" when this handle is hovered  (top/right/bottom/left)
  litTop: boolean
  litRight: boolean
  litBottom: boolean
  litLeft: boolean
}

interface DragState {
  regionName: string
  startSvgX: number
  startSvgY: number
  startRegion: SavedRegion // snapshot at drag start (0–1)
  isMove: boolean
  moveLeft: boolean
  moveTop: boolean
  moveRight: boolean
  moveBottom: boolean
}

// ─── Constants ────────────────────────────────────────────────────────────────

const COLOR_REQUIRED = '#4ade80'
const COLOR_OPTIONAL = '#60a5fa'
/** Half-thickness of edge hit strips in SVG viewBox units */
const EDGE_HIT = 1.2
/** Half-size of corner handle squares in SVG viewBox units */
const CORNER_HALF = 0.9

// ─── State ────────────────────────────────────────────────────────────────────

const fixtures = ref<FixtureMeta[]>([])
const selectedName = ref<string | null>(null)
const fixtureData = ref<FixtureData | null>(null)
const imgRef = ref<HTMLImageElement | null>(null)
const svgRef = ref<SVGSVGElement | null>(null)
const imgLoaded = ref(false)
const imgNaturalSize = ref({ w: 0, h: 0 })

const fixtureRegions = ref<WorkingRegion[]>([])
const dataSource = ref<'fixture' | 'template' | 'none'>('none')
const isDirty = ref(false)
const saveState = ref<'idle' | 'saving' | 'saved' | 'error'>('idle')

const hoveredRegion = ref<string | null>(null)
const hoveredHandle = ref<HandleDef | null>(null)
const draggingRegionName = ref<string | null>(null)
const draggingCursor = ref<string | null>(null)

// Non-reactive drag state — only needed during pointer events
let dragState: DragState | null = null

let resizeObserver: ResizeObserver | null = null

// ─── Preview state ────────────────────────────────────────────────────────────

const previewCanvas = ref<HTMLCanvasElement | null>(null)
const previewVisible = ref(false)
const previewStyle = ref({ left: '0px', top: '0px', width: '0px', height: '0px' })
/** Fixed edge of the preview panel in container px, plus which direction it grows */
const previewAnchor = ref<{ x: number; y: number; hDir: 'right' | 'left'; vDir: 'down' | 'up' } | null>(null)

// ─── Watchers ─────────────────────────────────────────────────────────────────

watch(imgRef, (img, _, onCleanup) => {
  resizeObserver?.disconnect()
  if (!img) return
  resizeObserver = new ResizeObserver(() => {})
  resizeObserver.observe(img)
  onCleanup(() => resizeObserver?.disconnect())
})

onUnmounted(() => resizeObserver?.disconnect())

// Initialize regions once both the image and fixture JSON are ready
watch(
  [imgLoaded, fixtureData] as const,
  ([loaded, data]) => {
    if (loaded && data) initRegions()
  },
)

// ─── Computed ─────────────────────────────────────────────────────────────────

const screenType = computed((): ArtifactScreenType | null => {
  const s = fixtureData.value?.expected?.screen
  if (s === 'character' || s === 'inventory' || s === 'rewards') return s
  return null
})

const anchorPct = computed(() => {
  const sc = fixtureData.value?.expected?.starCoords
  const { w, h } = imgNaturalSize.value
  if (!sc || w === 0 || h === 0) return null
  return { x: sc.x / w, y: sc.y / h }
})

const anchorSvg = computed(() => {
  const a = anchorPct.value
  return a ? { x: a.x * 100, y: a.y * 100 } : null
})

const activeHandles = computed((): HandleDef[] => {
  const name = draggingRegionName.value ?? hoveredRegion.value
  if (!name) return []
  const region = fixtureRegions.value.find((r) => r.name === name)
  if (!region || region.missing) return []
  return computeHandlesForRegion(region)
})

const hoveredInfo = computed(() => fixtureRegions.value.find((r) => r.name === hoveredRegion.value) ?? null)

/** Which edges are highlighted for the currently hovered handle */
const litEdges = computed(() => {
  const h = hoveredHandle.value
  if (!h) return { top: false, right: false, bottom: false, left: false }
  return { top: h.litTop, right: h.litRight, bottom: h.litBottom, left: h.litLeft }
})

const visibleRegions = computed(() => fixtureRegions.value.filter((r) => !r.missing))

// ─── Region initialisation ────────────────────────────────────────────────────

function initRegions() {
  const type = screenType.value
  if (!type) {
    fixtureRegions.value = []
    dataSource.value = 'none'
    return
  }

  const layout = REGION_TEMPLATES[type]
  const templateRegions = Object.values(layout.regions)
  const gt = fixtureData.value?.expected?.ocrRegions
  const anchor = anchorPct.value

  const makeRegion = (
    tr: (typeof templateRegions)[number],
    x: number,
    y: number,
    missing = false,
  ): WorkingRegion => ({
    name: tr.name,
    x,
    y,
    width: tr.width,
    height: tr.height,
    color: (tr.optional ?? false) ? COLOR_OPTIONAL : COLOR_REQUIRED,
    ocrMode: tr.ocrMode,
    optional: tr.optional ?? false,
    missing,
  })

  if (gt && Object.keys(gt).length > 0) {
    fixtureRegions.value = templateRegions.map((tr) => {
      const saved = gt[tr.name]
      if (saved) {
        return {
          ...makeRegion(tr, saved.x, saved.y, false),
          width: saved.width,
          height: saved.height,
        }
      }
      // Region absent from saved data
      const isMissing = tr.optional ?? false
      const defaultX = anchor ? anchor.x + tr.x : 0
      const defaultY = anchor ? anchor.y + tr.y : 0
      return makeRegion(tr, defaultX, defaultY, isMissing)
    })
    dataSource.value = 'fixture'
  } else if (anchor) {
    fixtureRegions.value = templateRegions.map((tr) =>
      makeRegion(tr, anchor.x + tr.x, anchor.y + tr.y),
    )
    dataSource.value = 'template'
  } else {
    fixtureRegions.value = []
    dataSource.value = 'none'
  }

  isDirty.value = false
}

// ─── Missing toggle ───────────────────────────────────────────────────────────

function toggleMissing(regionName: string) {
  const region = fixtureRegions.value.find((r) => r.name === regionName)
  if (!region || !region.optional) return

  if (region.missing) {
    // Restore to template default position (anchor-relative)
    const type = screenType.value
    const anchor = anchorPct.value
    if (type && anchor) {
      const layout = REGION_TEMPLATES[type]
      const tr = Object.values(layout.regions).find((r) => r.name === regionName)
      if (tr) {
        region.x = anchor.x + tr.x
        region.y = anchor.y + tr.y
        region.width = tr.width
        region.height = tr.height
      }
    }
    region.missing = false
  } else {
    region.missing = true
  }

  isDirty.value = true
}

// ─── Drag helpers ─────────────────────────────────────────────────────────────

function computeHandlesForRegion(r: WorkingRegion): HandleDef[] {
  const x = r.x * 100
  const y = r.y * 100
  const w = r.width * 100
  const h = r.height * 100
  const n = r.name
  const E = EDGE_HIT   // half-thickness of edge hit strips
  const C = CORNER_HALF

  // Edge strips — full length minus corner squares so they don't overlap
  const edges: HandleDef[] = [
    {
      key: `${n}-t`, regionName: n,
      hx: x + C, hy: y - E, hw: w - C * 2, hh: E * 2,
      moveLeft: false, moveTop: true,  moveRight: false, moveBottom: false,
      cursor: 'ns-resize', isCorner: false,
      litTop: true,  litRight: false, litBottom: false, litLeft: false,
    },
    {
      key: `${n}-r`, regionName: n,
      hx: x + w - E, hy: y + C, hw: E * 2, hh: h - C * 2,
      moveLeft: false, moveTop: false, moveRight: true,  moveBottom: false,
      cursor: 'ew-resize', isCorner: false,
      litTop: false, litRight: true,  litBottom: false, litLeft: false,
    },
    {
      key: `${n}-b`, regionName: n,
      hx: x + C, hy: y + h - E, hw: w - C * 2, hh: E * 2,
      moveLeft: false, moveTop: false, moveRight: false, moveBottom: true,
      cursor: 'ns-resize', isCorner: false,
      litTop: false, litRight: false, litBottom: true,  litLeft: false,
    },
    {
      key: `${n}-l`, regionName: n,
      hx: x - E, hy: y + C, hw: E * 2, hh: h - C * 2,
      moveLeft: true,  moveTop: false, moveRight: false, moveBottom: false,
      cursor: 'ew-resize', isCorner: false,
      litTop: false, litRight: false, litBottom: false, litLeft: true,
    },
  ]

  // Corner squares — visible, flush with region border
  const corners: HandleDef[] = [
    {
      key: `${n}-tl`, regionName: n,
      hx: x - C, hy: y - C, hw: C * 2, hh: C * 2,
      moveLeft: true,  moveTop: true,  moveRight: false, moveBottom: false,
      cursor: 'nwse-resize', isCorner: true,
      litTop: true,  litRight: false, litBottom: false, litLeft: true,
    },
    {
      key: `${n}-tr`, regionName: n,
      hx: x + w - C, hy: y - C, hw: C * 2, hh: C * 2,
      moveLeft: false, moveTop: true,  moveRight: true,  moveBottom: false,
      cursor: 'nesw-resize', isCorner: true,
      litTop: true,  litRight: true,  litBottom: false, litLeft: false,
    },
    {
      key: `${n}-br`, regionName: n,
      hx: x + w - C, hy: y + h - C, hw: C * 2, hh: C * 2,
      moveLeft: false, moveTop: false, moveRight: true,  moveBottom: true,
      cursor: 'nwse-resize', isCorner: true,
      litTop: false, litRight: true,  litBottom: true,  litLeft: false,
    },
    {
      key: `${n}-bl`, regionName: n,
      hx: x - C, hy: y + h - C, hw: C * 2, hh: C * 2,
      moveLeft: true,  moveTop: false, moveRight: false, moveBottom: true,
      cursor: 'nesw-resize', isCorner: true,
      litTop: false, litRight: false, litBottom: true,  litLeft: true,
    },
  ]

  return [...edges, ...corners]
}

function svgCoordsFromPointer(e: PointerEvent): { x: number; y: number } {
  const svg = svgRef.value
  if (!svg) return { x: 0, y: 0 }
  const rect = svg.getBoundingClientRect()
  return {
    x: ((e.clientX - rect.left) / rect.width) * 100,
    y: ((e.clientY - rect.top) / rect.height) * 100,
  }
}

function startDrag(e: PointerEvent, regionName: string, isMove: boolean, handle?: HandleDef) {
  const region = fixtureRegions.value.find((r) => r.name === regionName)
  if (!region || region.missing) return
  const pos = svgCoordsFromPointer(e)
  dragState = {
    regionName,
    startSvgX: pos.x,
    startSvgY: pos.y,
    startRegion: { x: region.x, y: region.y, width: region.width, height: region.height },
    isMove,
    moveLeft:   handle?.moveLeft   ?? false,
    moveTop:    handle?.moveTop    ?? false,
    moveRight:  handle?.moveRight  ?? false,
    moveBottom: handle?.moveBottom ?? false,
  }
  draggingRegionName.value = regionName
  draggingCursor.value = isMove ? 'move' : (handle?.cursor ?? null)
  svgRef.value?.setPointerCapture(e.pointerId)

  computePreviewPosition(pos.x, pos.y, region)
  previewVisible.value = true
  updatePreviewCanvas(region)

  e.preventDefault()
}

function onBodyDown(e: PointerEvent, regionName: string) {
  startDrag(e, regionName, true)
}

function onHandleDown(e: PointerEvent, handle: HandleDef) {
  hoveredHandle.value = handle
  startDrag(e, handle.regionName, false, handle)
}

function onSvgPointerMove(e: PointerEvent) {
  const d = dragState
  if (!d) return

  const pos = svgCoordsFromPointer(e)
  const dx = (pos.x - d.startSvgX) / 100 // delta in 0–1 fractions
  const dy = (pos.y - d.startSvgY) / 100

  const region = fixtureRegions.value.find((r) => r.name === d.regionName)
  if (!region) return

  const sr = d.startRegion
  const MIN = 0.005 // minimum region size (0.5% of image)

  if (d.isMove) {
    region.x = sr.x + dx
    region.y = sr.y + dy
  } else {
    if (d.moveLeft)   { region.x = sr.x + dx; region.width  = Math.max(MIN, sr.width  - dx) }
    if (d.moveTop)    { region.y = sr.y + dy; region.height = Math.max(MIN, sr.height - dy) }
    if (d.moveRight)  { region.width  = Math.max(MIN, sr.width  + dx) }
    if (d.moveBottom) { region.height = Math.max(MIN, sr.height + dy) }
  }

  isDirty.value = true
  updatePreviewCanvas(region)
}

function onSvgPointerUp(e: PointerEvent) {
  svgRef.value?.releasePointerCapture(e.pointerId)
  dragState = null
  draggingRegionName.value = null
  draggingCursor.value = null
  hoveredHandle.value = null
  previewVisible.value = false
  previewAnchor.value = null
}

// ─── Region preview ───────────────────────────────────────────────────────────

function computePreviewPosition(clickSvgX: number, clickSvgY: number, region: WorkingRegion) {
  const img = imgRef.value
  if (!img) return

  const containerW = img.clientWidth
  const containerH = img.clientHeight

  // Initial preview size at spawn time
  const previewW = region.width * containerW * 2
  const previewH = region.height * containerH * 2

  // Click in container pixels
  const clickPxX = (clickSvgX / 100) * containerW
  const clickPxY = (clickSvgY / 100) * containerH

  // Generous offset: full region rendered size + 32px gap so the preview
  // starts clear of the region and won't overlap even as it grows
  const marginX = region.width * containerW + 32
  const marginY = region.height * containerH + 32

  // 4 candidates with direction metadata for anchoring later
  type Candidate = { x: number; y: number; hDir: 'right' | 'left'; vDir: 'down' | 'up' }
  const rawCandidates: Candidate[] = [
    { x: clickPxX + marginX,            y: clickPxY + marginY,            hDir: 'right', vDir: 'down' },
    { x: clickPxX + marginX,            y: clickPxY - marginY - previewH, hDir: 'right', vDir: 'up'   },
    { x: clickPxX - marginX - previewW, y: clickPxY + marginY,            hDir: 'left',  vDir: 'down' },
    { x: clickPxX - marginX - previewW, y: clickPxY - marginY - previewH, hDir: 'left',  vDir: 'up'   },
  ]

  // Other visible regions for overlap scoring
  const others = visibleRegions.value.filter((r) => r.name !== region.name)

  let bestScore = Infinity
  let best = rawCandidates[0]!

  for (const c of rawCandidates) {
    // Clamp to container bounds
    const cx = Math.max(0, Math.min(containerW - previewW, c.x))
    const cy = Math.max(0, Math.min(containerH - previewH, c.y))

    // Preview rect in 0-1 fractions
    const px1 = cx / containerW
    const py1 = cy / containerH
    const px2 = (cx + previewW) / containerW
    const py2 = (cy + previewH) / containerH

    // Total overlap area with all other regions
    let overlapScore = 0
    for (const other of others) {
      const overlapX = Math.max(0, Math.min(px2, other.x + other.width)  - Math.max(px1, other.x))
      const overlapY = Math.max(0, Math.min(py2, other.y + other.height) - Math.max(py1, other.y))
      overlapScore += overlapX * overlapY
    }

    if (overlapScore < bestScore) {
      bestScore = overlapScore
      best = { ...c, x: cx, y: cy }
    }
  }

  // Store the fixed anchor edge in container px:
  //   hDir='right' → left edge is anchored at best.x
  //   hDir='left'  → right edge is anchored at best.x + previewW
  //   vDir='down'  → top edge is anchored at best.y
  //   vDir='up'    → bottom edge is anchored at best.y + previewH
  previewAnchor.value = {
    x: best.hDir === 'right' ? best.x : best.x + previewW,
    y: best.vDir === 'down'  ? best.y : best.y + previewH,
    hDir: best.hDir,
    vDir: best.vDir,
  }

  previewStyle.value = {
    left:   `${Math.round(best.x)}px`,
    top:    `${Math.round(best.y)}px`,
    width:  `${Math.round(previewW)}px`,
    height: `${Math.round(previewH)}px`,
  }
}

function updatePreviewCanvas(region: WorkingRegion) {
  const canvas = previewCanvas.value
  const img = imgRef.value
  const { w: naturalW, h: naturalH } = imgNaturalSize.value
  if (!canvas || !img || naturalW === 0 || naturalH === 0) return

  const containerW = img.clientWidth
  const containerH = img.clientHeight

  const bufW = Math.round(region.width * containerW * 2)
  const bufH = Math.round(region.height * containerH * 2)
  if (bufW <= 0 || bufH <= 0) return

  canvas.width  = bufW
  canvas.height = bufH

  // Recompute position so the near edge stays fixed and the panel grows away from the region
  const anchor = previewAnchor.value
  if (anchor) {
    const left = anchor.hDir === 'right' ? anchor.x : anchor.x - bufW
    const top  = anchor.vDir === 'down'  ? anchor.y : anchor.y - bufH
    previewStyle.value = { left: `${Math.round(left)}px`, top: `${Math.round(top)}px`, width: `${bufW}px`, height: `${bufH}px` }
  } else {
    previewStyle.value = { ...previewStyle.value, width: `${bufW}px`, height: `${bufH}px` }
  }

  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const srcX = region.x * naturalW
  const srcY = region.y * naturalH
  const srcW = region.width  * naturalW
  const srcH = region.height * naturalH

  ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, bufW, bufH)
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
  fixtureRegions.value = []
  hoveredRegion.value = null
  dragState = null
  draggingRegionName.value = null
  draggingCursor.value = null
  isDirty.value = false
  saveState.value = 'idle'
  dataSource.value = 'none'

  const res = await fetch(`/fixtures/${encodeURIComponent(name)}.json`)
  fixtureData.value = (await res.json()) as FixtureData
}

function onImageLoad() {
  imgLoaded.value = true
  const img = imgRef.value
  if (img) imgNaturalSize.value = { w: img.naturalWidth, h: img.naturalHeight }
}

// ─── Save ─────────────────────────────────────────────────────────────────────

async function save() {
  if (!selectedName.value || fixtureRegions.value.length === 0) return
  saveState.value = 'saving'

  const ocrRegions: Record<string, SavedRegion> = {}
  for (const r of fixtureRegions.value) {
    if (r.missing) continue
    ocrRegions[r.name] = { x: r.x, y: r.y, width: r.width, height: r.height }
  }

  try {
    const res = await fetch('/api/fixture-save-ocr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: selectedName.value, ocrRegions }),
    })
    if (!res.ok) throw new Error(await res.text())

    if (fixtureData.value) fixtureData.value.expected['ocrRegions'] = ocrRegions
    dataSource.value = 'fixture'
    isDirty.value = false
    saveState.value = 'saved'
    window.setTimeout(() => { saveState.value = 'idle' }, 2000)
  } catch {
    saveState.value = 'error'
  }
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
          <!-- Image + overlay -->
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
                v-if="imgLoaded && visibleRegions.length > 0"
                ref="svgRef"
                class="region-overlay"
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                xmlns="http://www.w3.org/2000/svg"
                :style="draggingCursor ? { cursor: draggingCursor } : {}"
                @pointermove="onSvgPointerMove"
                @pointerup="onSvgPointerUp"
              >
                <!-- OCR region rectangles (body drag to move) -->
                <g
                  v-for="region in visibleRegions"
                  :key="region.name"
                >
                  <!-- Fill + base stroke -->
                  <rect
                    :x="region.x * 100"
                    :y="region.y * 100"
                    :width="region.width * 100"
                    :height="region.height * 100"
                    :fill="region.color"
                    :fill-opacity="(hoveredRegion === region.name || draggingRegionName === region.name) ? 0.3 : 0.12"
                    :stroke="region.color"
                    stroke-opacity="0.5"
                    stroke-width="1"
                    vector-effect="non-scaling-stroke"
                    style="pointer-events: all; cursor: move"
                    @mouseenter="hoveredRegion = region.name"
                    @mouseleave="hoveredRegion = null"
                    @pointerdown.stop.prevent="onBodyDown($event, region.name)"
                  />
                  <!-- Highlighted edge overlays — only shown for hovered/dragged region -->
                  <template v-if="(hoveredRegion === region.name || draggingRegionName === region.name)">
                    <!-- top -->
                    <line
                      :x1="region.x * 100" :y1="region.y * 100"
                      :x2="(region.x + region.width) * 100" :y2="region.y * 100"
                      :stroke="region.color"
                      :stroke-width="litEdges.top ? 2.5 : 1.5"
                      stroke-opacity="0.95"
                      vector-effect="non-scaling-stroke"
                      style="pointer-events: none"
                    />
                    <!-- right -->
                    <line
                      :x1="(region.x + region.width) * 100" :y1="region.y * 100"
                      :x2="(region.x + region.width) * 100" :y2="(region.y + region.height) * 100"
                      :stroke="region.color"
                      :stroke-width="litEdges.right ? 2.5 : 1.5"
                      stroke-opacity="0.95"
                      vector-effect="non-scaling-stroke"
                      style="pointer-events: none"
                    />
                    <!-- bottom -->
                    <line
                      :x1="region.x * 100" :y1="(region.y + region.height) * 100"
                      :x2="(region.x + region.width) * 100" :y2="(region.y + region.height) * 100"
                      :stroke="region.color"
                      :stroke-width="litEdges.bottom ? 2.5 : 1.5"
                      stroke-opacity="0.95"
                      vector-effect="non-scaling-stroke"
                      style="pointer-events: none"
                    />
                    <!-- left -->
                    <line
                      :x1="region.x * 100" :y1="region.y * 100"
                      :x2="region.x * 100" :y2="(region.y + region.height) * 100"
                      :stroke="region.color"
                      :stroke-width="litEdges.left ? 2.5 : 1.5"
                      stroke-opacity="0.95"
                      vector-effect="non-scaling-stroke"
                      style="pointer-events: none"
                    />
                  </template>
                </g>

                <!-- Resize handles — only for hovered/dragged region -->
                <g v-for="handle in activeHandles" :key="handle.key">
                  <!-- Invisible hit area for edge strips; visible square for corners -->
                  <rect
                    :x="handle.hx"
                    :y="handle.hy"
                    :width="handle.hw"
                    :height="handle.hh"
                    fill="transparent"
                    :fill-opacity="0"
                    stroke="none"
                    :stroke-width="0"
                    vector-effect="non-scaling-stroke"
                    :style="{ cursor: handle.cursor, 'pointer-events': 'all' }"
                    @mouseenter="hoveredRegion = handle.regionName; hoveredHandle = handle"
                    @mouseleave="hoveredRegion = null; hoveredHandle = null"
                    @pointerdown.stop.prevent="onHandleDown($event, handle)"
                  />
                </g>

                <!-- Anchor crosshair (star position) -->
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

            <!-- 2× zoom preview panel — shown during drag/resize -->
            <canvas
              ref="previewCanvas"
              v-show="previewVisible"
              class="region-preview"
              :style="previewStyle"
            />
            </div>
          </div>

          <!-- ── Region legend panel ── -->
          <aside v-if="fixtureRegions.length > 0" class="region-panel">
            <h3>Regions</h3>
            <div class="region-list">
              <div
                v-for="region in fixtureRegions"
                :key="region.name"
                class="region-row"
                :class="{
                  'region-hover': !region.missing && (hoveredRegion === region.name || draggingRegionName === region.name),
                  'region-missing': region.missing,
                }"
                @mouseenter="!region.missing && (hoveredRegion = region.name)"
                @mouseleave="hoveredRegion = null"
              >
                <label class="region-label-wrap">
                  <input
                    v-if="region.optional"
                    type="checkbox"
                    class="region-checkbox"
                    :checked="!region.missing"
                    @change="toggleMissing(region.name)"
                  />
                  <span v-else class="region-checkbox-placeholder" />
                  <span class="legend-swatch" :style="{ background: region.missing ? '#555' : region.color }" />
                  <span class="legend-label" :class="{ 'label-missing': region.missing }">{{ region.name }}</span>
                </label>
                <span class="badge-mode">{{ region.ocrMode }}</span>
              </div>
            </div>
          </aside>
        </div>

        <!-- ── Footer ── -->
        <footer class="debug-footer">
          <div class="controls-row">
            <!-- Data source badge -->
            <span v-if="dataSource === 'fixture'" class="source-badge source-fixture">⬤ fixture data</span>
            <span v-else-if="dataSource === 'template'" class="source-badge source-template">⬤ template data</span>
            <span v-else class="source-badge source-none">no data</span>

            <span v-if="isDirty" class="dirty-badge">● unsaved</span>

            <div class="spacer" />

            <!-- Hover detail -->
            <template v-if="hoveredInfo && !hoveredInfo.missing">
              <span class="legend-swatch" :style="{ background: hoveredInfo.color }" />
              <strong>{{ hoveredInfo.name }}</strong>
              <span class="badge-mode">{{ hoveredInfo.ocrMode }}</span>
              <span v-if="hoveredInfo.optional" class="badge-optional">optional</span>
              <span class="sep">│</span>
              <span class="muted">
                x {{ (hoveredInfo.x * 100).toFixed(1) }}%
                y {{ (hoveredInfo.y * 100).toFixed(1) }}%
                &nbsp;{{ (hoveredInfo.width * 100).toFixed(1) }}×{{ (hoveredInfo.height * 100).toFixed(1) }}%
              </span>
            </template>
            <template v-else-if="fixtureRegions.length === 0">
              <span class="warn">
                {{ !screenType ? 'No OCR layout for this screen type' : 'No anchor — starCoords missing' }}
              </span>
            </template>
            <span v-else class="muted">hover a region to inspect · drag to move · drag corners/edges to resize</span>

            <div class="spacer" />

            <!-- Save button -->
            <button
              class="save-btn"
              :disabled="saveState === 'saving' || fixtureRegions.length === 0"
              @click="save"
            >
              {{ saveState === 'saving' ? 'Saving…' : 'Save positions to fixture' }}
            </button>
            <span v-if="saveState === 'saved'" class="badge badge-ok">✓ Saved</span>
            <span v-if="saveState === 'error'" class="badge badge-err">Save failed</span>
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

.region-preview {
  position: absolute;
  border: 2px solid rgba(255, 255, 255, 0.85);
  border-radius: 4px;
  box-shadow: 0 2px 14px rgba(0, 0, 0, 0.7);
  pointer-events: none;
  z-index: 10;
  image-rendering: pixelated;
}

/* ── Region panel ── */
.region-panel {
  width: 200px;
  flex-shrink: 0;
  border-left: 1px solid #333;
  overflow-y: auto;
  padding: 8px 0;
}

.region-panel h3 {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #888;
  padding: 4px 12px 8px;
  margin: 0;
}

.region-list {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.region-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 5px 10px;
  gap: 6px;
  border-left: 2px solid transparent;
  transition: background 0.1s, border-color 0.1s;
}

.region-row:hover {
  background: #222;
}

.region-row.region-hover {
  background: #252525;
  border-left-color: #444;
}

.region-row.region-missing {
  opacity: 0.45;
}

.region-label-wrap {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: default;
  flex: 1;
  min-width: 0;
}

.region-checkbox {
  flex-shrink: 0;
  width: 13px;
  height: 13px;
  cursor: pointer;
  accent-color: #4ade80;
}

.region-checkbox-placeholder {
  flex-shrink: 0;
  width: 13px;
  height: 13px;
}

.legend-swatch {
  width: 10px;
  height: 10px;
  border-radius: 2px;
  flex-shrink: 0;
  display: inline-block;
}

.legend-label {
  font-size: 11px;
  color: #bbb;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.legend-label.label-missing {
  text-decoration: line-through;
  color: #555;
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

/* Source badges */
.source-badge {
  font-size: 10px;
  padding: 2px 8px;
  border-radius: 8px;
  font-weight: bold;
}

.source-fixture  { background: #1a2a1a; color: #4ade80; border: 1px solid #4ade8055; }
.source-template { background: #2a2a00; color: #fbbf24; border: 1px solid #fbbf2455; }
.source-none     { background: #2a2a2a; color: #666;    border: 1px solid #44444455; }

.dirty-badge {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 8px;
  background: #2a1500;
  color: #fb923c;
  border: 1px solid #fb923c55;
}

/* OCR mode / optional badges */
.badge-mode {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 8px;
  background: #1a2a3a;
  color: #60a5fa;
  border: 1px solid #60a5fa44;
  white-space: nowrap;
  flex-shrink: 0;
}

.badge-optional {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 8px;
  background: #2a2a1a;
  color: #aaa;
  border: 1px solid #55555544;
}

/* Save controls */
.save-btn {
  padding: 4px 16px;
  background: #2c7be5;
  color: #fff;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  font-family: monospace;
  flex-shrink: 0;
}

.save-btn:disabled { opacity: 0.5; cursor: default; }
.save-btn:not(:disabled):hover { background: #3a8ef0; }

.badge {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 10px;
}

.badge-ok  { background: #1a3a1a; color: #4caf50; border: 1px solid #4caf5055; }
.badge-err { background: #3a1a1a; color: #f44336; border: 1px solid #f4433655; }
</style>
