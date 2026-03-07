/**
 * Utilities for extracting and preprocessing image regions
 */

import type { Rectangle, OCRRegion } from '@/types/ocr-regions'
import type { PreprocessingOptions } from '@/stores/settings'
import {
  toGrayscale,
  enhanceContrast,
  sharpen,
  medianFilter,
  adaptiveThreshold,
  upscale,
  removeBackground,
} from './preprocessing'

/**
 * Crop a canvas to a specific region
 */
export function cropCanvas(
  sourceCanvas: HTMLCanvasElement,
  region: Rectangle,
): HTMLCanvasElement {
  // Clamp region to canvas bounds
  const x = Math.max(0, Math.min(region.x, sourceCanvas.width))
  const y = Math.max(0, Math.min(region.y, sourceCanvas.height))
  const width = Math.max(1, Math.min(region.width, sourceCanvas.width - x))
  const height = Math.max(1, Math.min(region.height, sourceCanvas.height - y))

  // Create new canvas for cropped region
  const cropped = document.createElement('canvas')
  cropped.width = width
  cropped.height = height

  const ctx = cropped.getContext('2d', { willReadFrequently: true })
  if (!ctx) {
    throw new Error('Failed to get canvas context for cropping')
  }

  // Draw cropped region
  ctx.drawImage(
    sourceCanvas,
    x,
    y,
    width,
    height,
    0,
    0,
    width,
    height,
  )

  return cropped
}

/**
 * Extract multiple regions from a canvas in parallel
 */
export function extractRegions(
  sourceCanvas: HTMLCanvasElement,
  regions: Map<string, Rectangle>,
): Map<string, HTMLCanvasElement> {
  const extracted = new Map<string, HTMLCanvasElement>()

  for (const [name, region] of regions.entries()) {
    extracted.set(name, cropCanvas(sourceCanvas, region))
  }

  return extracted
}

/**
 * Get preprocessing options optimized for a specific OCR mode
 */
export function getPreprocessingForMode(
  ocrMode: OCRRegion['ocrMode'],
  baseOptions: PreprocessingOptions,
): PreprocessingOptions {
  // Start with base options
  const options = { ...baseOptions }

  // Mode-specific adjustments
  switch (ocrMode) {
    case 'number':
      // Numbers: aggressive preprocessing for clarity
      return {
        ...options,
        enhanceContrast: true,
        contrastFactor: 2.2,
        denoise: true,
        sharpen: true,
        adaptive: false, // Simple threshold works better for numbers
        upscale: true,
        scaleFactor: 3, // Higher upscale for small numbers
        genshinOptimized: true,
        backgroundThreshold: 180,
      }

    case 'text':
      // Text: balanced preprocessing
      return {
        ...options,
        enhanceContrast: true,
        contrastFactor: 1.8,
        denoise: false, // Can blur text edges
        sharpen: true,
        adaptive: true, // Better for varying text backgrounds
        adaptiveBlockSize: 11,
        upscale: true,
        scaleFactor: 2,
        genshinOptimized: true,
        backgroundThreshold: 160,
      }

    case 'mixed':
      // Mixed (stat names + values): moderate preprocessing
      return {
        ...options,
        enhanceContrast: true,
        contrastFactor: 2.0,
        denoise: false,
        sharpen: true,
        adaptive: true,
        adaptiveBlockSize: 11,
        upscale: true,
        scaleFactor: 2,
        genshinOptimized: true,
        backgroundThreshold: 170,
      }

    case 'stars':
      // Stars: minimal preprocessing (use image analysis instead)
      return {
        ...options,
        enhanceContrast: false,
        denoise: false,
        sharpen: false,
        adaptive: false,
        upscale: false,
        genshinOptimized: false,
      }

    default:
      return options
  }
}

/**
 * Preprocess a canvas for OCR based on region-specific settings
 */
export function preprocessRegion(
  canvas: HTMLCanvasElement,
  region: OCRRegion,
  baseOptions: PreprocessingOptions,
): HTMLCanvasElement {
  // Get mode-specific options
  let options = getPreprocessingForMode(region.ocrMode, baseOptions)

  // Apply region-specific overrides
  if (region.preprocessingOverrides) {
    options = {
      ...options,
      ...region.preprocessingOverrides,
    }
  }

  // Create working canvas
  const working = document.createElement('canvas')
  working.width = canvas.width
  working.height = canvas.height
  const ctx = working.getContext('2d', { willReadFrequently: true })
  if (!ctx) {
    throw new Error('Failed to get canvas context for preprocessing')
  }
  ctx.drawImage(canvas, 0, 0)

  // Helper to apply processing to imageData
  function processImageData(processor: (imageData: ImageData) => ImageData): void {
    if (!ctx) return
    const imageData = ctx.getImageData(0, 0, working.width, working.height)
    const processed = processor(imageData)
    ctx.putImageData(processed, 0, 0)
  }

  // Apply preprocessing pipeline
  if (options.genshinOptimized) {
    processImageData((img) => removeBackground(img, options.backgroundThreshold))
  }

  // Convert to grayscale
  processImageData(toGrayscale)

  // Enhance contrast
  if (options.enhanceContrast) {
    processImageData((img) => enhanceContrast(img, options.contrastFactor))
  }

  // Denoise
  if (options.denoise) {
    processImageData((img) => medianFilter(img, 3))
  }

  // Sharpen
  if (options.sharpen) {
    processImageData(sharpen)
  }

  // Threshold
  if (options.adaptive) {
    processImageData((img) => adaptiveThreshold(img, options.adaptiveBlockSize))
  }

  // Upscale (returns new canvas)
  if (options.upscale) {
    return upscale(working, options.scaleFactor)
  }

  return working
}

