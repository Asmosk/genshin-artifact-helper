import { fileURLToPath } from 'node:url'
import fs from 'node:fs/promises'
import path from 'node:path'
import type { Plugin } from 'vite'
import type { IncomingMessage, ServerResponse } from 'node:http'

const fixturesDir = fileURLToPath(new URL('./src/__tests__/fixtures/artifacts', import.meta.url))

/** Strip UTF-8 BOM if present — Windows tools often write it */
function stripBom(s: string): string {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: unknown) =>
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk))),
    )
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')))
    req.on('error', reject)
  })
}

function sendJson(res: ServerResponse, status: number, data: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(data))
}

export function fixturesPlugin(): Plugin {
  return {
    name: 'vite-plugin-fixtures',
    apply: 'serve',
    configureServer(server) {
      // GET /api/fixtures — list fixtures with starCoords metadata
      server.middlewares.use('/api/fixtures', async (req, res, next) => {
        if (req.method !== 'GET') return next()
        try {
          const files = await fs.readdir(fixturesDir)
          const pngNames = new Set(
            files.filter((f) => f.endsWith('.png')).map((f) => f.slice(0, -4)),
          )
          const jsonFiles = files.filter((f) => f.endsWith('.json') && f !== 'README.md')
          const jsonNames = new Set(jsonFiles.map((f) => f.slice(0, -5)))

          const withJson = await Promise.all(
            jsonFiles.map(async (f) => {
              const name = f.slice(0, -5)
              try {
                const raw = await fs.readFile(path.join(fixturesDir, f), 'utf-8')
                const data = JSON.parse(stripBom(raw))
                return { name, hasJson: true, hasStarCoords: !!data.expected?.starCoords, screen: data.expected?.screen as string | undefined }
              } catch {
                return { name, hasJson: true, hasStarCoords: false }
              }
            }),
          )

          const imageOnly = [...pngNames]
            .filter((name) => !jsonNames.has(name))
            .map((name) => ({ name, hasJson: false, hasStarCoords: false, screen: undefined }))

          const SCREEN_ORDER: Record<string, number> = { character: 0, inventory: 1, rewards: 2 }
          const sorted = withJson.sort((a, b) => {
            const sa = SCREEN_ORDER[a.screen ?? ''] ?? 3
            const sb = SCREEN_ORDER[b.screen ?? ''] ?? 3
            return sa !== sb ? sa - sb : a.name.localeCompare(b.name)
          })
          const sortedImageOnly = imageOnly.sort((a, b) => a.name.localeCompare(b.name))

          sendJson(res, 200, [...sorted, ...sortedImageOnly])
        } catch (err) {
          console.error('[fixtures] list error:', err)
          sendJson(res, 500, { error: String(err) })
        }
      })

      // POST /api/fixture-save — body: { name: string, starCoords: { x: number, y: number }, screen?: string }
      server.middlewares.use('/api/fixture-save', (req, res, next) => {
        if (req.method !== 'POST') return next()
        readBody(req)
          .then((bodyStr) => {
            const { name, starCoords, screen } = JSON.parse(bodyStr) as {
              name: string
              starCoords: { x: number; y: number }
              screen?: string
            }
            const filePath = path.join(fixturesDir, `${name}.json`)
            return fs
              .readFile(filePath, 'utf-8')
              .catch(() => null)
              .then((raw) => {
                const data: { expected: Record<string, unknown> } = raw
                  ? (JSON.parse(stripBom(raw)) as { expected: Record<string, unknown> })
                  : { expected: {} }
                data.expected['starCoords'] = starCoords
                if (screen !== undefined) data.expected['screen'] = screen
                return fs.writeFile(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8')
              })
              .then(() => sendJson(res, 200, { ok: true }))
          })
          .catch((err) => {
            console.error('[fixture-save] error:', err)
            sendJson(res, 500, { error: String(err) })
          })
      })

      // POST /api/fixture-save-screen — body: { name: string, screen: string }
      server.middlewares.use('/api/fixture-save-screen', (req, res, next) => {
        if (req.method !== 'POST') return next()
        readBody(req)
          .then((bodyStr) => {
            const { name, screen } = JSON.parse(bodyStr) as { name: string; screen: string }
            const filePath = path.join(fixturesDir, `${name}.json`)
            return fs
              .readFile(filePath, 'utf-8')
              .catch(() => null)
              .then((raw) => {
                const data: { expected: Record<string, unknown> } = raw
                  ? (JSON.parse(stripBom(raw)) as { expected: Record<string, unknown> })
                  : { expected: {} }
                data.expected['screen'] = screen
                return fs.writeFile(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8')
              })
              .then(() => sendJson(res, 200, { ok: true }))
          })
          .catch((err) => {
            console.error('[fixture-save-screen] error:', err)
            sendJson(res, 500, { error: String(err) })
          })
      })

      // POST /api/fixture-save-ocr — body: { name: string, ocrRegions: Record<string, {x,y,width,height}> }
      server.middlewares.use('/api/fixture-save-ocr', (req, res, next) => {
        if (req.method !== 'POST') return next()
        readBody(req)
          .then((bodyStr) => {
            const { name, ocrRegions } = JSON.parse(bodyStr) as {
              name: string
              ocrRegions: Record<string, { x: number; y: number; width: number; height: number }>
            }
            const filePath = path.join(fixturesDir, `${name}.json`)
            return fs
              .readFile(filePath, 'utf-8')
              .then((raw) => {
                const data = JSON.parse(stripBom(raw)) as { expected: Record<string, unknown> }
                data.expected['ocrRegions'] = ocrRegions
                return fs.writeFile(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8')
              })
              .then(() => sendJson(res, 200, { ok: true }))
          })
          .catch((err) => {
            console.error('[fixture-save-ocr] error:', err)
            sendJson(res, 500, { error: String(err) })
          })
      })

      // GET /fixtures/:file — serve PNG and JSON fixture files
      server.middlewares.use('/fixtures', async (req, res, next) => {
        if (req.method !== 'GET') return next()
        const filePath = path.join(fixturesDir, decodeURIComponent(req.url ?? ''))
        try {
          const data = await fs.readFile(filePath)
          const ext = path.extname(filePath).toLowerCase()
          res.setHeader('Content-Type', ext === '.png' ? 'image/png' : 'application/json')
          res.end(data)
        } catch {
          next()
        }
      })
    },
  }
}
