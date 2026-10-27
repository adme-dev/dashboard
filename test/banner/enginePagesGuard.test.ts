import { readFileSync } from 'node:fs'
import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createApp, createRouter, eventHandler, toNodeListener, type H3Event } from 'h3'
import { fetchNodeRequestHandler } from 'node-mock-http'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { bannerEnginePagesGuardPlugin } from '../../scripts/banner-engine-pages-guard.mjs'
import { guardBannerEnginePagesRequest } from '../../server/runtime/banner-engine-pages-guard'

const require = createRequire(import.meta.url)
const presetPath = require.resolve('nitropack/package.json').replace(/package\.json$/, 'dist/presets/cloudflare/runtime/cloudflare-pages.mjs')
const preset = readFileSync(presetPath, 'utf8')
const service = '/api/internal/banner-engine'
const user = '/api/agency/banner-studio/engine-jobs'
const token = 'a'.repeat(32)
const enabled = { BANNER_ENGINE_ENABLED: 'true', BANNER_ENGINE_SERVICE_TOKEN: token }
type BridgeOptions = NonNullable<Parameters<typeof fetchNodeRequestHandler>[2]>
type PlatformContext = {
  _platform: { cf: unknown, cloudflare: { request: Request, env: object, context: object } }
}

async function runtime(handler: (event: H3Event) => unknown = () => 'ok', guarded = true) {
  const plugin = bannerEnginePagesGuardPlugin()
  const source = guarded ? plugin.transform(preset, presetPath)!.code : preset
  const app = createApp({ onRequest(event) {
    // Nitro's real onRequest flattens this node-mock-http transport context.
    const fetchContext = (event.node.req as unknown as { __unenv__: PlatformContext }).__unenv__
    if (fetchContext?._platform) event.context = { _platform: fetchContext._platform, ...fetchContext._platform, ...event.context }
  } })
  app.use(eventHandler(handler))
  const calls: { path: string, options: BridgeOptions }[] = []
  const nitroApp = { localFetch(path: string, options: BridgeOptions) {
    calls.push({ path, options })
    return fetchNodeRequestHandler(toNodeListener(app), path, options)
  } }
  const code = source.replace(/^import .*;\n/gm, '').replaceAll('import.meta._websocket', 'false')
    .replaceAll('import.meta._tasks', 'false').replace('export default', 'return')
  const entry = new Function('useNitroApp', 'requestHasBody', 'isPublicAssetURL', 'guardBannerEnginePagesRequest', code)(
    () => nitroApp, (r: Request) => r.body !== null, () => false, guardBannerEnginePagesRequest
  )
  return { entry, calls }
}

function streamed(path: string, chunks: Uint8Array[] = [], headers: Record<string, string> = {}) {
  let reads = 0
  let cancels = 0
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      reads++
      const chunk = chunks.shift()
      if (chunk) controller.enqueue(chunk)
      else controller.close()
    },
    cancel() { cancels++ }
  }, { highWaterMark: 0 })
  const request = new Request(`https://engine.example${path}`, {
    method: 'POST', body: stream, headers, duplex: 'half'
  } as RequestInit)
  return { request, reads: () => reads, cancels: () => cancels }
}

afterEach(() => vi.useRealTimers())