/**
 * Preprocess multiple regions in batch
 */
export function preprocessRegions(
  regions: Map<string, HTMLCanvasElement>,
  regionConfigs: Map<string, OCRRegion>,
  baseOptions: PreprocessingOptions,
): Map<string, HTMLCanvasElement> {
  const preprocessed = new Map<string, HTMLCanvasElement>()

  for (const [name, canvas] of regions.entries()) {
    const config = regionConfigs.get(name)
    if (!config) {
      // No config, use original
      preprocessed.set(name, canvas)
      continue
    }

    preprocessed.set(name, preprocessRegion(canvas, config, baseOptions))
  }

  return preprocessed
}

/**
 * Add visual debug overlay to a canvas (region boundaries)
 */
export function addDebugOverlay(
  canvas: HTMLCanvasElement,
  regions: Map<string, Rectangle>,
  labels: boolean = true,
): HTMLCanvasElement {
  const debug = document.createElement('canvas')
  debug.width = canvas.width
  debug.height = canvas.height

  const ctx = debug.getContext('2d')
  if (!ctx) return canvas

  // Draw original image
  ctx.drawImage(canvas, 0, 0)

  // Draw region overlays
  const colors = [
    '#ff0000',
    '#00ff00',
    '#0000ff',
    '#ffff00',
    '#ff00ff',
    '#00ffff',
    '#ff8800',
    '#8800ff',
    '#00ff88',
  ]
  let colorIndex = 0

  for (const [name, region] of regions.entries()) {
    const color = colors[colorIndex % colors.length] ?? '#ffffff'
    colorIndex++

    // Draw rectangle
    ctx.strokeStyle = color
    ctx.lineWidth = 2
    ctx.strokeRect(region.x, region.y, region.width, region.height)

    // Draw label if enabled
    if (labels) {
      ctx.fillStyle = color
      ctx.font = '12px monospace'
      ctx.fillRect(region.x, region.y - 14, ctx.measureText(name).width + 4, 14)
      ctx.fillStyle = '#000'
      ctx.fillText(name, region.x + 2, region.y - 2)
    }
  }

  return debug
}

/**
 * Save canvas to data URL for debugging
 */
export function canvasToDataURL(canvas: HTMLCanvasElement, type: string = 'image/png'): string {
  return canvas.toDataURL(type)
}

/**
 * Detect if a region likely contains text (quick heuristic)
 * Useful for skipping empty optional regions
 */
export function regionContainsText(canvas: HTMLCanvasElement, threshold: number = 0.01): boolean {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return false

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const data = imageData.data

  // Count non-white pixels
  let darkPixels = 0
  const totalPixels = canvas.width * canvas.height

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] ?? 0
    const g = data[i + 1] ?? 0
    const b = data[i + 2] ?? 0
    const brightness = (r + g + b) / 3

    if (brightness < 200) {
      // Not white
      darkPixels++
    }
  }

  const darkRatio = darkPixels / totalPixels
  return darkRatio > threshold
}

/**
 * Resize canvas while maintaining aspect ratio
 */
export function resizeCanvas(
  canvas: HTMLCanvasElement,
  maxWidth: number,
  maxHeight: number,
): HTMLCanvasElement {
  const aspectRatio = canvas.width / canvas.height

  let newWidth = canvas.width
  let newHeight = canvas.height

  if (canvas.width > maxWidth) {
    newWidth = maxWidth
    newHeight = newWidth / aspectRatio
  }

  if (newHeight > maxHeight) {
    newHeight = maxHeight
    newWidth = newHeight * aspectRatio
  }

  if (newWidth === canvas.width && newHeight === canvas.height) {
    return canvas
  }

  const resized = document.createElement('canvas')
  resized.width = newWidth
  resized.height = newHeight

  const ctx = resized.getContext('2d')
  if (!ctx) return canvas

  ctx.drawImage(canvas, 0, 0, newWidth, newHeight)
  return resized
}

/**
 * Pad canvas with white space (useful for edge regions)
 */
export function padCanvas(
  canvas: HTMLCanvasElement,
  padding: number,
  color: string = '#ffffff',
): HTMLCanvasElement {
  const padded = document.createElement('canvas')
  padded.width = canvas.width + padding * 2
  padded.height = canvas.height + padding * 2

  const ctx = padded.getContext('2d')
  if (!ctx) return canvas

  // Fill with background color
  ctx.fillStyle = color
  ctx.fillRect(0, 0, padded.width, padded.height)

  // Draw original canvas in center
  ctx.drawImage(canvas, padding, padding)

  return padded
}
