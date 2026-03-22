<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { REGION_TEMPLATES } from '@/utils/ocr-region-templates'
import type { ArtifactScreenType } from '@/types/ocr-regions'

// ─── Interfaces ───────────────────────────────────────────────────────────────

interface FixtureMeta {
  name: string
  hasJson: boolean
  hasStarCoords: boolean
  screen?: string
}

interface StarCoords {
  x: number
  y: number
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
    starCoords?: StarCoords
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
  hx: number; hy: number; hw: number; hh: number
  moveLeft: boolean; moveTop: boolean; moveRight: boolean; moveBottom: boolean
  cursor: string
  isCorner: boolean
  litTop: boolean; litRight: boolean; litBottom: boolean; litLeft: boolean
}

interface DragState {
  regionName: string
  startSvgX: number
  startSvgY: number
  startRegion: SavedRegion
  isMove: boolean
  moveLeft: boolean; moveTop: boolean; moveRight: boolean; moveBottom: boolean
}

interface StarDragState {
  startSvgX: number
  startSvgY: number
  startCoords: StarCoords
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
const imgDisplaySize = ref({ w: 0, h: 0 })

// Star coords (working copy) — authoritative source; loaded from fixture on select
const coords = ref<StarCoords>({ x: 0, y: 0 })
/** Whether star coords have been placed (loaded from fixture or set by first click) */
const starPlaced = ref(false)

// OCR regions
const fixtureRegions = ref<WorkingRegion[]>([])
const dataSource = ref<'fixture' | 'template' | 'none'>('none')

// Screen type editor (always editable)
const editableScreenType = ref<string>('')

// Combined dirty/save state
const isDirty = ref(false)
const saveState = ref<'idle' | 'saving' | 'saved' | 'error'>('idle')
let saveTimeout = 0

// Interaction state
const hoveredRegion = ref<string | null>(null)
const hoveredHandle = ref<HandleDef | null>(null)
const draggingRegionName = ref<string | null>(null)
const draggingCursor = ref<string | null>(null)
const isDraggingStar = ref(false)

// Non-reactive drag state — only needed during pointer events
let dragState: DragState | null = null
let starDragState: StarDragState | null = null

let resizeObserver: ResizeObserver | null = null

// ─── Preview state ────────────────────────────────────────────────────────────

const previewCanvas = ref<HTMLCanvasElement | null>(null)
const previewVisible = ref(false)
const previewStyle = ref({ left: '0px', top: '0px', width: '0px', height: '0px' })
const previewAnchor = ref<{ x: number; y: number; hDir: 'right' | 'left'; vDir: 'down' | 'up' } | null>(null)

// ─── Watchers ─────────────────────────────────────────────────────────────────

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

// Initialize regions once both image and fixture data are ready
watch(
  [imgLoaded, fixtureData] as const,
  ([loaded, data]) => {
    if (loaded && data) initRegions()
  },
)

// Re-init regions and mark dirty when screen type changes
watch(editableScreenType, (val, old) => {
  if (val === old || fixtureData.value === null) return
  isDirty.value = true
  if (imgLoaded.value) initRegions(false)
})

// When star coords change via drag and data source is template, re-init regions from new anchor
watch(coords, () => {
  if (dataSource.value === 'template' && starPlaced.value && imgLoaded.value && fixtureData.value) {
    initRegions(false)
    isDirty.value = true
  }
}, { deep: true })

// ─── Computed ─────────────────────────────────────────────────────────────────

const screenType = computed((): ArtifactScreenType | null => {
  const s = editableScreenType.value
  if (s === 'character' || s === 'inventory' || s === 'rewards') return s
  return null
})

const regionsActive = computed(() => screenType.value !== null && starPlaced.value)

const anchorPct = computed(() => {
  const { w, h } = imgNaturalSize.value
  if (!starPlaced.value || w === 0 || h === 0) return null
  return { x: coords.value.x / w, y: coords.value.y / h }
})

const anchorSvg = computed(() => {
  const a = anchorPct.value
  return a ? { x: a.x * 100, y: a.y * 100 } : null
})

const markerStyle = computed(() => {
  const { w, h } = imgDisplaySize.value
  const img = imgRef.value
  if (!img || !imgLoaded.value || !starPlaced.value || w === 0 || h === 0) return { display: 'none' }
  return {
    display: 'block',
    left: `${coords.value.x * (w / img.naturalWidth)}px`,
    top: `${coords.value.y * (h / img.naturalHeight)}px`,
  }
})

const activeHandles = computed((): HandleDef[] => {
  const name = draggingRegionName.value ?? hoveredRegion.value
  if (!name) return []
  const region = fixtureRegions.value.find((r) => r.name === name)
  if (!region || region.missing) return []
  return computeHandlesForRegion(region)
})

const hoveredInfo = computed(() => fixtureRegions.value.find((r) => r.name === hoveredRegion.value) ?? null)

const litEdges = computed(() => {
  const h = hoveredHandle.value
  if (!h) return { top: false, right: false, bottom: false, left: false }
  return { top: h.litTop, right: h.litRight, bottom: h.litBottom, left: h.litLeft }
})

const visibleRegions = computed(() => fixtureRegions.value.filter((r) => !r.missing))

// ─── Region initialisation ────────────────────────────────────────────────────

function initRegions(resetDirty = true) {
  const type = screenType.value
  if (!type) {
    fixtureRegions.value = []
    dataSource.value = 'none'
    if (resetDirty) isDirty.value = false
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
        return { ...makeRegion(tr, saved.x, saved.y, false), width: saved.width, height: saved.height }
      }
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

  if (resetDirty) isDirty.value = false
}

// ─── Missing toggle ───────────────────────────────────────────────────────────

function toggleMissing(regionName: string) {
  const region = fixtureRegions.value.find((r) => r.name === regionName)
  if (!region || !region.optional) return

  if (region.missing) {
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
  const E = EDGE_HIT
  const C = CORNER_HALF

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

// ─── Star drag ────────────────────────────────────────────────────────────────

function onAnchorDown(e: PointerEvent) {
  const pos = svgCoordsFromPointer(e)
  starDragState = {
    startSvgX: pos.x,
    startSvgY: pos.y,
    startCoords: { ...coords.value },
  }
  isDraggingStar.value = true
  draggingCursor.value = 'move'
  svgRef.value?.setPointerCapture(e.pointerId)
  e.preventDefault()
  e.stopPropagation()
}

/** Handle first click on SVG to place the star when starCoords are not yet set */
function onSvgInitialClick(e: PointerEvent) {
  if (starPlaced.value) return
  const pos = svgCoordsFromPointer(e)
  const { w, h } = imgNaturalSize.value
  coords.value = {
    x: Math.round((pos.x / 100) * w),
    y: Math.round((pos.y / 100) * h),
  }
  starPlaced.value = true
  isDirty.value = true
  initRegions()
}

// ─── Region drag ──────────────────────────────────────────────────────────────

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

// ─── Shared SVG pointer events ────────────────────────────────────────────────

function onSvgPointerMove(e: PointerEvent) {
  if (isDraggingStar.value && starDragState) {
    const pos = svgCoordsFromPointer(e)
    const { w, h } = imgNaturalSize.value
    const dx = ((pos.x - starDragState.startSvgX) / 100) * w
    const dy = ((pos.y - starDragState.startSvgY) / 100) * h
    coords.value = {
      x: Math.round(starDragState.startCoords.x + dx),
      y: Math.round(starDragState.startCoords.y + dy),
    }
    isDirty.value = true
    return
  }

  const d = dragState
  if (!d) return

  const pos = svgCoordsFromPointer(e)
  const dx = (pos.x - d.startSvgX) / 100
  const dy = (pos.y - d.startSvgY) / 100

  const region = fixtureRegions.value.find((r) => r.name === d.regionName)
  if (!region) return

  const sr = d.startRegion
  const MIN = 0.005

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
  if (isDraggingStar.value) {
    isDraggingStar.value = false
    starDragState = null
    draggingCursor.value = null
    svgRef.value?.releasePointerCapture(e.pointerId)
    return
  }

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

  const previewW = region.width * containerW * 2
  const previewH = region.height * containerH * 2

  const clickPxX = (clickSvgX / 100) * containerW
  const clickPxY = (clickSvgY / 100) * containerH

  const marginX = region.width * containerW + 32
  const marginY = region.height * containerH + 32

  type Candidate = { x: number; y: number; hDir: 'right' | 'left'; vDir: 'down' | 'up' }
  const rawCandidates: Candidate[] = [
    { x: clickPxX + marginX,            y: clickPxY + marginY,            hDir: 'right', vDir: 'down' },
    { x: clickPxX + marginX,            y: clickPxY - marginY - previewH, hDir: 'right', vDir: 'up'   },
    { x: clickPxX - marginX - previewW, y: clickPxY + marginY,            hDir: 'left',  vDir: 'down' },
    { x: clickPxX - marginX - previewW, y: clickPxY - marginY - previewH, hDir: 'left',  vDir: 'up'   },
  ]

  const others = visibleRegions.value.filter((r) => r.name !== region.name)

  let bestScore = Infinity
  let best = rawCandidates[0]!

  for (const c of rawCandidates) {
    const cx = Math.max(0, Math.min(containerW - previewW, c.x))
    const cy = Math.max(0, Math.min(containerH - previewH, c.y))

    const px1 = cx / containerW
    const py1 = cy / containerH
    const px2 = (cx + previewW) / containerW
    const py2 = (cy + previewH) / containerH

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
  starDragState = null
  draggingRegionName.value = null
  draggingCursor.value = null
  isDraggingStar.value = false
  isDirty.value = false
  saveState.value = 'idle'
  dataSource.value = 'none'

  const meta = fixtures.value.find((f) => f.name === name)
  if (meta?.hasJson === false) {
    fixtureData.value = { expected: {} }
    editableScreenType.value = ''
    coords.value = { x: 0, y: 0 }
    starPlaced.value = false
    return
  }

  const res = await fetch(`/fixtures/${encodeURIComponent(name)}.json`)
  fixtureData.value = (await res.json()) as FixtureData

  editableScreenType.value = fixtureData.value.expected.screen ?? ''

  const sc = fixtureData.value.expected.starCoords
  if (sc) {
    coords.value = { ...sc }
    starPlaced.value = true
  } else {
    coords.value = { x: 0, y: 0 }
    starPlaced.value = false
  }
}

function onImageLoad() {
  imgLoaded.value = true
  const img = imgRef.value
  if (img) {
    imgNaturalSize.value = { w: img.naturalWidth, h: img.naturalHeight }
    imgDisplaySize.value = { w: img.clientWidth, h: img.clientHeight }
  }
}

// ─── Save ─────────────────────────────────────────────────────────────────────

async function save() {
  if (!selectedName.value) return
  saveState.value = 'saving'
  clearTimeout(saveTimeout)

  try {
    const promises: Promise<Response>[] = []
    const screen = editableScreenType.value || undefined

    if (starPlaced.value) {
      promises.push(
        fetch('/api/fixture-save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: selectedName.value, starCoords: coords.value, screen }),
        }),
      )
    } else if (screen) {
      promises.push(
        fetch('/api/fixture-save-screen', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: selectedName.value, screen }),
        }),
      )
    }

    if (fixtureRegions.value.length > 0) {
      const ocrRegions: Record<string, SavedRegion> = {}
      for (const r of fixtureRegions.value) {
        if (r.missing) continue
        ocrRegions[r.name] = { x: r.x, y: r.y, width: r.width, height: r.height }
      }
      promises.push(
        fetch('/api/fixture-save-ocr', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: selectedName.value, ocrRegions }),
        }),
      )
    }

    if (promises.length === 0) {
      saveState.value = 'idle'
      return
    }

    const responses = await Promise.all(promises)
    for (const res of responses) {
      if (!res.ok) throw new Error(await res.text())
    }

    if (fixtureData.value && starPlaced.value) {
      fixtureData.value.expected.starCoords = { ...coords.value }
    }
    if (fixtureData.value && screen) {
      fixtureData.value.expected.screen = screen
    }
    const meta = fixtures.value.find((f) => f.name === selectedName.value)
    if (meta) {
      meta.hasStarCoords = starPlaced.value
      meta.hasJson = true
      meta.screen = screen
    }

    if (fixtureRegions.value.length > 0) dataSource.value = 'fixture'
    isDirty.value = false
    saveState.value = 'saved'
    saveTimeout = window.setTimeout(() => { saveState.value = 'idle' }, 2000)
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
  <div class="flex h-screen font-mono text-[13px] bg-dark-900 text-[#e0e0e0]">
    <!-- ── Sidebar ── -->
    <aside class="w-[260px] shrink-0 overflow-y-auto border-r border-dark-700 py-2">
      <h2 class="text-[11px] uppercase tracking-widest text-gray-mid px-3 pt-1 pb-2 m-0">Fixtures</h2>
      <ul class="list-none m-0 p-0">
        <li
          v-for="fixture in fixtures"
          :key="fixture.name"
          class="flex items-center justify-between px-3 py-1.5 cursor-pointer gap-1.5 border-l-[3px] border-transparent hover:bg-dark-800"
          :class="{ 'bg-[#1e3a5f] border-l-[#4a9eff]': fixture.name === selectedName, 'opacity-50': !fixture.hasJson }"
          @click="selectFixture(fixture.name)"
        >
          <span class="truncate flex-1 min-w-0" :class="{ 'text-[#f5a623]': fixture.hasJson && !fixture.hasStarCoords }">{{ fixture.name }}</span>
          <span class="flex items-center gap-1 shrink-0">
            <span v-if="!fixture.hasJson" class="screen-badge badge-new">new</span>
            <template v-else>
              <span v-if="fixture.screen" class="screen-badge" :class="screenBadgeClass(fixture.screen)">{{ fixture.screen }}</span>
              <span v-else class="screen-badge badge-unknown">?</span>
              <span class="text-[11px]" :class="fixture.hasStarCoords ? 'text-dark-500' : 'text-[#f5a623]'" :title="fixture.hasStarCoords ? 'Has starCoords' : 'Missing starCoords'">{{ fixture.hasStarCoords ? '★' : '✗' }}</span>
            </template>
          </span>
        </li>
      </ul>
    </aside>

    <!-- ── Main area ── -->
    <main class="flex-1 flex flex-col overflow-hidden">
      <div v-if="!selectedName" class="flex-1 flex items-center justify-center text-dark-500">Select a fixture from the list</div>

      <template v-else>
        <div class="flex-1 flex overflow-hidden">
          <!-- Image + SVG overlay -->
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
                v-if="imgLoaded"
                ref="svgRef"
                class="absolute inset-0 w-full h-full pointer-events-all touch-none"
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                xmlns="http://www.w3.org/2000/svg"
                :style="draggingCursor ? { cursor: draggingCursor } : {}"
                @pointermove="onSvgPointerMove"
                @pointerup="onSvgPointerUp"
                @click="onSvgInitialClick"
              >
                <!-- OCR region rectangles (drag to move) -->
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
                  <!-- Highlighted edges for hovered/dragged region -->
                  <template v-if="(hoveredRegion === region.name || draggingRegionName === region.name)">
                    <line
                      :x1="region.x * 100" :y1="region.y * 100"
                      :x2="(region.x + region.width) * 100" :y2="region.y * 100"
                      :stroke="region.color"
                      :stroke-width="litEdges.top ? 2.5 : 1.5"
                      stroke-opacity="0.95"
                      vector-effect="non-scaling-stroke"
                      style="pointer-events: none"
                    />
                    <line
                      :x1="(region.x + region.width) * 100" :y1="region.y * 100"
                      :x2="(region.x + region.width) * 100" :y2="(region.y + region.height) * 100"
                      :stroke="region.color"
                      :stroke-width="litEdges.right ? 2.5 : 1.5"
                      stroke-opacity="0.95"
                      vector-effect="non-scaling-stroke"
                      style="pointer-events: none"
                    />
                    <line
                      :x1="region.x * 100" :y1="(region.y + region.height) * 100"
                      :x2="(region.x + region.width) * 100" :y2="(region.y + region.height) * 100"
                      :stroke="region.color"
                      :stroke-width="litEdges.bottom ? 2.5 : 1.5"
                      stroke-opacity="0.95"
                      vector-effect="non-scaling-stroke"
                      style="pointer-events: none"
                    />
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

                <!-- Star anchor drag hit area (invisible, in SVG coordinate space) -->
                <rect
                  v-if="anchorSvg"
                  :x="anchorSvg.x - 2"
                  :y="anchorSvg.y - 2"
                  width="4"
                  height="4"
                  fill="transparent"
                  stroke="none"
                  style="pointer-events: all; cursor: grab"
                  @pointerdown.stop.prevent="onAnchorDown($event)"
                />
              </svg>

              <!-- Star reticle: red circle + crosshair (HTML element for true circular shape) -->
              <div
                v-if="starPlaced"
                class="star-marker"
                :class="{ dragging: isDraggingStar }"
                :style="markerStyle"
              />

              <!-- 2× zoom preview panel — shown during region drag/resize -->
              <canvas
                ref="previewCanvas"
                v-show="previewVisible"
                class="region-preview"
                :style="previewStyle"
              />

              <!-- Initial placement prompt -->
              <div v-if="imgLoaded && !starPlaced" class="placement-prompt">
                select star position
              </div>
            </div>
          </div>

          <!-- ── Right sidebar ── -->
          <aside v-if="selectedName" class="w-[200px] shrink-0 border-l border-dark-700 overflow-y-auto py-2">
            <!-- Screen type selector -->
            <div class="px-3 pt-1 pb-3 border-b border-dark-700">
              <h3 class="text-[11px] uppercase tracking-widest text-gray-mid pb-2 m-0">Screen Type</h3>
              <select
                v-model="editableScreenType"
                class="w-full bg-dark-800 text-[#e0e0e0] border border-dark-600 rounded px-2 py-1 text-xs font-mono cursor-pointer"
              >
                <option value="">— unset —</option>
                <option value="character">character</option>
                <option value="inventory">inventory</option>
                <option value="rewards">rewards</option>
                <option value="other">other</option>
              </select>
            </div>

          <!-- ── Region legend panel ── -->
          <div class="pt-3 transition-opacity duration-150" :class="regionsActive ? '' : 'opacity-35 pointer-events-none'">
            <h3 class="text-[11px] uppercase tracking-widest text-gray-mid px-3 pb-2 m-0">Regions</h3>
            <div v-if="!regionsActive" class="px-3 text-[11px] text-dark-500 italic">
              {{ !screenType ? 'set screen type to enable' : 'place star to enable' }}
            </div>
            <div v-else class="flex flex-col gap-px">
              <div
                v-for="region in fixtureRegions"
                :key="region.name"
                class="flex items-center justify-between px-2.5 py-1.5 gap-1.5 border-l-2 border-transparent transition-[background,border-color] duration-100 hover:bg-[#222]"
                :class="{
                  'bg-[#252525] border-l-dark-600': !region.missing && (hoveredRegion === region.name || draggingRegionName === region.name),
                  'opacity-45': region.missing,
                }"
                @mouseenter="!region.missing && (hoveredRegion = region.name)"
                @mouseleave="hoveredRegion = null"
              >
                <label class="flex items-center gap-1.5 cursor-default flex-1 min-w-0">
                  <input
                    v-if="region.optional"
                    type="checkbox"
                    class="shrink-0 w-[13px] h-[13px] cursor-pointer accent-green-400"
                    :checked="!region.missing"
                    @change="toggleMissing(region.name)"
                  />
                  <span v-else class="shrink-0 w-[13px] h-[13px]" />
                  <span class="w-2.5 h-2.5 rounded-sm shrink-0 inline-block" :style="{ background: region.missing ? '#555' : region.color }" />
                  <span class="text-[11px] text-[#bbb] truncate" :class="{ 'line-through text-dark-500': region.missing }">{{ region.name }}</span>
                </label>
                <span class="text-[10px] px-1.5 py-0.5 rounded-full bg-[#1a2a3a] text-blue-400 border border-blue-400/25 whitespace-nowrap shrink-0">{{ region.ocrMode }}</span>
              </div>
            </div>
          </div>
          </aside>
        </div>

        <!-- ── Footer ── -->
        <footer class="border-t border-dark-700 bg-dark-900 shrink-0 px-4 py-2">
          <div class="flex items-center gap-2 text-xs flex-wrap">
            <span v-if="dataSource === 'fixture'" class="text-[10px] px-2 py-0.5 rounded-full font-bold bg-[#1a2a1a] text-green-400 border border-green-400/30">⬤ fixture data</span>
            <span v-else-if="dataSource === 'template'" class="text-[10px] px-2 py-0.5 rounded-full font-bold bg-[#2a2a00] text-amber-400 border border-amber-400/30">⬤ template data</span>
            <span v-else class="text-[10px] px-2 py-0.5 rounded-full font-bold bg-dark-800 text-dark-500 border border-dark-600/30">no data</span>

            <span v-if="isDirty" class="text-[10px] px-1.5 py-0.5 rounded-full bg-[#2a1500] text-orange-400 border border-orange-400/30">● unsaved</span>

            <span class="text-dark-600">│</span>
            <span class="text-[12px] text-[#ccc]">
              ★ x: <strong class="text-white">{{ coords.x }}</strong>
              &nbsp; y: <strong class="text-white">{{ coords.y }}</strong>
            </span>

            <div class="flex-1" />

            <template v-if="hoveredInfo && !hoveredInfo.missing">
              <span class="w-2.5 h-2.5 rounded-sm shrink-0 inline-block" :style="{ background: hoveredInfo.color }" />
              <strong class="text-white">{{ hoveredInfo.name }}</strong>
              <span class="text-[10px] px-1.5 py-0.5 rounded-full bg-[#1a2a3a] text-blue-400 border border-blue-400/25 whitespace-nowrap">{{ hoveredInfo.ocrMode }}</span>
              <span v-if="hoveredInfo.optional" class="text-[10px] px-1.5 py-0.5 rounded-full bg-[#2a2a1a] text-gray-400 border border-[#55555544]">optional</span>
              <span class="text-dark-600">│</span>
              <span class="text-dark-500">
                x {{ (hoveredInfo.x * 100).toFixed(1) }}%
                y {{ (hoveredInfo.y * 100).toFixed(1) }}%
                &nbsp;{{ (hoveredInfo.width * 100).toFixed(1) }}×{{ (hoveredInfo.height * 100).toFixed(1) }}%
              </span>
            </template>
            <span v-else class="text-dark-500">drag anchor to move star · drag regions to move/resize</span>

            <div class="flex-1" />

            <button
              class="px-4 py-1 bg-[#2c7be5] text-white border-0 rounded cursor-pointer text-xs font-mono shrink-0 disabled:opacity-50 disabled:cursor-default hover:not-disabled:bg-[#3a8ef0]"
              :disabled="saveState === 'saving' || (!starPlaced && !editableScreenType)"
              @click="save"
            >
              {{ saveState === 'saving' ? 'Saving…' : 'Save' }}
            </button>
            <span v-if="saveState === 'saved'" class="text-[11px] px-2 py-0.5 rounded-full bg-[#1a3a1a] text-green-500 border border-green-500/30">✓ Saved</span>
            <span v-if="saveState === 'error'" class="text-[11px] px-2 py-0.5 rounded-full bg-[#3a1a1a] text-red-500 border border-red-500/30">Save failed</span>
          </div>
        </footer>
      </template>
    </main>
  </div>
