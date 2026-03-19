import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { execSync } from 'node:child_process'
import type { Plugin } from 'vite'

/**
 * Vite plugin that ensures the pre-computed roll sum tables are up to date.
 * Regenerates src/generated/valid-roll-sums.ts when:
 *   - The file is missing
 *   - The source-hash in the file doesn't match the current roll data in artifact.ts
 */
export function rollTablesPlugin(): Plugin {
  return {
    name: 'roll-tables',
    buildStart() {
      const root = resolve(import.meta.dirname!)
      const generatedPath = resolve(root, 'src/generated/valid-roll-sums.ts')
      const artifactPath = resolve(root, 'src/types/artifact.ts')

      const needsRegeneration = !existsSync(generatedPath) || isStale(generatedPath, artifactPath)

      if (needsRegeneration) {
        console.log('[roll-tables] Generating valid roll sum tables...')
        execSync('bun run scripts/generate-roll-tables.ts', { cwd: root, stdio: 'inherit' })
        console.log('[roll-tables] Done.')
      }
    },
  }
}

function isStale(generatedPath: string, artifactPath: string): boolean {
  try {
    const generated = readFileSync(generatedPath, 'utf-8')
    const hashMatch = generated.match(/^\/\/ source-hash: ([a-f0-9]+)$/m)
    if (!hashMatch?.[1]) return true

    const artifactSrc = readFileSync(artifactPath, 'utf-8')
    const currentHash = computeSourceHash(artifactSrc)
    return hashMatch[1] !== currentHash
  } catch {
    return true
  }
}

function computeSourceHash(artifactSrc: string): string {
  const hash = createHash('sha256')
  for (const varName of [
    'SUBSTAT_ROLLS',
    'SUBSTAT_ROLLS_4STAR',
    'SUBSTAT_ROLLS_3STAR',
    'SUBSTAT_ROLLS_2STAR',
    'SUBSTAT_ROLLS_1STAR',
  ]) {
    const re = new RegExp(
      `export\\s+const\\s+${varName}\\s*(?::[^=]*)=\\s*\\{[^}]+\\}`,
      's',
    )
    const match = artifactSrc.match(re)
    if (match?.[0]) hash.update(match[0])
  }
  return hash.digest('hex').slice(0, 16)
}