describe('installed Pages entry guard', () => {
  it('rejects disabled engine routes before the preset reads the body', async () => {
    const { entry, calls } = await runtime()
    const input = streamed(user, [new Uint8Array([1, 2])])
    const response = await entry.fetch(input.request, {}, {})
    expect(response.status).toBe(503)
    expect(input.reads()).toBe(0)
    expect(input.request.bodyUsed).toBe(false)
    expect(calls).toHaveLength(0)
  })

  it.each([service, `${user}/id/cancel`, `${user}/id/output`])('defaults off for %s', async (path) => {
    const { entry } = await runtime()
    const input = streamed(path)
    expect((await entry.fetch(input.request, { BANNER_ENGINE_ENABLED: true }, {})).status).toBe(503)
    expect(input.reads()).toBe(0)
  })

  it.each([
    ['http://engine.example', `Bearer ${token}`, 403],
    ['https://engine.example', 'Bearer wrong', 401],
    ['https://engine.example', '', 401]
  ])('authenticates internal requests before body reads (%s)', async (origin, authorization, status) => {
    const { entry, calls } = await runtime()
    const input = streamed(service)
    const request = new Request(`${origin}${service}`, {
      method: 'POST', body: input.request.body,
      headers: { 'authorization': String(authorization), 'x-forwarded-proto': 'https' }, duplex: 'half'
    } as RequestInit)
    expect((await entry.fetch(request, enabled, {})).status).toBe(status)
    expect(input.reads()).toBe(0)
    expect(calls).toHaveLength(0)
  })

  it.each([
    [`${user}/`, { 'content-encoding': 'gzip' }, 415],
    [user, { 'content-length': '25165825' }, 413],
    [`${user}/job/cancel`, { 'content-length': '65537' }, 413]
  ])('rejects encoding/declared oversize without reading %s', async (path, headers, status) => {
    const { entry } = await runtime()
    const input = streamed(path, [], headers)
    expect((await entry.fetch(input.request, enabled, {})).status).toBe(status)
    expect(input.reads()).toBe(0)
  })

  it.each([user, `${user}/job/cancel`])('bounds actual undeclared chunks at %s', async (path) => {
    const { entry, calls } = await runtime()
    const limit = path.endsWith('cancel') ? 65536 : 24 * 1024 * 1024
    const input = streamed(path, [new Uint8Array(limit), new Uint8Array([1]), new Uint8Array([2])])
    expect((await entry.fetch(input.request, enabled, {})).status).toBe(413)
    expect(input.reads()).toBe(2)
    expect(input.cancels()).toBe(1)
    expect(calls).toHaveLength(0)
  })

  it('bounds endless empty chunks without waiting for timer scheduling', async () => {
    const { entry, calls } = await runtime()
    let reads = 0
    let cancelled = false
    const body = new ReadableStream({
      pull(controller) {
        reads++
        controller.enqueue(new Uint8Array())
      },
      cancel() { cancelled = true }
    }, { highWaterMark: 0 })
    const request = new Request(`https://engine.example${user}`, { method: 'POST', body, duplex: 'half' } as RequestInit)
    expect((await entry.fetch(request, enabled, {})).status).toBe(413)
    expect(reads).toBeLessThanOrEqual(65537)
    expect(cancelled).toBe(true)
    expect(calls).toHaveLength(0)
  })

  it('times out a stalled read even when cancellation never settles', async () => {
    vi.useFakeTimers()
    const { entry, calls } = await runtime()
    let cancelled = false
    const body = new ReadableStream({
      pull() { return new Promise(() => {}) },
      cancel() {
        cancelled = true
        return new Promise(() => {})
      }
    }, { highWaterMark: 0 })
    const request = new Request(`https://engine.example${user}`, { method: 'POST', body, duplex: 'half' } as RequestInit)
    const pending = entry.fetch(request, enabled, {})
    await vi.advanceTimersByTimeAsync(30001)
    expect((await pending).status).toBe(408)
    expect(cancelled).toBe(true)
    expect(calls).toHaveLength(0)
  })

  it('delivers bounded valid bytes and preserves the trusted platform context', async () => {
    const payload = '{"action":"claim"}'
    let observed: H3Event
    const { entry } = await runtime((event) => {
      observed = event
      return 'accepted'
    })
    const input = streamed(service, [new TextEncoder().encode(payload)], { 'authorization': `Bearer ${token}`, 'content-type': 'application/json' })
    const nativeRead = vi.spyOn(input.request, 'arrayBuffer')
    const cf = { colo: 'MEL' }
    Object.defineProperty(input.request, 'cf', { value: cf })
    const context = { waitUntil() {} }
    const response = await entry.fetch(input.request, enabled, context)
    expect(response.status).toBe(200)
    expect((observed!.node.req as unknown as { body: Buffer }).body.toString()).toBe(payload)
    expect(observed!.context._platform.cloudflare.request).toBe(input.request)
    expect(observed!.context._platform.cloudflare.env).toBe(enabled)
    expect(observed!.context._platform.cloudflare.context).toBe(context)
    expect(observed!.context._platform.cf).toBe(cf)
    expect(nativeRead).not.toHaveBeenCalled()
  })

  it.each([
    '/api/agency/banner-studio/%65ngine-jobs',
    '/api/agency/banner-studio/ENGINE-JOBS',
    '/api//agency/banner-studio/engine-jobs',
    '/api/agency/banner-studio%2fengine-jobs',
    '/api/internal/%62anner-engine',
    '/api/internal/banner-engine/',
    '/api/internal/banner-engine%3Faction=claim',
    '/api/agency/banner-studio/engine-jobs%3Fignored=1'
  ])('does not let ambiguous engine paths bypass default off: %s', async (path) => {
    const { entry, calls } = await runtime()
    const input = streamed(path, [new Uint8Array([1])])
    expect((await entry.fetch(input.request, {}, {})).status).toBe(503)
    expect(input.reads()).toBe(0)
    expect(calls).toHaveLength(0)
  })

  it.each([`${user}%3Fignored=1`, '/api/agency/banner-studio/%65ngine-jobs'])('blocks an encoded alias that the actual H3 router accepts: %s', async (path) => {
    const router = createRouter()
    router.post(user, eventHandler(() => 'route reached'))
    const baseline = await runtime(router.handler, false)
    expect((await baseline.entry.fetch(streamed(path).request, {}, {})).status).toBe(200)
    const guarded = await runtime(router.handler)
    const input = streamed(path)
    expect((await guarded.entry.fetch(input.request, {}, {})).status).toBe(503)
    expect(input.reads()).toBe(0)
  })

  it('passes unrelated requests and their bytes to the original preset unchanged', async () => {
    const { entry, calls } = await runtime()
    const bytes = new Uint8Array([0, 255, 128, 1, 10])
    const input = streamed('/api/leads/webhook/generic/example', [bytes], { 'content-encoding': 'gzip' })
    const read = vi.spyOn(input.request, 'arrayBuffer')
    expect((await entry.fetch(input.request, {}, {})).status).toBe(200)
    expect(read).toHaveBeenCalledTimes(1)
    expect(calls[0].options.context._platform.cloudflare.request).toBe(input.request)
    expect(new Uint8Array(calls[0].options.body)).toEqual(bytes)
  })

  it('sanitizes failed stream errors', async () => {
    const { entry } = await runtime()
    const body = new ReadableStream({
      pull(controller) { controller.error(new Error(`private ${token}`)) }
    }, { highWaterMark: 0 })
    const request = new Request(`https://engine.example${user}`, { method: 'POST', body, duplex: 'half' } as RequestInit)
    const response = await entry.fetch(request, enabled, {})
    expect(response.status).toBe(400)
    expect(await response.text()).not.toContain(token)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
  })
})