</template>

<style scoped>
/* Region drag preview */
.region-preview {
  position: absolute;
  border: 2px solid rgba(255, 255, 255, 0.85);
  border-radius: 4px;
  box-shadow: 0 2px 14px rgba(0, 0, 0, 0.7);
  pointer-events: none;
  z-index: 10;
  image-rendering: pixelated;
}

/* Star reticle */
.star-marker {
  position: absolute;
  width: 20px;
  height: 20px;
  transform: translate(-50%, -50%);
  pointer-events: none;
  z-index: 1;
  outline: 2px solid rgba(255, 59, 48, 0.6);
  border-radius: 50%;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.5);
}

.star-marker::before,
.star-marker::after {
  content: '';
  position: absolute;
  background: #ff3b30;
}

.star-marker::before {
  width: 2px;
  height: 100%;
  left: 50%;
  top: 0;
  transform: translateX(-50%);
}

.star-marker::after {
  height: 2px;
  width: 100%;
  top: 50%;
  left: 0;
  transform: translateY(-50%);
}

.star-marker.dragging {
  outline-color: rgba(255, 59, 48, 0.9);
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.7), 0 0 6px rgba(255, 59, 48, 0.5);
}

/* Initial placement prompt */
.placement-prompt {
  position: absolute;
  bottom: 10px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 12px;
  color: #f5a623;
  background: rgba(26, 26, 26, 0.85);
  padding: 4px 14px;
  border-radius: 10px;
  border: 1px solid #f5a62355;
  pointer-events: none;
  white-space: nowrap;
  z-index: 1;
}
</style>
