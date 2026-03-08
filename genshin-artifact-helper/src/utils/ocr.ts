/**
 * OCR utilities using Tesseract.js for artifact text recognition
 */

import {createWorker, type RecognizeResult, type Worker} from 'tesseract.js'

/**
 * OCR configuration optimized for Genshin artifact screenshots
 */
export interface OCRConfig {
  /** Language (default: 'eng') */
  lang?: string
  /** Page Segmentation Mode (default: 6 = single uniform block) */
  psm?: number
  /** Character whitelist for better accuracy */
  whitelist?: string
  /** Enable OEM (OCR Engine Mode) - default: 3 = both LSTM + legacy */
  oem?: number
}

/**
 * Default OCR configuration for Genshin artifacts
 */
export const DEFAULT_OCR_CONFIG: OCRConfig = {
  lang: 'genshin',
  psm: 6, // Single uniform block of text
  // Whitelist: numbers, decimal, percent, plus, space, and common artifact stat characters
  whitelist: '0123456789.%+ ATKHPDEFCRITRateDmgElementalMasteryEnergyRchgFlowerPlumeSndsGobletCirc',
  oem: 3, // Default: use both LSTM and legacy engine
}

/**
 * OCR progress callback
 */
export type OCRProgressCallback = (progress: {
  status: string
  progress: number // 0-1
}) => void

/**
 * OCR worker wrapper with lifecycle management
 */
export class OCRWorker {
  private worker: Worker | null = null
  private isInitialized = false
  private config: OCRConfig

  constructor(config: OCRConfig = DEFAULT_OCR_CONFIG) {
    this.config = { ...DEFAULT_OCR_CONFIG, ...config }
  }

  /**
   * Initialize the Tesseract worker
   */
  async initialize(onProgress?: OCRProgressCallback): Promise<void> {
    if (this.isInitialized && this.worker) {
      return
    }

    try {
      // Create worker with OEM in constructor (can't be changed after init)
      const workerOptions: any = {
        langPath: '/tessdata',
        gzip: false,
      }
      if (onProgress) {
        workerOptions.logger = (m: any) => {
          onProgress({
            status: m.status,
            progress: m.progress || 0,
          })
        }
      }

      this.worker = await createWorker(this.config.lang || 'eng', this.config.oem || 3, workerOptions)

      // Set parameters (only non-init params)
      await this.worker.setParameters({
        tessedit_pageseg_mode: String(this.config.psm || 6) as any,
        tessedit_char_whitelist: this.config.whitelist || '',
      })

      this.isInitialized = true
    } catch (error) {
      this.isInitialized = false
      throw new Error(
        `Failed to initialize OCR worker: ${error instanceof Error ? error.message : 'Unknown error'}`,
      )
    }
  }

  /**
   * Recognize text from an image
   */
  async recognize(
    image: HTMLCanvasElement | HTMLImageElement | string,
    onProgress?: OCRProgressCallback,
  ): Promise<RecognizeResult> {
    if (!this.worker || !this.isInitialized) {
      throw new Error('OCR worker not initialized. Call initialize() first.')
    }

    try {
      return await this.worker.recognize(image)
    } catch (error) {
      throw new Error(
        `OCR recognition failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      )
    }
  }

  /**
   * Terminate the worker and free resources
   */
  async terminate(): Promise<void> {
    if (this.worker) {
      await this.worker.terminate()
      this.worker = null
      this.isInitialized = false
    }
  }

  /**
   * Check if worker is initialized
   */
  get initialized(): boolean {
    return this.isInitialized
  }
}

/**
 * Singleton OCR worker instance for reuse across the application
 */
let globalWorker: OCRWorker | null = null

/**
 * Get or create the global OCR worker instance
 */
export function getOCRWorker(config?: OCRConfig): OCRWorker {
  if (!globalWorker) {
    globalWorker = new OCRWorker(config)
  }
  return globalWorker
}

/**
 * Terminate the global OCR worker
 */
export async function terminateGlobalWorker(): Promise<void> {
  if (globalWorker) {
    await globalWorker.terminate()
    globalWorker = null
  }
}
