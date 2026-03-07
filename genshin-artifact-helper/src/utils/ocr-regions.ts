/**
 * Region-based OCR processing
 * Processes specific regions of artifact screenshots for improved accuracy and performance
 */

import type {
  ArtifactRegionLayout,
  RegionOCRResult,
  RegionOCROptions,
  RegionBasedOCRResult,
  OCRRegion,
  StarDetectionResult,
} from '@/types/ocr-regions'
import { OCR_WHITELISTS } from '@/types/ocr-regions'
import type { OCRConfig } from './ocr'
import { getOCRWorker, DEFAULT_OCR_CONFIG } from './ocr'
import { calculateAllRegionPositions } from './ocr-region-templates'
import { cropCanvas, preprocessRegion, regionContainsText } from './region-extraction'
import type { PreprocessingOptions } from '@/stores/settings'

/**
 * Process a single region with OCR
 */
async function processRegion(
  sourceCanvas: HTMLCanvasElement,
  region: OCRRegion,
  position: { x: number; y: number; width: number; height: number },
  basePreprocessingOptions: PreprocessingOptions,
  debug: boolean = false,
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
        processingTime: Date.now() - startTime,
      }
    }

    // 3. Apply region-specific preprocessing
    const preprocessed = preprocessRegion(cropped, region, basePreprocessingOptions)

    // 4. Configure OCR for this region
    const ocrConfig: OCRConfig = {
      ...DEFAULT_OCR_CONFIG,
      whitelist: region.whitelist ?? OCR_WHITELISTS[region.ocrMode],
    }

    // For number-only regions, use more restrictive PSM
    if (region.ocrMode === 'number') {
      ocrConfig.psm = 7 // Single text line
    } else if (region.multiLine) {
      ocrConfig.psm = 6 // Uniform block
    } else {
      ocrConfig.psm = 7 // Single line
    }

    // 5. Run OCR
    const worker = getOCRWorker(ocrConfig)
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
  basePreprocessingOptions: PreprocessingOptions,
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

    promises.push(processRegion(sourceCanvas, region, position, basePreprocessingOptions, options.debug ?? false))
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
  basePreprocessingOptions: PreprocessingOptions,
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
      basePreprocessingOptions,
      options.debug ?? false,
    )
    results.push(result)
  }

  return results
}

/**
 * Main function: Recognize all regions in an artifact image
 */
export async function recognizeRegions(
  canvas: HTMLCanvasElement,
  layout: ArtifactRegionLayout,
  basePreprocessingOptions: PreprocessingOptions,
  options: RegionOCROptions = {},
): Promise<RegionBasedOCRResult> {
  const startTime = Date.now()
  const warnings: string[] = []

  try {
    // 1. Optionally detect stars for anchoring
    let starDetection: StarDetectionResult | undefined
    let anchorOffset: { x: number; y: number } | undefined

    if (options.useStarAnchor && layout.anchorRegion) {
      try {
        // TODO: Implement star detection
        // For now, skip anchoring
        // starDetection = await detectStars(canvas, layout.anchorRegion)
        // anchorOffset = { x: starDetection.position.x, y: starDetection.position.y }
        warnings.push('Star anchor detection not yet implemented')
      } catch (error) {
        warnings.push(`Star detection failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
      }
    }

    // 2. Calculate pixel positions for all regions
    const positions = calculateAllRegionPositions(
      layout,
      canvas.width,
      canvas.height,
      anchorOffset,
    )

    // 3. Process regions
    const regionResults = options.parallelProcessing
      ? await processRegionsParallel(canvas, layout, positions, basePreprocessingOptions, options)
      : await processRegionsSequential(canvas, layout, positions, basePreprocessingOptions, options)

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

/**
 * Filter results to only include regions with valid text
 */
export function getValidRegionResults(results: RegionOCRResult[]): RegionOCRResult[] {
  return results.filter((r) => r.text.length > 0 && r.confidence > 0.5)
}

/**
 * Get lowest confidence region (for debugging)
 */
export function getLowestConfidenceRegion(results: RegionOCRResult[]): RegionOCRResult | null {
  const valid = getValidRegionResults(results)
  if (valid.length === 0) return null

  return valid.reduce((lowest, current) =>
    current.confidence < lowest.confidence ? current : lowest,
  )
}

/**
 * Get total text length extracted (for quality check)
 */
export function getTotalTextLength(results: RegionOCRResult[]): number {
  return results.reduce((sum, r) => sum + r.text.length, 0)
}

/**
 * Format region results for debugging/logging
 */
export function formatRegionResults(results: RegionOCRResult[]): string {
  let formatted = '=== Region OCR Results ===\n'

  for (const result of results) {
    formatted += `\n[${result.regionName}] (confidence: ${(result.confidence * 100).toFixed(1)}%)\n`
    formatted += `  "${result.text}"\n`
    formatted += `  Time: ${result.processingTime}ms\n`
  }

  return formatted
}

/**
 * Estimate processing time based on region count and parallelization
 */
export function estimateProcessingTime(
  regionCount: number,
  parallel: boolean,
  avgTimePerRegion: number = 200,
): number {
  if (parallel) {
    // Parallel: dominated by slowest region + overhead
    return Math.ceil(avgTimePerRegion * 1.2) // 20% overhead
  } else {
    // Sequential: sum of all regions
    return regionCount * avgTimePerRegion
  }
}
