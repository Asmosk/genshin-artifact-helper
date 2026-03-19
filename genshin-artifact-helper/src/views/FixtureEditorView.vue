<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'

interface FixtureMeta {
  name: string
  hasStarCoords: boolean
}

interface StarCoords {
  x: number
  y: number
}

interface FixtureExpected {
  starCoords?: StarCoords
  screen?: string
  [key: string]: unknown
}

interface FixtureData {
  expected: FixtureExpected
}

const fixtures = ref<FixtureMeta[]>([])
const selectedName = ref<string | null>(null)
const fixtureData = ref<FixtureData | null>(null)
const coords = ref<StarCoords>({ x: 0, y: 0 })
const imgRef = ref<HTMLImageElement | null>(null)
const imgLoaded = ref(false)
const saveState = ref<'idle' | 'saving' | 'saved' | 'error'>('idle')
let saveTimeout = 0

// Reactive display size — updated by ResizeObserver so markerStyle recomputes on resize
const imgDisplaySize = ref({ w: 0, h: 0 })
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

const hasStarCoords = computed(() => !!fixtureData.value?.expected?.starCoords)

const markerStyle = computed(() => {
  const { w, h } = imgDisplaySize.value
  const img = imgRef.value
  if (!img || !imgLoaded.value || w === 0 || h === 0) return { display: 'none' }
  return {
    display: 'block',
    left: `${coords.value.x * (w / img.naturalWidth)}px`,
    top: `${coords.value.y * (h / img.naturalHeight)}px`,
  }
})

async function loadFixtures() {
  const res = await fetch('/api/fixtures')
  fixtures.value = (await res.json()) as FixtureMeta[]
}

async function selectFixture(name: string) {
  selectedName.value = name
  imgLoaded.value = false
  saveState.value = 'idle'
  const res = await fetch(`/fixtures/${encodeURIComponent(name)}.json`)
  fixtureData.value = (await res.json()) as FixtureData
  const sc = fixtureData.value.expected.starCoords
  coords.value = sc ? { ...sc } : { x: 0, y: 0 }
}

function onImageLoad() {
  imgLoaded.value = true
  if (imgRef.value) {
    imgDisplaySize.value = { w: imgRef.value.clientWidth, h: imgRef.value.clientHeight }
  }
}

function coordsFromPointer(e: PointerEvent): StarCoords | null {
  const img = imgRef.value
  if (!img) return null
  const rect = img.getBoundingClientRect()
  const displayX = Math.max(0, Math.min(e.clientX - rect.left, img.clientWidth))
  const displayY = Math.max(0, Math.min(e.clientY - rect.top, img.clientHeight))
  const scaleX = img.naturalWidth / img.clientWidth
  const scaleY = img.naturalHeight / img.clientHeight
  return {
    x: Math.round(displayX * scaleX),
    y: Math.round(displayY * scaleY),
  }
}

function onImageClick(e: PointerEvent) {
  if (isDragging) return
  const c = coordsFromPointer(e)
  if (c) {
    coords.value = c
    saveState.value = 'idle'
  }
}

// Dragging the marker
let isDragging = false

function onMarkerPointerDown(e: PointerEvent) {
  e.preventDefault()
  e.stopPropagation()
  isDragging = true
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
}

function onMarkerPointerMove(e: PointerEvent) {
  if (!isDragging) return
  const c = coordsFromPointer(e)
  if (c) {
    coords.value = c
    saveState.value = 'idle'
  }
}

function onMarkerPointerUp(e: PointerEvent) {
  if (!isDragging) return
  isDragging = false
  ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
}

async function save() {
  if (!selectedName.value) return
  saveState.value = 'saving'
  clearTimeout(saveTimeout)
  try {
    const res = await fetch('/api/fixture-save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: selectedName.value, starCoords: coords.value }),
    })
    if (!res.ok) throw new Error(await res.text())
    if (fixtureData.value) {
      fixtureData.value.expected.starCoords = { ...coords.value }
    }
    const meta = fixtures.value.find((f) => f.name === selectedName.value)
    if (meta) meta.hasStarCoords = true
    saveState.value = 'saved'
    saveTimeout = window.setTimeout(() => {
      saveState.value = 'idle'
    }, 2000)
  } catch {
    saveState.value = 'error'
  }
}

