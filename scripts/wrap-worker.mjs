#!/usr/bin/env node
/**
 * Postbuild step: wrap dist/_worker.js/index.js so WebSocket upgrade requests
 * for boards/chat/banner-studio are handled by worker-ws/ ahead of Nitro.
 *
 * See worker-ws/index.ts for why this is necessary (Nitro's CF Pages preset
 * cannot proxy WebSocket upgrades to Durable Objects).
 *
 * Idempotent: safe to re-run; detects already-wrapped output.
 */

import { build } from 'esbuild'
import { gzipSync } from 'node:zlib'
import { fileURLToPath, pathToFileURL } from 'node:url'
import fs from 'node:fs/promises'
import path from 'node:path'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const distDir = path.join(projectRoot, 'dist', '_worker.js')
const indexJs = path.join(distDir, 'index.js')
const indexJsMap = path.join(distDir, 'index.js.map')
const nitroJs = path.join(distDir, '_nitro.js')
const nitroJsMap = path.join(distDir, '_nitro.js.map')
const wsJs = path.join(distDir, '_ws.js')
const wsSrc = path.join(projectRoot, 'worker-ws', 'index.ts')
const precomputedManifest = path.join(distDir, 'chunks', 'build', 'client.precomputed.mjs')

async function exists(p) {
  try { await fs.access(p); return true } catch { return false }
}

const distExists = await exists(indexJs)
if (!distExists) {
  console.error(`[wrap-worker] ${indexJs} not found — did the Nitro build succeed?`)
  process.exit(1)
}

// Detect already-wrapped output (idempotent re-runs).
const indexContents = await fs.readFile(indexJs, 'utf8')
const isAlreadyWrapped = indexContents.includes('./_ws.js') && indexContents.includes('./_nitro.js')

if (!isAlreadyWrapped) {
  if (await exists(nitroJs)) {
    // Stale _nitro.js from a previous build — overwrite it with the fresh entry.
    await fs.unlink(nitroJs)
    if (await exists(nitroJsMap)) await fs.unlink(nitroJsMap)
  }
  await fs.rename(indexJs, nitroJs)
  if (await exists(indexJsMap)) {
    await fs.rename(indexJsMap, nitroJsMap)
    // Fix the now-stale `//# sourceMappingURL=index.js.map` reference inside
    // _nitro.js so debugger source-map lookups resolve.
    const nitroSrc = await fs.readFile(nitroJs, 'utf8')
    await fs.writeFile(
      nitroJs,
      nitroSrc.replace(/sourceMappingURL=index\.js\.map\b/g, 'sourceMappingURL=_nitro.js.map'),
      'utf8',
    )
  }
  console.log('[wrap-worker] moved Nitro entry → _nitro.js')
} else {
  // index.js is already a wrapper — it imports from _nitro.js, so don't touch
  // _nitro.js (it's the Nitro entry from a prior build). But the user may have
  // forced a fresh build that overwrote index.js with a new Nitro entry — in
  // that case the `isAlreadyWrapped` check would've been false. So we're safe.
  console.log('[wrap-worker] entry already wrapped — refreshing _ws.js only')
}

// Bundle the WS handler from source.
await build({
  entryPoints: [wsSrc],
  outfile: wsJs,
  bundle: true,
  minify: true,
  format: 'esm',
  target: 'esnext',
  platform: 'neutral',
  conditions: ['workerd', 'worker', 'browser'],
  mainFields: ['module', 'main'],
  legalComments: 'none',
  logLevel: 'warning',
})
console.log('[wrap-worker] bundled worker-ws → _ws.js')

// Nuxt's production SSR renderer precomputes the complete client dependency
// graph into a JavaScript module. In this application that module is highly
// repetitive and pushes the Pages Function over Cloudflare's 25 MB raw-size
// limit. Keep the same async module contract while storing the graph as gzip;
// it is inflated once and cached when an isolate first renders SSR.
if (await exists(precomputedManifest)) {
  const source = await fs.readFile(precomputedManifest, 'utf8')
  if (!source.includes('XEROFLOW_COMPACT_PRECOMPUTED')) {
    const manifestModule = await import(
      `${pathToFileURL(precomputedManifest).href}?compact=${Date.now()}`
    )
    const manifest = typeof manifestModule.default === 'function'
      ? await manifestModule.default()
      : manifestModule.default
    const compressed = gzipSync(Buffer.from(JSON.stringify(manifest)), { level: 9 })
    const compactSource = `const XEROFLOW_COMPACT_PRECOMPUTED='${compressed.toString('base64')}'
let cache
export default async function loadPrecomputedManifest() {
  if (cache) return cache
  const bytes = Uint8Array.from(atob(XEROFLOW_COMPACT_PRECOMPUTED), char => char.charCodeAt(0))
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))
  cache = JSON.parse(await new Response(stream).text())
  return cache
}
`
    await fs.writeFile(precomputedManifest, compactSource, 'utf8')
    console.log(
      `[wrap-worker] compacted Nuxt client manifest ${source.length} → ${compactSource.length} bytes`,
    )
  }
}

// Write the dispatcher entry. Routes WebSocket upgrades on the three known
// paths to the WS handler; everything else delegates to Nitro unchanged.
const dispatcher = `import nitro from './_nitro.js'
import { handleBoardConnect, handleChatConnect, handleBannerConnect } from './_ws.js'

const BOARD_RE = /^\\/api\\/agency\\/boards\\/([^/]+)\\/connect$/
const CHAT_RE = /^\\/api\\/chat\\/([^/]+)\\/connect$/
const BANNER_RE = /^\\/api\\/agency\\/banner-studio\\/([^/]+)\\/connect$/

export default {
  async fetch(request, env, ctx) {
    if (request.headers.get('Upgrade') === 'websocket') {
      try {
        const { pathname } = new URL(request.url)
        const m1 = pathname.match(BOARD_RE)
        if (m1) return await handleBoardConnect(request, env, decodeURIComponent(m1[1]))
        const m2 = pathname.match(CHAT_RE)
        if (m2) return await handleChatConnect(request, env, decodeURIComponent(m2[1]))
        const m3 = pathname.match(BANNER_RE)
        if (m3) return await handleBannerConnect(request, env, decodeURIComponent(m3[1]))
      } catch (err) {
        console.error('[ws-wrap]', err && err.stack || err)
        return new Response('WebSocket handler error', { status: 500 })
      }
    }
    return nitro.fetch(request, env, ctx)
  },
  scheduled(event, env, ctx) {
    if (typeof nitro.scheduled === 'function') {
      return nitro.scheduled(event, env, ctx)
    }
  },
}
`

await fs.writeFile(indexJs, dispatcher, 'utf8')
console.log('[wrap-worker] wrote dispatcher → index.js')
console.log('[wrap-worker] done')
