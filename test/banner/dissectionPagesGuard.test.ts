import { readFileSync } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createApp, createRouter, eventHandler, readMultipartFormData, toNodeListener, type H3Event } from 'h3'
import { fetchNodeRequestHandler } from 'node-mock-http'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Miniflare } from 'miniflare'
import { bannerEnginePagesGuardPlugin } from '../../scripts/banner-engine-pages-guard.mjs'
import { guardBannerEnginePagesRequest } from '../../server/runtime/banner-engine-pages-guard'

const require = createRequire(import.meta.url)
const presetPath = require.resolve('nitropack/package.json').replace(/package\.json$/, 'dist/presets/cloudflare/runtime/cloudflare-pages.mjs')
const preset = readFileSync(presetPath, 'utf8')
const upload = '/api/agency/banner-studio/dissect/upload'
const limit = 10551296

// Execute the installed entry and H3 bridge; never invent socket/context proof.
async function runtime(handler: (event: H3Event) => unknown = () => 'ok', guarded = true) {
  const source = guarded ? bannerEnginePagesGuardPlugin().transform(preset, presetPath)!.code : preset
  const app = createApp({ onRequest(event) {
    const platform = (event.node.req as any).__unenv__?._platform
    if (platform) event.context = { _platform: platform, ...platform, ...event.context }
  } })
  app.use(eventHandler(handler))
  let calls = 0
  const nitroApp = { localFetch(path: string, options: any) {
    calls++
    return fetchNodeRequestHandler(toNodeListener(app), path, options)
  } }
  // Before implementation this slot is deliberately unused by the old transform.
  let guard: unknown
  if (source.includes('guardBannerDissectionPagesRequest')) {
    guard = (await import('../../server/runtime/banner-dissection-pages-guard')).guardBannerDissectionPagesRequest
  }
  const code = source.replace(/^import .*;\n/gm, '').replaceAll('import.meta._websocket', 'false')
    .replaceAll('import.meta._tasks', 'false').replace('export default', 'return')
  const entry = new Function('useNitroApp', 'requestHasBody', 'isPublicAssetURL', 'guardBannerEnginePagesRequest', 'guardBannerDissectionPagesRequest', code)(
    () => nitroApp, (r: Request) => r.body !== null, () => false, guardBannerEnginePagesRequest, guard
  )
  return { entry, calls: () => calls }
}

function streamed(path = upload, chunks: Uint8Array[] = [], headers: Record<string, string> = {}) {
  let reads = 0
  let cancels = 0
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      reads++
      const chunk = chunks.shift()
      if (chunk) controller.enqueue(chunk)
      else controller.close()
    },
    cancel() { cancels++ }
  }, { highWaterMark: 0 })
  const request = new Request(`https://upload.example${path}`, { method: 'POST', body, headers, duplex: 'half' } as RequestInit)
  return { request, reads: () => reads, cancels: () => cancels }
}

afterEach(() => vi.useRealTimers())

