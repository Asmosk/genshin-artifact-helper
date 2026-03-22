/**
 * Clamps an image resolution to a common aspect ratio label.
 * Matches within ±10% tolerance on the ratio value.
 */

const KNOWN_RATIOS: Array<{ label: string; ratio: number }> = [
  { label: '4:3', ratio: 4 / 3 },
  { label: '16:10', ratio: 16 / 10 },
  { label: '16:9', ratio: 16 / 9 },
  { label: '21:9', ratio: 21 / 9 },
]

const TOLERANCE = 0.1

export function clampAspectRatio(width: number, height: number): string {
  if (height === 0) return 'other'
  const ratio = width / height
  for (const known of KNOWN_RATIOS) {
    if (Math.abs(ratio - known.ratio) / known.ratio <= TOLERANCE) {
      return known.label
    }
  }
  return 'other'
}
