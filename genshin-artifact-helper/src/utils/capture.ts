/**
 * Screen capture utilities for browser-based screen capture
 */

export interface CaptureOptions {
  /** Preferred video constraints */
  video?: MediaTrackConstraints & {
    cursor?: 'never' | 'always' | 'motion'
  }
  /** Audio capture (disabled by default) */
  audio?: boolean
}

export interface CaptureRegion {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Request screen capture using getDisplayMedia API
 * User will be prompted to select screen/window
 */
export async function requestScreenCapture(
  options: CaptureOptions = {},
): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getDisplayMedia) {
    throw new Error('Screen capture is not supported in this browser')
  }

  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        cursor: 'never',
        frameRate: { ideal: 30, max: 60 },
        ...options.video,
      } as MediaTrackConstraints,
      audio: options.audio ?? false,
    })

    return stream
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === 'NotAllowedError') {
        throw new Error('Screen capture permission denied')
      }
      if (error.name === 'NotFoundError') {
        throw new Error('No screen source selected')
      }
      throw error
    }
    throw new Error('Unknown error requesting screen capture')
  }
}

/**
 * Stop a media stream and release resources
 */
export function stopCapture(stream: MediaStream): void {
  stream.getTracks().forEach((track) => track.stop())
}

/**
 * Capture a single frame from a video stream to canvas
 */
export function captureFrame(
  stream: MediaStream,
  canvas: HTMLCanvasElement,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    video.srcObject = stream
    video.muted = true
    video.playsInline = true

    video.onloadedmetadata = () => {
      video.play()

      // Wait for first frame
      video.onplaying = () => {
        // Set canvas dimensions to match video
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight

        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        if (!ctx) {
          reject(new Error('Failed to get canvas context'))
          return
        }

        // Draw video frame to canvas
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

        // Cleanup
        video.pause()
        video.srcObject = null

        resolve()
      }
    }

    video.onerror = () => {
      reject(new Error('Failed to load video stream'))
    }
  })
}

/**
 * Create a continuous capture loop
 */
export function createCaptureLoop(
  stream: MediaStream,
  onFrame: (canvas: HTMLCanvasElement) => void,
  fps: number = 2,
): { start: () => void; stop: () => void } {
  let isRunning = false
  let intervalId: number | null = null
  const video = document.createElement('video')
  const canvas = document.createElement('canvas')

  video.srcObject = stream
  video.muted = true
  video.playsInline = true
  video.play()

  const captureLoop = () => {
    if (!isRunning) return

    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return

    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      // Update canvas size if video dimensions changed
      if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
      }

      // Draw current frame
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

      // Call user callback
      onFrame(canvas)
    }
  }

  return {
    start: () => {
      if (isRunning) return
      isRunning = true
      intervalId = window.setInterval(captureLoop, 1000 / fps)
    },
    stop: () => {
      isRunning = false
      if (intervalId !== null) {
        window.clearInterval(intervalId)
        intervalId = null
      }
      video.pause()
      video.srcObject = null
    },
  }
}

/**
 * Crop a region from a canvas
 */
export function cropCanvas(
  sourceCanvas: HTMLCanvasElement,
  region: CaptureRegion,
): HTMLCanvasElement {
  const croppedCanvas = document.createElement('canvas')
  croppedCanvas.width = region.width
  croppedCanvas.height = region.height

  const ctx = croppedCanvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) {
    throw new Error('Failed to get canvas context')
  }

  ctx.drawImage(
    sourceCanvas,
    region.x,
    region.y,
    region.width,
    region.height,
    0,
    0,
    region.width,
    region.height,
  )

  return croppedCanvas
}

/**
 * Load an image file to canvas
 */
export function loadImageToCanvas(file: File): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('File is not an image'))
      return
    }

    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = img.width
        canvas.height = img.height

        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        if (!ctx) {
          reject(new Error('Failed to get canvas context'))
          return
        }

        ctx.drawImage(img, 0, 0)
        resolve(canvas)
      }
      img.onerror = () => {
        reject(new Error('Failed to load image'))
      }
      img.src = e.target?.result as string
    }
    reader.onerror = () => {
      reject(new Error('Failed to read file'))
    }
    reader.readAsDataURL(file)
  })
}

/**
 * Convert canvas to blob for download/upload
 */
export function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string = 'image/png',
  quality: number = 0.95,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob)
        } else {
          reject(new Error('Failed to convert canvas to blob'))
        }
      },
      type,
      quality,
    )
  })
}

/**
 * Download canvas as image file
 */
export async function downloadCanvas(
  canvas: HTMLCanvasElement,
  filename: string = 'capture.png',
): Promise<void> {
  const blob = await canvasToBlob(canvas)
  const url = URL.createObjectURL(blob)

  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()

  URL.revokeObjectURL(url)
}

/**
 * Get canvas as data URL
 */
export function canvasToDataURL(
  canvas: HTMLCanvasElement,
  type: string = 'image/png',
  quality: number = 0.95,
): string {
  return canvas.toDataURL(type, quality)
}