describe('Pages build placement checks', () => {
  it('prerenders and builds a minimal installed Nitro Pages fixture using the dashboard plugin order', async () => {
    const { createNitro, build, prepare, prerender } = await import('nitropack')
    const { compactPublicAssetsPlugin } = await import('../../scripts/compact-worker-static-data.mjs')
    const { workerProcessCompatibilityPlugin } = await import('../../scripts/worker-process-compatibility.mjs')
    const fixture = await mkdtemp(join(tmpdir(), 'engine-pages-guard-test-'))
    let nitro: Awaited<ReturnType<typeof createNitro>> | undefined
    try {
      await mkdir(join(fixture, 'routes'))
      await writeFile(join(fixture, 'routes', 'index.ts'), 'export default defineEventHandler(() => ({ ok: true }))\n')
      nitro = await createNitro({
        rootDir: fixture, preset: 'cloudflare_pages', compatibilityDate: '2024-12-01',
        prerender: { routes: ['/'] },
        nodeModulesDirs: [join(process.cwd(), 'node_modules')],
        cloudflare: { deployConfig: true, nodeCompat: true },
        sourceMap: false,
        esbuild: { options: { target: 'es2020' } },
        rollupConfig: { plugins: [compactPublicAssetsPlugin(), workerProcessCompatibilityPlugin(), bannerEnginePagesGuardPlugin()] }
      })
      await prepare(nitro)
      await prerender(nitro)
      await build(nitro)
      // Successful emission requires our generateBundle placement gate to pass.
      // Runtime behavior is covered above using the actual transformed fetch;
      // a Cloudflare bundle cannot execute in Node's unmodified ESM loader.
      expect((await stat(join(fixture, 'dist/_worker.js/index.js'))).size).toBeGreaterThan(0)
    } finally {
      await nitro?.close()
      await rm(fixture, { recursive: true, force: true })
    }
  }, 30000)

  it('transforms the actual installed preset and requires it before emitting', () => {
    const plugin = bannerEnginePagesGuardPlugin()
    plugin.options({ input: presetPath })
    plugin.buildStart()
    expect(() => plugin.generateBundle()).toThrow(/guard placement/)
    plugin.transform(preset, presetPath)
    expect(() => plugin.generateBundle()).not.toThrow()
  })

  it('fails closed if the installed runtime changes or its path is no longer found', () => {
    const plugin = bannerEnginePagesGuardPlugin()
    plugin.options({ input: presetPath })
    plugin.buildStart()
    expect(() => plugin.transform(preset.replace('await request.arrayBuffer()', 'await request.text()'), presetPath)).toThrow(/entry changed/)
    expect(plugin.transform(preset, '/changed/entry.mjs')).toBeNull()
    expect(() => plugin.generateBundle()).toThrow(/guard placement/)
  })

  it.each(['nitro-dev', 'nitro-prerenderer', 'nitro-dev.mjs', 'nitro-prerenderer.mjs'])('permits the explicit local %s entry', (name) => {
    const plugin = bannerEnginePagesGuardPlugin()
    plugin.options({ input: presetPath.replace('/cloudflare/runtime/cloudflare-pages.mjs', `/_nitro/runtime/${name}`) })
    plugin.buildStart()
    expect(() => plugin.generateBundle()).not.toThrow()
  })
})