describe('Dissector installed Pages ingress', () => {
  it.each([
    [{ 'content-length': '10551297' }, 413],
    [{ 'content-length': '1, 1' }, 413],
    [{ 'content-encoding': 'gzip' }, 415],
    [{ 'content-encoding': 'br' }, 415]
  ])('rejects headers before native preset buffering: %j', async (headers, status) => {
    const { entry, calls } = await runtime()
    const input = streamed(upload, [new Uint8Array([1])], headers)
    expect((await entry.fetch(input.request, {}, {})).status).toBe(status)
    expect(input.reads()).toBe(0)
    expect(calls()).toBe(0)
  })

  it.each([{}, { 'content-length': '1' }])('bounds actual bytes with missing or false length %j', async (headers) => {
    const { entry, calls } = await runtime()
    const input = streamed(upload, [new Uint8Array(limit), new Uint8Array([1]), new Uint8Array([2])], headers)
    expect((await entry.fetch(input.request, {}, {})).status).toBe(413)
    expect(input.reads()).toBe(2)
    expect(input.cancels()).toBe(1)
    expect(calls()).toBe(0)
  })

  it.each([
    `${upload}/`, `${upload}//`, `${upload}%3Fignored=1`,
    '/api/agency/banner-studio/dissect/%75pload',
    '/api/agency/banner-studio/dissect/UPLOAD',
    '/api//agency/banner-studio/dissect/upload',
    '/api/agency/banner-studio/dissect%2fupload',
    '/api/agency/banner-studio/dissect%5cupload'
  ])('rejects ambiguous upload spelling without reading: %s', async (path) => {
    const { entry, calls } = await runtime()
    const input = streamed(path, [new Uint8Array([1])])
    expect((await entry.fetch(input.request, {}, {})).status).toBe(400)
    expect(input.reads()).toBe(0)
    expect(calls()).toBe(0)
  })

  it('blocks an encoded alias accepted by the installed H3 router', async () => {
    const router = createRouter()
    router.post(upload, eventHandler(() => 'reached'))
    const baseline = await runtime(router.handler, false)
    const guarded = await runtime(router.handler)
    const path = `${upload}%3Fignored=1`
    expect(await (await baseline.entry.fetch(streamed(path).request, {}, {})).text()).toBe('reached')
    expect((await guarded.entry.fetch(streamed(path).request, {}, {})).status).toBe(400)
  })

  it('accepts the exact byte ceiling and preserves original platform identity', async () => {
    let observed: H3Event | undefined
    const { entry } = await runtime(event => { observed = event; return 'ok' })
    const input = streamed(`${upload}?brand=test`, [new Uint8Array(limit)], { 'content-length': String(limit) })
    const nativeRead = vi.spyOn(input.request, 'arrayBuffer')
    const env = { arbitrary: 'binding' }
    const context = { waitUntil() {} }
    expect((await entry.fetch(input.request, env, context)).status).toBe(200)
    expect((observed!.node.req as any).body.byteLength).toBe(limit)
    expect(observed!.context.cloudflare.request).toBe(input.request)
    expect(observed!.context.cloudflare.env).toBe(env)
    expect(observed!.context.cloudflare.context).toBe(context)
    expect(nativeRead).not.toHaveBeenCalled()
  })

  it('caps tiny/empty chunks even when timers cannot run', async () => {
    const { entry, calls } = await runtime()
    let reads = 0
    let cancelled = false
    const body = new ReadableStream({
      pull(controller) { reads++; controller.enqueue(new Uint8Array()) },
      cancel() { cancelled = true }
    }, { highWaterMark: 0 })
    const request = new Request(`https://upload.example${upload}`, { method: 'POST', body, duplex: 'half' } as RequestInit)
    expect((await entry.fetch(request, {}, {})).status).toBe(413)
    expect(reads).toBe(65537)
    expect(cancelled).toBe(true)
    expect(calls()).toBe(0)
  })

  it('times out a stalled producer without awaiting cancellation', async () => {
    vi.useFakeTimers()
    const { entry, calls } = await runtime()
    let cancelled = false
    const body = new ReadableStream({
      pull() { return new Promise(() => {}) },
      cancel() { cancelled = true; return new Promise(() => {}) }
    }, { highWaterMark: 0 })
    const request = new Request(`https://upload.example${upload}`, { method: 'POST', body, duplex: 'half' } as RequestInit)
    const pending = entry.fetch(request, {}, {})
    await vi.advanceTimersByTimeAsync(30001)
    expect((await pending).status).toBe(408)
    expect(cancelled).toBe(true)
    expect(calls()).toBe(0)
  })

  it('passes other paths unchanged and keeps engine default-off independent', async () => {
    const { entry, calls } = await runtime()
    const other = streamed('/api/agency/banner-studio/dissect/process', [new Uint8Array([3])], { 'content-encoding': 'gzip' })
    const read = vi.spyOn(other.request, 'arrayBuffer')
    expect((await entry.fetch(other.request, {}, {})).status).toBe(200)
    expect(read).toHaveBeenCalledTimes(1)
    const engine = streamed('/api/agency/banner-studio/engine-jobs', [new Uint8Array([1])])
    expect((await entry.fetch(engine.request, {}, {})).status).toBe(503)
    expect(engine.reads()).toBe(0)
    expect(calls()).toBe(1)
  })
})

const multipart = '--proof\r\nContent-Disposition: form-data; name="file"; filename="x.png"\r\nContent-Type: image/png\r\n\r\noriginal-bytes\r\n--proof--\r\n'
async function parseBounded(event: H3Event) {
  const { ensureBoundedDissectionUploadBody } = await import('../../server/runtime/banner-dissection-pages-guard')
  await Promise.all([ensureBoundedDissectionUploadBody(event), ensureBoundedDissectionUploadBody(event)])
  const first = await readMultipartFormData(event)
  const second = await readMultipartFormData(event)
  return { first: first?.[0]?.data.toString(), second: second?.[0]?.data.toString() }
}

