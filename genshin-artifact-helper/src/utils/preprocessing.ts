/**
 * Image preprocessing utilities for improving OCR accuracy
 * Based on techniques optimized for Genshin Impact artifact screenshots
 */

/**
 * Clamp a value between min and max
 */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

/**
 * Convert image to grayscale
 * Uses luminosity method for better perceived brightness
 */
export function toGrayscale(imageData: ImageData): ImageData {
  const data = imageData.data
  const output = new ImageData(imageData.width, imageData.height)

  for (let i = 0; i < data.length; i += 4) {
    // Luminosity method: weighted RGB
    const gray = 0.299 * (data[i] ?? 0) + 0.587 * (data[i + 1] ?? 0) + 0.114 * (data[i + 2] ?? 0)
    output.data[i] = gray
    output.data[i + 1] = gray
    output.data[i + 2] = gray
    output.data[i + 3] = data[i + 3] ?? 255 // Preserve alpha
  }

  return output
}

/**
 * Enhance image contrast
 * @param factor - Contrast factor (1.0 = no change, >1.0 = more contrast)
 */
export function enhanceContrast(imageData: ImageData, factor: number = 1.5): ImageData {
  const data = imageData.data
  const output = new ImageData(imageData.width, imageData.height)

  for (let i = 0; i < data.length; i += 4) {
    output.data[i] = clamp(((data[i] ?? 0) - 128) * factor + 128, 0, 255)
    output.data[i + 1] = clamp(((data[i + 1] ?? 0) - 128) * factor + 128, 0, 255)
    output.data[i + 2] = clamp(((data[i + 2] ?? 0) - 128) * factor + 128, 0, 255)
    output.data[i + 3] = data[i + 3] ?? 255
  }

  return output
}

/**
 * Simple threshold (binarization)
 * @param threshold - Threshold value (0-255)
 */
export function threshold(imageData: ImageData, threshold: number = 128): ImageData {
  const data = imageData.data
  const output = new ImageData(imageData.width, imageData.height)

  for (let i = 0; i < data.length; i += 4) {
    const value = (data[i] ?? 0) > threshold ? 255 : 0
    output.data[i] = value
    output.data[i + 1] = value
    output.data[i + 2] = value
    output.data[i + 3] = 255
  }

  return output
}

/**
 * Calculate local mean for adaptive thresholding
 */
function calculateLocalMean(
  data: Uint8ClampedArray,
  x: number,
  y: number,
  width: number,
  height: number,
  blockSize: number,
): number {
  const half = Math.floor(blockSize / 2)
  let sum = 0
  let count = 0

  for (let dy = -half; dy <= half; dy++) {
    for (let dx = -half; dx <= half; dx++) {
      const nx = x + dx
      const ny = y + dy

      if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
        const idx = (ny * width + nx) * 4
        sum += data[idx] ?? 0
        count++
      }
    }
  }

  return sum / count
}

/**
 * Adaptive threshold - better for varying backgrounds
 * @param blockSize - Size of local region (must be odd, typically 11-15)
 */
export function adaptiveThreshold(imageData: ImageData, blockSize: number = 11): ImageData {
  const width = imageData.width
  const height = imageData.height
  const data = imageData.data
  const output = new ImageData(width, height)

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const localMean = calculateLocalMean(data, x, y, width, height, blockSize)
      const idx = (y * width + x) * 4
      const value = (data[idx] ?? 0) > localMean - 2 ? 255 : 0
      output.data[idx] = value
      output.data[idx + 1] = value
      output.data[idx + 2] = value
      output.data[idx + 3] = 255
    }
  }

  return output
}

/**
 * Invert image colors (black ↔ white)
 * Use after thresholding to convert white-on-black to black-on-white for Tesseract
 */
export function invertColors(imageData: ImageData): ImageData {
  const data = imageData.data
  const output = new ImageData(imageData.width, imageData.height)

  for (let i = 0; i < data.length; i += 4) {
    output.data[i]     = 255 - (data[i] ?? 0)
    output.data[i + 1] = 255 - (data[i + 1] ?? 0)
    output.data[i + 2] = 255 - (data[i + 2] ?? 0)
    output.data[i + 3] = data[i + 3] ?? 255
  }

  return output
}

/**
 * Median filter for noise reduction
 * @param kernelSize - Size of filter kernel (typically 3 or 5)
 */