onMounted(loadFixtures)
</script>

<template>
  <div class="fixture-editor">
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
          <span class="coords-indicator" :title="fixture.hasStarCoords ? 'Has starCoords' : 'Missing starCoords'">
            {{ fixture.hasStarCoords ? '★' : '✗' }}
          </span>
        </li>
      </ul>
    </aside>

    <main class="editor-main">
      <div v-if="!selectedName" class="empty-state">Select a fixture from the list</div>

      <template v-else>
        <div class="image-wrap">
          <div class="image-container" @click="onImageClick">
            <img
              ref="imgRef"
              :src="`/fixtures/${encodeURIComponent(selectedName)}.png`"
              :alt="selectedName"
              draggable="false"
              @load="onImageLoad"
            />
            <div
              v-if="imgLoaded"
              class="star-marker"
              :style="markerStyle"
              @pointerdown="onMarkerPointerDown"
              @pointermove="onMarkerPointerMove"
              @pointerup="onMarkerPointerUp"
            />
          </div>
        </div>

        <footer class="editor-footer">
          <span class="coords-display">
            x: <strong>{{ coords.x }}</strong>
            &nbsp; y: <strong>{{ coords.y }}</strong>
          </span>
          <span v-if="!hasStarCoords" class="badge badge-warn">no starCoords in fixture</span>
          <button class="save-btn" :disabled="saveState === 'saving'" @click="save">
            {{ saveState === 'saving' ? 'Saving…' : 'Save' }}
          </button>
          <span v-if="saveState === 'saved'" class="badge badge-ok">✓ Saved</span>
          <span v-if="saveState === 'error'" class="badge badge-err">Save failed</span>
        </footer>
      </template>
    </main>
  </div>
</template>

<style scoped>
.fixture-editor {
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

.coords-indicator {
  flex-shrink: 0;
  font-size: 11px;
  color: #666;
}

.fixture-list li.no-coords .coords-indicator {
  color: #f5a623;
}

/* ── Main editor area ── */
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
  cursor: crosshair;
  user-select: none;
}

.image-container img {
  display: block;
  max-width: 100%;
  max-height: calc(100vh - 80px);
  pointer-events: none;
}

/* Crosshair marker */
.star-marker {
  position: absolute;
  width: 20px;
  height: 20px;
  transform: translate(-50%, -50%);
  cursor: grab;
  touch-action: none;
}

.star-marker::before,
.star-marker::after {
  content: '';
  position: absolute;
  background: #ff3b30;
}

/* Vertical bar */
.star-marker::before {
  width: 2px;
  height: 100%;
  left: 50%;
  top: 0;
  transform: translateX(-50%);
}

/* Horizontal bar */
.star-marker::after {
  height: 2px;
  width: 100%;
  top: 50%;
  left: 0;
  transform: translateY(-50%);
}

.star-marker:active {
  cursor: grabbing;
}

/* Outer ring around crosshair */
.star-marker {
  outline: 2px solid rgba(255, 59, 48, 0.6);
  border-radius: 50%;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.5);
}

/* ── Footer ── */
.editor-footer {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  border-top: 1px solid #333;
  background: #1a1a1a;
  flex-shrink: 0;
}

.coords-display {
  font-size: 13px;
  color: #ccc;
}

.coords-display strong {
  color: #fff;
}

.save-btn {
  padding: 4px 16px;
  background: #2c7be5;
  color: #fff;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
  font-family: monospace;
}

.save-btn:disabled {
  opacity: 0.5;
  cursor: default;
}

.save-btn:not(:disabled):hover {
  background: #3a8ef0;
}

.badge {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 10px;
}

.badge-ok {
  background: #1a3a1a;
  color: #4caf50;
  border: 1px solid #4caf5055;
}

.badge-err {
  background: #3a1a1a;
  color: #f44336;
  border: 1px solid #f4433655;
}

.badge-warn {
  background: #3a2a00;
  color: #f5a623;
  border: 1px solid #f5a62355;
}
</style>