describe('local Nitro bounded body integration', () => {
  it('feeds the real H3 multipart parser once with repeated/concurrent helper calls', async () => {
    const app = createApp().use(eventHandler(parseBounded))
    const server = createServer(toNodeListener(app))
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    try {
      const port = (server.address() as { port: number }).port
      const response = await fetch(`http://127.0.0.1:${port}${upload}`, {
        method: 'POST', body: multipart, headers: { 'content-type': 'multipart/form-data; boundary=proof' }
      })
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ first: 'original-bytes', second: 'original-bytes' })
    } finally {
      server.closeAllConnections()
      await new Promise<void>(resolve => server.close(() => resolve()))
    }
  })

  it('reuses the installed Pages buffer without consuming the native Request twice', async () => {
    const { entry } = await runtime(parseBounded)
    const input = streamed(upload, [new TextEncoder().encode(multipart)], { 'content-type': 'multipart/form-data; boundary=proof' })
    const response = await entry.fetch(input.request, {}, {})
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ first: 'original-bytes', second: 'original-bytes' })
    expect(input.reads()).toBe(2)
  })
})

describe('emitted installed Pages entry in workerd', () => {
  it('preserves native identity through the installed adapter and bounds real ingress', async () => {
    const { createNitro, build, prepare, prerender } = await import('nitropack')
    const { compactPublicAssetsPlugin } = await import('../../scripts/compact-worker-static-data.mjs')
    const { workerProcessCompatibilityPlugin } = await import('../../scripts/worker-process-compatibility.mjs')
    const fixture = await mkdtemp(join(tmpdir(), 'dissection-pages-guard-test-'))
    let nitro: Awaited<ReturnType<typeof createNitro>> | undefined
    let worker: Miniflare | undefined
    try {
      await mkdir(join(fixture, 'routes', 'api', 'agency', 'banner-studio', 'dissect'), { recursive: true })
      await writeFile(join(fixture, 'routes', 'index.ts'), 'export default defineEventHandler(() => ({ ok: true }))\n')
      const helper = join(process.cwd(), 'server/runtime/banner-dissection-pages-guard.ts')
      await writeFile(join(fixture, 'routes', 'api', 'agency', 'banner-studio', 'dissect', 'upload.post.ts'), `
        import { ensureBoundedDissectionUploadBody } from ${JSON.stringify(helper)};
        export default defineEventHandler(async event => {
          await ensureBoundedDissectionUploadBody(event);
          const first = await readMultipartFormData(event);
          const second = await readMultipartFormData(event);
          const native = globalThis.__ingressProof;
          return {
            first: first?.[0]?.data.toString(), second: second?.[0]?.data.toString(),
            request: event.context.cloudflare.request === native.request,
            context: event.context.cloudflare.context === native.context,
            env: event.context.cloudflare.env === native.env,
            cf: event.context.cf === native.request.cf,
            binding: event.context.cloudflare.env.PROOF_BINDING,
            nativeUsed: native.request.bodyUsed
          };
        });
      `)
      nitro = await createNitro({
        rootDir: fixture, preset: 'cloudflare_pages', compatibilityDate: '2024-12-01',
        prerender: { routes: ['/'] },
        nodeModulesDirs: [join(process.cwd(), 'node_modules')],
        cloudflare: { deployConfig: true, nodeCompat: true },
        sourceMap: false, esbuild: { options: { target: 'es2020' } },
        rollupConfig: { plugins: [compactPublicAssetsPlugin(), workerProcessCompatibilityPlugin(), bannerEnginePagesGuardPlugin()] }
      })
      await prepare(nitro)
      await prerender(nitro)
      await build(nitro)
      const root = join(fixture, 'dist', '_worker.js')
      // Observe workerd's actual Request/env/context; do not synthesize proof on
      // an H3 event or attach trusted socket/transport markers to caller input.
      await writeFile(join(root, 'proof.js'), `
        import entry from './index.js';
        export default { fetch(request, env, context) {
          globalThis.__ingressProof = { request, env, context };
          return entry.fetch(request, env, context);
        } };
      `)
      worker = new Miniflare({
        modules: true, scriptPath: join(root, 'proof.js'), modulesRoot: root,
        modulesRules: [{ type: 'ESModule', include: ['**/*.js', '**/*.mjs'] }],
        compatibilityDate: '2024-12-01',
        compatibilityFlags: ['nodejs_compat', 'no_handle_cross_request_promise_resolution'],
        bindings: { PROOF_BINDING: 'native-binding' }
      })
      const accepted = await worker.dispatchFetch(`https://upload.example${upload}`, {
        method: 'POST', body: multipart, headers: { 'content-type': 'multipart/form-data; boundary=proof' }
      })
      expect(accepted.status).toBe(200)
      expect(await accepted.json()).toEqual({
        first: 'original-bytes', second: 'original-bytes', request: true, context: true,
        env: true, cf: true, binding: 'native-binding', nativeUsed: true
      })
      const oversized = new ReadableStream<Uint8Array>({ start(controller) {
        controller.enqueue(new Uint8Array(limit)); controller.enqueue(new Uint8Array([1])); controller.close()
      } })
      const rejected = await worker.dispatchFetch(`https://upload.example${upload}`, {
        method: 'POST', body: oversized as any, duplex: 'half'
      })
      expect(rejected.status).toBe(413)
      for (const [path, headers, expected] of [
        [upload, { 'content-encoding': 'gzip' }, 415],
        [`${upload}%3Fignored=1`, {}, 400],
        ['/api/agency/banner-studio/engine-jobs', {}, 503]
      ] as const) {
        expect((await worker.dispatchFetch(`https://upload.example${path}`, { method: 'POST', body: 'x', headers })).status).toBe(expected)
      }
    } finally {
      await worker?.dispose()
      await nitro?.close()
      await rm(fixture, { recursive: true, force: true })
    }
  }, 60000)
})