export function medianFilter(imageData: ImageData, kernelSize: number = 3): ImageData {
  const width = imageData.width
  const height = imageData.height
  const data = imageData.data
  const output = new ImageData(width, height)
  const half = Math.floor(kernelSize / 2)

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const neighbors: number[] = []

      for (let ky = -half; ky <= half; ky++) {
        for (let kx = -half; kx <= half; kx++) {
          const nx = x + kx
          const ny = y + ky
          if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
            const idx = (ny * width + nx) * 4
            neighbors.push(data[idx] ?? 0)
          }
        }
      }

      neighbors.sort((a, b) => a - b)
      const median = neighbors[Math.floor(neighbors.length / 2)] ?? 0

      const idx = (y * width + x) * 4
      output.data[idx] = median
      output.data[idx + 1] = median
      output.data[idx + 2] = median
      output.data[idx + 3] = 255
    }
  }

  return output
}

/**
 * Apply convolution kernel to image
 */
function convolve(imageData: ImageData, kernel: number[], size: number): ImageData {
  const width = imageData.width
  const height = imageData.height
  const data = imageData.data
  const output = new ImageData(width, height)
  const half = Math.floor(size / 2)

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0

      for (let ky = 0; ky < size; ky++) {
        for (let kx = 0; kx < size; kx++) {
          const nx = x + kx - half
          const ny = y + ky - half

          if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
            const idx = (ny * width + nx) * 4
            sum += (data[idx] ?? 0) * (kernel[ky * size + kx] ?? 0)
          }
        }
      }

      const idx = (y * width + x) * 4
      const value = clamp(sum, 0, 255)
      output.data[idx] = value
      output.data[idx + 1] = value
      output.data[idx + 2] = value
      output.data[idx + 3] = 255
    }
  }

  return output
}

/**
 * Sharpen image to enhance text edges
 */
export function sharpen(imageData: ImageData): ImageData {
  const kernel = [0, -1, 0, -1, 5, -1, 0, -1, 0]
  return convolve(imageData, kernel, 3)
}

/**
 * Upscale image using nearest neighbor (best for text)
 * @param canvas - Source canvas
 * @param scale - Scale factor (2 = 2x, 3 = 3x, etc.)
 */
export function upscale(canvas: HTMLCanvasElement, scale: number = 2): HTMLCanvasElement {
  const scaled = document.createElement('canvas')
  scaled.width = canvas.width * scale
  scaled.height = canvas.height * scale

  const ctx = scaled.getContext('2d', { willReadFrequently: true })
  if (!ctx) {
    throw new Error('Failed to get canvas context')
  }

  // Disable image smoothing for crisp text scaling
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(canvas, 0, 0, scaled.width, scaled.height)

  return scaled
}

/**
 * Isolate white text (common in Genshin UI)
 * Useful for extracting text from colored backgrounds
 */
export function isolateWhiteText(imageData: ImageData, threshold: number = 200): ImageData {
  const data = imageData.data
  const output = new ImageData(imageData.width, imageData.height)

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] ?? 0
    const g = data[i + 1] ?? 0
    const b = data[i + 2] ?? 0

    // Check if color is close to white
    const isWhite = r > threshold && g > threshold && b > threshold
    const value = isWhite ? 255 : 0

    output.data[i] = value
    output.data[i + 1] = value
    output.data[i + 2] = value
    output.data[i + 3] = 255
  }

  return output
}

/**
 * Remove dark backgrounds common in Genshin UI
 */
export function removeBackground(imageData: ImageData, threshold: number = 100): ImageData {
  const data = imageData.data
  const output = new ImageData(imageData.width, imageData.height)

  for (let i = 0; i < data.length; i += 4) {
    const brightness = ((data[i] ?? 0) + (data[i + 1] ?? 0) + (data[i + 2] ?? 0)) / 3

    if (brightness < threshold) {
      // Make dark pixels completely black
      output.data[i] = 0
      output.data[i + 1] = 0
      output.data[i + 2] = 0
    } else {
      // Keep bright pixels
      output.data[i] = data[i] ?? 0
      output.data[i + 1] = data[i + 1] ?? 0
      output.data[i + 2] = data[i + 2] ?? 0
    }
    output.data[i + 3] = 255
  }

  return output
}

/**
 * Apply image processing to canvas and return processed canvas
 */
function processImageData(
  canvas: HTMLCanvasElement,
  processor: (imageData: ImageData) => ImageData,
): void {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) {
    throw new Error('Failed to get canvas context')
  }

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const processed = processor(imageData)
  ctx.putImageData(processed, 0, 0)
}

