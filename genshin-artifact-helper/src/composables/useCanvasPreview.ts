import { ref, computed, watch, nextTick } from 'vue'
import type { Ref } from 'vue'
import { useCaptureStore } from '@/stores/capture'
import { useOCRStore } from '@/stores/ocr'
import { useSettingsStore } from '@/stores/settings'
import { getRegionTemplate, calculateAllRegionPositions } from '@/utils/ocr-region-templates'
import type { ArtifactRegionLayout, ScreenType } from '@/types/ocr-regions'
import type { StarDetectionDebugData, StarDetectionSettings } from '@/utils/star-detection'

export function useCanvasPreview(params: {
  previewCanvasRef: Ref<HTMLCanvasElement | null>
  debugShowOCRRegions: Ref<boolean>
  debugShowStarDetection: Ref<boolean>
  debugShowHistograms: Ref<boolean>
  debugStarData: Ref<StarDetectionDebugData | null>
  starSettings: Ref<StarDetectionSettings>
  starCenterFinderMode: Ref<'legacy' | 'region'>
  starAlgorithmMode: Ref<'legacy' | 'projection'>
  showRegionOffsetSetup: Ref<boolean>
  regionEditorLayout: Ref<ArtifactRegionLayout | null>
  runStarDetectionDebug: () => void
}) {
  const captureStore = useCaptureStore()
  const ocrStore = useOCRStore()
  const settingsStore = useSettingsStore()

  const previewCanvasRef = params.previewCanvasRef
  const showOCRRegions = ref(true)

  const activeLayout = computed(() => {
    if (params.showRegionOffsetSetup.value && params.regionEditorLayout.value) {
      return params.regionEditorLayout.value
    }

    const configuredType = settingsStore.ocrSettings.regions.screenType

    if (configuredType === 'auto') {
      if (params.debugShowOCRRegions.value) {
        return ocrStore.activeLayout ?? getRegionTemplate('inventory')
      }
      return ocrStore.activeLayout
    }

    if (settingsStore.ocrSettings.regions.enabled || params.debugShowOCRRegions.value) {
      try {
        return getRegionTemplate(configuredType as ScreenType)
      } catch {
        return null
      }
    }

    return null
  })

  function redrawPreview(): void {
    const image = captureStore.capturedImage
    const layout = activeLayout.value
    if (!image || !previewCanvasRef.value) return

    const ctx = previewCanvasRef.value.getContext('2d')
    if (!ctx) return

    const displayCanvas = image.preprocessed ?? image.original
    previewCanvasRef.value.width = displayCanvas.width
    previewCanvasRef.value.height = displayCanvas.height
    ctx.drawImage(displayCanvas, 0, 0)

    if (
      (showOCRRegions.value || params.debugShowOCRRegions.value || params.showRegionOffsetSetup.value) &&
      layout
    ) {
      drawOCRRegions(ctx, layout, previewCanvasRef.value.width, previewCanvasRef.value.height)
    }

    if (params.debugShowStarDetection.value && params.debugStarData.value) {
      drawStarDetectionData(ctx, params.debugStarData.value)
    }

    if (params.debugShowHistograms.value && params.debugStarData.value) {
      drawHistograms(
        ctx,
        params.debugStarData.value,
        previewCanvasRef.value.width,
        previewCanvasRef.value.height,
      )
    }
  }

  watch(
    [
      () => captureStore.capturedImage,
      activeLayout,
      showOCRRegions,
      params.debugShowOCRRegions,
      params.debugShowStarDetection,
      params.debugShowHistograms,
      () => ocrStore.detectedRarityBounds,
      params.starSettings,
      params.starCenterFinderMode,
      params.starAlgorithmMode,
    ],
    async ([, , , , newDebugStar]) => {
      await nextTick()
      if (newDebugStar) {
        params.runStarDetectionDebug()
      }
      redrawPreview()
    },
    { deep: true },
  )

  watch(
    () => captureStore.capturedImage,
    async (newImage) => {
      if (newImage) {
        await nextTick()
        ocrStore.detectArtifactDescription(newImage.original)
      }
    },
  )

  function drawOCRRegions(
    ctx: CanvasRenderingContext2D,
    layout: ArtifactRegionLayout,
    width: number,
    height: number,
  ): void {
    ctx.lineWidth = 2
    ctx.font = 'bold 12px sans-serif'
    ctx.textBaseline = 'bottom'

    const drawRegionPixels = (
      x: number,
      y: number,
      w: number,
      h: number,
      label: string,
      color: string,
    ) => {
      ctx.strokeStyle = color
      ctx.fillStyle = color
      ctx.strokeRect(x, y, w, h)

      const textWidth = ctx.measureText(label).width
      ctx.globalAlpha = 0.7
      ctx.fillRect(x, y - 18, textWidth + 10, 18)
      ctx.globalAlpha = 1.0
      ctx.fillStyle = '#000'
      ctx.fillText(label, x + 5, y - 2)
    }

    const drawAnchorMarker = (x: number, y: number) => {
      const cs = 10
      ctx.strokeStyle = '#00ccff'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(x - cs, y)
      ctx.lineTo(x + cs, y)
      ctx.moveTo(x, y - cs)
      ctx.lineTo(x, y + cs)
      ctx.stroke()
      ctx.fillStyle = '#00ccff'
      ctx.beginPath()
      ctx.arc(x, y, 3, 0, Math.PI * 2)
      ctx.fill()
    }

    const anchor = !params.showRegionOffsetSetup.value ? ocrStore.detectedAnchorPx : null
    const detectedPositions = anchor
      ? calculateAllRegionPositions(layout, width, height, anchor)
      : null

    if (detectedPositions) {
      for (const [name, region] of Object.entries(layout.regions)) {
        const pos = detectedPositions.get((region as any).name)
        if (pos) {
          const label = name.replace(/([A-Z])/g, ' $1').toLowerCase()
          drawRegionPixels(pos.x, pos.y, pos.width, pos.height, label, '#ff9900')
        }
      }
      drawAnchorMarker(anchor!.x, anchor!.y)
    } else {
      const anchorPt = layout.anchorPoint
      if (!anchorPt) return
      const anchorPx = { x: anchorPt.x * width, y: anchorPt.y * height }
      const templatePositions = calculateAllRegionPositions(layout, width, height, anchorPx)
      for (const [name, region] of Object.entries(layout.regions)) {
        const pos = templatePositions.get((region as any).name)
        if (pos) {
          const label = name.replace(/([A-Z])/g, ' $1').toLowerCase()
          drawRegionPixels(pos.x, pos.y, pos.width, pos.height, label, '#00ff00')
        }
      }
      drawAnchorMarker(anchorPx.x, anchorPx.y)
    }
  }

  function drawStarDetectionData(
    ctx: CanvasRenderingContext2D,
    data: StarDetectionDebugData,
  ): void {
    const { blocks, detectedCenter, starCount } = data

    for (const block of blocks) {
      if (block.isConfirmed) {
        ctx.fillStyle = 'rgba(149,255,50,0.35)'
        ctx.strokeStyle = 'rgba(94,255,50,0.9)'
      } else if (block.isPass1Match) {
        ctx.fillStyle = 'rgba(255, 80, 80, 0.25)'
        ctx.strokeStyle = 'rgba(255, 80, 80, 0.7)'
      } else {
        ctx.fillStyle = 'rgba(158,158,158,0.18)'
        ctx.strokeStyle = 'rgba(55,55,55,0.58)'
      }
      ctx.lineWidth = 1
      ctx.fillRect(block.x, block.y, block.size, block.size)
      ctx.strokeRect(block.x, block.y, block.size, block.size)
    }

    if (data.projColumnRegions !== null) {
      const canvasH = ctx.canvas.height

      ctx.lineWidth = 1
      for (const col of data.projColumnRegions) {
        const w = col.end - col.start + 1
        const boxH = Math.round(canvasH * 0.06)
        ctx.fillStyle = 'rgba(255, 180, 0, 0.30)'
        ctx.strokeStyle = 'rgba(255, 180, 0, 0.70)'
        ctx.fillRect(col.start, canvasH - boxH, w, boxH)
        ctx.strokeRect(col.start, canvasH - boxH, w, boxH)
      }

      if (data.projRowRegions) {
        for (const row of data.projRowRegions) {
          ctx.fillStyle = 'rgba(0, 220, 255, 0.08)'
          ctx.fillRect(0, row.start, ctx.canvas.width, row.end - row.start + 1)
        }
      }

      if (data.projPeakY !== null) {
        ctx.strokeStyle = 'rgba(0, 220, 255, 0.80)'
        ctx.lineWidth = 1.5
        ctx.setLineDash([4, 4])
        ctx.beginPath()
        ctx.moveTo(0, data.projPeakY)
        ctx.lineTo(ctx.canvas.width, data.projPeakY)
        ctx.stroke()
        ctx.setLineDash([])
      }

      if (data.projStarRegions) {
        ctx.font = 'bold 11px sans-serif'
        ctx.textBaseline = 'bottom'
        for (let i = 0; i < data.projStarRegions.length; i++) {
          const col = data.projStarRegions[i]!
          const w = col.end - col.start + 1
          const boxH = Math.round(canvasH * 0.04)
          ctx.fillStyle = 'rgba(255, 215, 0, 0.45)'
          ctx.strokeStyle = 'rgba(255, 215, 0, 1.0)'
          ctx.lineWidth = 1.5
          ctx.fillRect(col.start, canvasH - boxH, w, boxH)
          ctx.strokeRect(col.start, canvasH - boxH, w, boxH)
          ctx.fillStyle = 'rgba(255, 215, 0, 1.0)'
          ctx.fillText(`${i + 1}`, col.start + 1, canvasH - boxH - 1)
        }
      }
    }

    if (detectedCenter) {
      const cs = 12
      ctx.strokeStyle = '#ff2222'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(detectedCenter.x - cs, detectedCenter.y)
      ctx.lineTo(detectedCenter.x + cs, detectedCenter.y)
      ctx.moveTo(detectedCenter.x, detectedCenter.y - cs)
      ctx.lineTo(detectedCenter.x, detectedCenter.y + cs)
      ctx.stroke()

      ctx.fillStyle = '#ff2222'
      ctx.beginPath()
      ctx.arc(detectedCenter.x, detectedCenter.y, 4, 0, Math.PI * 2)
      ctx.fill()

      if (starCount !== null) {
        ctx.font = 'bold 14px sans-serif'
        ctx.fillStyle = '#ff2222'
        ctx.textBaseline = 'middle'
        ctx.fillText(`${starCount}★`, detectedCenter.x + 14, detectedCenter.y)
      }
    }
  }

  function drawHistograms(
    ctx: CanvasRenderingContext2D,
    data: StarDetectionDebugData,
    width: number,
    height: number,
  ): void {
    const { columnHistogram, rowHistogram } = data
    const maxCol = Math.max(1, ...columnHistogram)
    const maxRow = Math.max(1, ...rowHistogram)
    const colBarMaxH = Math.round(height * 0.2)
    const rowBarMaxW = Math.round(width * 0.2)

    ctx.fillStyle = 'rgba(255, 204, 50, 0.55)'

    for (let x = 0; x < columnHistogram.length; x++) {
      const barH = Math.round(((columnHistogram[x] ?? 0) / maxCol) * colBarMaxH)
      if (barH > 0) ctx.fillRect(x, height - barH, 1, barH)
    }

    for (let y = 0; y < rowHistogram.length; y++) {
      const barW = Math.round(((rowHistogram[y] ?? 0) / maxRow) * rowBarMaxW)
      if (barW > 0) ctx.fillRect(width - barW, y, barW, 1)
    }

    ctx.strokeStyle = 'rgba(255, 204, 50, 0.35)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(0, height - colBarMaxH)
    ctx.lineTo(width, height - colBarMaxH)
    ctx.moveTo(width - rowBarMaxW, 0)
    ctx.lineTo(width - rowBarMaxW, height)
    ctx.stroke()
  }

  return {
    previewCanvasRef,
    showOCRRegions,
    activeLayout,
    redrawPreview,
  }
}