describe('local rejection before multipart parsing', () => {
  it.each(['oversized', 'compressed', 'alias'])('rejects %s via a real Node HTTP server', async (kind) => {
    const { ensureBoundedDissectionUploadBody } = await import('../../server/runtime/banner-dissection-pages-guard')
    let parsed = false
    const app = createApp().use(eventHandler(async event => {
      await ensureBoundedDissectionUploadBody(event)
      parsed = true
      return readMultipartFormData(event)
    }))
    const server = createServer(toNodeListener(app))
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    try {
      const port = (server.address() as { port: number }).port
      const oversized = new ReadableStream({ start(controller) {
        controller.enqueue(new Uint8Array(limit)); controller.enqueue(new Uint8Array([1])); controller.close()
      } })
      const response = await fetch(`http://127.0.0.1:${port}${kind === 'alias' ? `${upload}%3Fignored=1` : upload}`, {
        method: 'POST', body: kind === 'oversized' ? oversized : multipart,
        headers: { 'content-type': 'multipart/form-data; boundary=proof', ...(kind === 'compressed' ? { 'content-encoding': 'gzip' } : {}) },
        duplex: 'half'
      } as RequestInit)
      expect(response.status).toBe(kind === 'oversized' ? 413 : kind === 'compressed' ? 415 : 400)
      expect(parsed).toBe(false)
      await response.arrayBuffer()
    } finally {
      server.closeAllConnections()
      await new Promise<void>(resolve => server.close(() => resolve()))
    }
  })

  it('sanitizes a failed Pages stream and marks the rejection private', async () => {
    const { entry } = await runtime()
    const body = new ReadableStream({ pull(controller) { controller.error(new Error('private-source-key')) } }, { highWaterMark: 0 })
    const request = new Request(`https://upload.example${upload}`, { method: 'POST', body, duplex: 'half' } as RequestInit)
    const response = await entry.fetch(request, {}, {})
    expect(response.status).toBe(400)
    expect(await response.text()).not.toContain('private-source-key')
    expect(response.headers.get('cache-control')).toBe('private, no-store')
  })

  it('accepts exactly 65536 chunks including empty chunks', async () => {
    const { entry } = await runtime()
    let chunks = 0
    const body = new ReadableStream({ pull(controller) {
      if (chunks++ < 65536) controller.enqueue(new Uint8Array())
      else controller.close()
    } }, { highWaterMark: 0 })
    const request = new Request(`https://upload.example${upload}`, { method: 'POST', body, duplex: 'half' } as RequestInit)
    expect((await entry.fetch(request, {}, {})).status).toBe(200)
  })
})
