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
      return {
        ...options,
      }

    case 'text':
      return {
        ...options,
      }

    case 'mixed':
      return {
        ...options,
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
  globalOverrides?: Partial<PreprocessingOptions>,
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

  // Apply debug global overrides at maximum priority (wins over all template settings)
  if (globalOverrides) {
    options = { ...options, ...globalOverrides }
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
  if (options.grayscale) {
    processImageData(toGrayscale)
  }

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