export interface PreprocessingOptions {
  enhanceContrast?: boolean
  contrastFactor?: number
  denoise?: boolean
  sharpen?: boolean
  adaptive?: boolean
  adaptiveBlockSize?: number
  upscale?: boolean
  scaleFactor?: number
  genshinOptimized?: boolean
  backgroundThreshold?: number
  invert?: boolean
}

/**
 * Complete preprocessing pipeline optimized for Genshin artifact screenshots
 * @param canvas - Input canvas with artifact screenshot
 * @param options - Preprocessing options
 */
export function preprocessArtifactImage(
  canvas: HTMLCanvasElement,
  options: PreprocessingOptions = {},
): HTMLCanvasElement {
  const {
    enhanceContrast: shouldEnhanceContrast = true,
    contrastFactor = 1.8,
    denoise = true,
    sharpen: shouldSharpen = true,
    adaptive = true,
    adaptiveBlockSize = 11,
    upscale: shouldUpscale = true,
    scaleFactor = 2,
    genshinOptimized = true,
    backgroundThreshold = 80,
    invert = false,
  } = options

  // Create a working copy
  const working = document.createElement('canvas')
  working.width = canvas.width
  working.height = canvas.height
  const ctx = working.getContext('2d', { willReadFrequently: true })
  if (!ctx) {
    throw new Error('Failed to get canvas context')
  }
  ctx.drawImage(canvas, 0, 0)

  // 1. Genshin-specific: Remove background and isolate white text
  if (genshinOptimized) {
    processImageData(working, (img) => removeBackground(img, backgroundThreshold))
  }

  // 2. Convert to grayscale
  processImageData(working, toGrayscale)

  // 3. Enhance contrast
  if (shouldEnhanceContrast) {
    processImageData(working, (img) => enhanceContrast(img, contrastFactor))
  }

  // 4. Denoise
  if (denoise) {
    processImageData(working, (img) => medianFilter(img, 3))
  }

  // 5. Sharpen
  if (shouldSharpen) {
    processImageData(working, sharpen)
  }

  // 6. Threshold
  if (adaptive) {
    processImageData(working, (img) => adaptiveThreshold(img, adaptiveBlockSize))
  } else {
    processImageData(working, (img) => threshold(img, 128))
  }

  // 6.5 Invert colors (after thresholding — correct polarity for Tesseract)
  if (invert) {
    processImageData(working, invertColors)
  }

  // 7. Upscale for better OCR
  if (shouldUpscale) {
    return upscale(working, scaleFactor)
  }

  return working
}

/**
 * Quick preprocessing for real-time preview (lighter processing)
 */
export function preprocessQuick(
  canvas: HTMLCanvasElement,
  options: PreprocessingOptions = {},
): HTMLCanvasElement {
  // Use provided options but default to lighter processing for preview
  return preprocessArtifactImage(canvas, {
    enhanceContrast: options.enhanceContrast ?? true,
    contrastFactor: options.contrastFactor ?? 1.5,
    denoise: false, // Skip denoising for preview
    sharpen: false, // Skip sharpening for preview
    adaptive: options.adaptive ?? false,
    adaptiveBlockSize: options.adaptiveBlockSize ?? 11,
    upscale: false, // Skip upscaling for preview
    scaleFactor: options.scaleFactor ?? 2,
    genshinOptimized: options.genshinOptimized ?? true,
    backgroundThreshold: options.backgroundThreshold ?? 80,
  })
}

/**
 * Full preprocessing for OCR (maximum accuracy)
 */
export function preprocessForOCR(
  canvas: HTMLCanvasElement,
  options: PreprocessingOptions = {},
): HTMLCanvasElement {
  // Use provided options or defaults
  return preprocessArtifactImage(canvas, {
    enhanceContrast: options.enhanceContrast ?? true,
    contrastFactor: options.contrastFactor ?? 1.8,
    denoise: options.denoise ?? true,
    sharpen: options.sharpen ?? true,
    adaptive: options.adaptive ?? true,
    adaptiveBlockSize: options.adaptiveBlockSize ?? 11,
    upscale: options.upscale ?? true,
    scaleFactor: options.scaleFactor ?? 2,
    genshinOptimized: options.genshinOptimized ?? true,
    backgroundThreshold: options.backgroundThreshold ?? 80,
  })
}
