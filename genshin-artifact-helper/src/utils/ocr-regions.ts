/**
 * Region-based OCR processing
 * Processes specific regions of artifact screenshots for improved accuracy and performance
 */

import type {
  ArtifactRegionLayout,
  Rectangle,
  RegionOCRResult,
  RegionOCROptions,
  RegionBasedOCRResult,
  OCRRegion,
  PreprocessingOptions,
} from '@/types/ocr-regions'
import { getOCRWorker } from './ocr'
import { calculateAllRegionPositions } from './ocr-region-templates'
import { cropCanvas, preprocessRegion, regionContainsText } from './region-extraction'
import { detectStarsInFullScreen } from './star-detection'

/**
 * Process a single region with OCR
 */
async function processRegion(
  sourceCanvas: HTMLCanvasElement,
  region: OCRRegion,
  position: { x: number; y: number; width: number; height: number },
  layoutPreprocessingOptions: ArtifactRegionLayout['defaultPreprocessingOptions'],
  debug: boolean = false,
  debugPreprocessingOverrides?: Partial<PreprocessingOptions>,
): Promise<RegionOCRResult> {
  const startTime = Date.now()

  try {
    // 1. Crop region from source image
    const cropped = cropCanvas(sourceCanvas, position)

    // 2. Skip optional regions that appear empty
    if (region.optional && !regionContainsText(cropped)) {
      return {
        regionName: region.name,
        text: '',
        confidence: 1.0, // Empty is expected for optional regions
        position,
        preprocessedCanvas: cropped,
        processingTime: Date.now() - startTime,
      }
    }

    // 3. Apply preprocessing — layout defaults merged with any region-specific overrides, then debug overrides
    const preprocessed = preprocessRegion(cropped, region, layoutPreprocessingOptions, debugPreprocessingOverrides)

    // 5. Run OCR
    const worker = getOCRWorker()
    if (!worker.initialized) {
      await worker.initialize()
    }

    const result = await worker.recognize(preprocessed)

    // 6. Save debug images if enabled
    if (debug) {
      console.log(`[OCR Region: ${region.name}]`, {
        text: result.data.text,
        confidence: result.data.confidence,
        position,
      })
    }

    return {
      regionName: region.name,
      text: result.data.text.trim(),
      confidence: result.data.confidence / 100, // Tesseract returns 0-100
      position,
      preprocessedCanvas: preprocessed,
      processingTime: Date.now() - startTime,
    }
  } catch (error) {
    console.error(`Failed to process region ${region.name}:`, error)
    return {
      regionName: region.name,
      text: '',
      confidence: 0,
      position,
      processingTime: Date.now() - startTime,
    }
  }
}

/**
 * Process all regions in parallel
 */
async function processRegionsParallel(
  sourceCanvas: HTMLCanvasElement,
  layout: ArtifactRegionLayout,
  positions: Map<string, { x: number; y: number; width: number; height: number }>,
  options: RegionOCROptions,
): Promise<RegionOCRResult[]> {
  const promises: Promise<RegionOCRResult>[] = []

  for (const [key, region] of Object.entries(layout.regions)) {
    const position = positions.get(region.name)
    if (!position) {
      console.warn(`No position found for region: ${region.name}`)
      continue
    }

    // Skip optional regions if requested
    if (options.skipOptional && region.optional) {
      continue
    }

    promises.push(processRegion(sourceCanvas, region, position, layout.defaultPreprocessingOptions, options.debug ?? false, options.debugPreprocessingOverrides))
  }

  return Promise.all(promises)
}

/**
 * Process all regions sequentially
 */
async function processRegionsSequential(
  sourceCanvas: HTMLCanvasElement,
  layout: ArtifactRegionLayout,
  positions: Map<string, { x: number; y: number; width: number; height: number }>,
  options: RegionOCROptions,
): Promise<RegionOCRResult[]> {
  const results: RegionOCRResult[] = []

  for (const [key, region] of Object.entries(layout.regions)) {
    const position = positions.get(region.name)
    if (!position) {
      console.warn(`No position found for region: ${region.name}`)
      continue
    }

    // Skip optional regions if requested
    if (options.skipOptional && region.optional) {
      continue
    }

    const result = await processRegion(
      sourceCanvas,
      region,
      position,
      layout.defaultPreprocessingOptions,
      options.debug ?? false,
      options.debugPreprocessingOverrides,
    )
    results.push(result)
  }

  return results
}

/**
 * Main function: Recognize all regions in an artifact image.
 * Runs star detection to determine the anchor point unless options.anchorOverride is provided.
 * Throws if no stars are found (and no override is supplied).
 *
 * Preprocessing is controlled entirely by the layout's defaultPreprocessingOptions
 * (with per-region overrides via OCRRegion.preprocessingOverrides).
 */
export async function recognizeRegions(
  canvas: HTMLCanvasElement,
  layout: ArtifactRegionLayout,
  options: RegionOCROptions = {},
): Promise<RegionBasedOCRResult> {
  const startTime = Date.now()
  const warnings: string[] = []

  try {
    // 1. Determine anchor point — use override if provided, otherwise run star detection
    let starDetection: RegionBasedOCRResult['starDetection']
    let anchorPx: { x: number; y: number }
    let starRegionBounds: Rectangle | undefined

    if (options.anchorOverride) {
      anchorPx = options.anchorOverride
      starDetection = undefined
      starRegionBounds = undefined
    } else {
      const fullScreenDetection = detectStarsInFullScreen(canvas, canvas.height)
      if (!fullScreenDetection) {
        throw new Error('Star detection failed: no stars found')
      }
      starDetection = fullScreenDetection.stars
      anchorPx = { x: starDetection.position.x, y: starDetection.position.y }
      starRegionBounds = fullScreenDetection.regionBounds
    }

    // 2. Calculate pixel positions for all regions from anchor
    const positions = calculateAllRegionPositions(layout, canvas.width, canvas.height, anchorPx)
    // Store star region bounds for UI visualization (only available when star detection ran)
    if (starRegionBounds) {
      positions.set('starAnchor', starRegionBounds)
    }

    // 3. Process regions using layout-defined preprocessing as ground truth
    const regionResults = options.parallelProcessing
      ? await processRegionsParallel(canvas, layout, positions, options)
      : await processRegionsSequential(canvas, layout, positions, options)

    // 4. Calculate overall confidence
    const validResults = regionResults.filter((r) => r.text.length > 0)
    const overallConfidence =
      validResults.length > 0
        ? validResults.reduce((sum, r) => sum + r.confidence, 0) / validResults.length
        : 0

    // 5. Check for missing required regions
    const requiredRegions = ['level', 'mainStatName', 'mainStatValue']
    for (const required of requiredRegions) {
      const result = regionResults.find((r) => r.regionName === required)
      if (!result || result.text.length === 0) {
        warnings.push(`Required region missing or empty: ${required}`)
      }
    }

    return {
      regions: regionResults,
      screenType: layout.screenType,
      layout,
      starDetection,
      overallConfidence,
      totalProcessingTime: Date.now() - startTime,
      warnings,
    }
  } catch (error) {
    throw new Error(
      `Region-based OCR failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    )
  }
}

/**
 * Get OCR results grouped by region name for easy access
 */
export function getRegionResultsMap(
  results: RegionOCRResult[],
): Map<string, RegionOCRResult> {
  const map = new Map<string, RegionOCRResult>()
  for (const result of results) {
    map.set(result.regionName, result)
  }
  return map
}
