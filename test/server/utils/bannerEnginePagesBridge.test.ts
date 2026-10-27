import { createRequire } from 'node:module'
import { Readable } from 'node:stream'
import { createApp, eventHandler, toNodeListener, type H3Event } from 'h3'
import { fetchNodeRequestHandler as reviewedBridge } from 'node-mock-http'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { assertEngineServiceAuth, engineJobConfig, engineJobHttp, readEngineJobJson } from '../../../server/utils/banner/engineJobHttp'

// Resolve Nitro's own installed dependency as well as the root version used by
// the reviewer. No mocked HTTP adapter or listening server is involved.
const require = createRequire(import.meta.url)
const nitroRequire = createRequire(require.resolve('nitropack/package.json'))
const { fetchNodeRequestHandler: installedBridge } = await import(nitroRequire.resolve('node-mock-http').replace(/\.cjs$/, '.mjs')) as {
  fetchNodeRequestHandler: typeof reviewedBridge
}
const token = 'a'.repeat(64)
const capability = { engine: { id: 'photocraft', version: '0.16.0' }, operation: 'render-preview', inputMimeType: 'application/x-photocraft', executableSha256: 'b'.repeat(64), capabilityProofSha256: 'c'.repeat(64) }
const bindings = () => ({ BANNER_ENGINE_ENABLED: 'true', BANNER_ENGINE_SERVICE_TOKEN: token, BANNER_ENGINE_CAPABILITIES: JSON.stringify([capability]), BANNER_ENGINE_BUCKET: { get() {}, put() {} } })

interface Options {
  url?: string
  body?: string | Uint8Array
  headers?: Record<string, string>
  env?: Record<string, unknown>
  auth?: boolean
  limit?: number
  contextShape?: 'standard' | 'platform-only' | 'flattened-only'
  mutate?: (event: H3Event) => void
}

afterEach(() => vi.unstubAllEnvs())

describe.each([
  ['reviewed root adapter', reviewedBridge],
  ['Nitro installed adapter', installedBridge]
] as const)('engine Pages bridge: %s', (_name, bridge) => {
  async function invoke(options: Options = {}) {
    const request = new Request(options.url ?? 'https://engine.example/api/internal/banner-engine', {
      method: 'POST',
      headers: { 'authorization': `Bearer ${token}`, 'content-type': 'application/json', ...options.headers },
      body: options.body instanceof Uint8Array ? new Uint8Array(options.body) : options.body ?? '{"action":"claim"}'
    })
    const url = new URL(request.url)
    // Exact cloudflare-pages preset buffering and localFetch arguments.
    const body = Buffer.from(await request.arrayBuffer())
    const app = createApp({
      onRequest(event) {
        // Nitro runtime/internal/app.mjs onRequest propagation, before plugins.
        const fetchContext = (event.node.req as typeof event.node.req & {
          __unenv__: { _platform: { cloudflare: { request: Request, env: Record<string, unknown> } } }
        }).__unenv__
        event.context = { _platform: fetchContext._platform, ...fetchContext._platform, ...event.context }
        if (options.contextShape === 'platform-only') event.context.cloudflare = { env: fetchContext._platform.cloudflare.env }
        if (options.contextShape === 'flattened-only') delete event.context._platform
        options.mutate?.(event)
      }
    })
    app.use(eventHandler(event => engineJobHttp(event, async () => {
      expect(event.web).toBeUndefined()
      expect(event.node.req instanceof Readable).toBe(false)
      const config = engineJobConfig(event)
      if (options.auth !== false) assertEngineServiceAuth(event, config)
      return await readEngineJobJson(event, options.limit)
    })))
    // node-mock-http declares its own IncomingMessage; the newer installed Node
    // types add members absent from that declaration. This is Nitro's real call.
    return bridge(toNodeListener(app) as unknown as Parameters<typeof bridge>[0], url.pathname + url.search, {
      context: { waitUntil() {}, _platform: { cf: undefined, cloudflare: { request, env: options.env ?? bindings(), context: {} } } },
      host: url.hostname,
      protocol: url.protocol,
      method: request.method,
      headers: request.headers,
      body
    })
  }

  it.each(['standard', 'platform-only', 'flattened-only'] as const)('accepts native HTTPS and consumed JSON with %s context', async (contextShape) => {
    const response = await invoke({ contextShape })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ action: 'claim' })
    expect(response.headers.get('cache-control')).toBe('private, no-store')
  })

  it('accepts bounded prebuffered body independently of service transport auth', async () => {
    const response = await invoke({ auth: false })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ action: 'claim' })
  })

  it('rejects forged forwarding headers on native HTTP', async () => {
    const response = await invoke({ url: 'http://engine.example/api/internal/banner-engine', headers: { 'x-forwarded-proto': 'https', 'x-forwarded-host': 'localhost', 'forwarded': 'proto=https;host=localhost' } })
    expect(response.status).toBe(403)
  })

  it('prefers the original platform URL over a replaced flattened Request', async () => {
    const response = await invoke({ url: 'http://engine.example/api/internal/banner-engine', mutate(event) {
      event.context.cloudflare = { ...event.context.cloudflare, request: new Request('https://engine.example') }
    } })
    expect(response.status).toBe(403)
  })

  it('measures actual UTF-8 bytes and accepts the exact limit', async () => {
    const accepted = await invoke({ body: '{"é":0}', limit: 8 })
    expect(accepted.status).toBe(200)
    expect(await accepted.json()).toEqual({ é: 0 })
    expect((await invoke({ body: '{"é":0}', limit: 7 })).status).toBe(413)
  })

  it('rejects Request-shaped caller JSON as transport authority', async () => {
    const response = await invoke({ mutate(event) {
      const forged = { url: 'https://engine.example', bodyUsed: true }
      event.context._platform.cloudflare.request = forged
      event.context.cloudflare.request = forged
      event.node.req.headers['x-forwarded-proto'] = 'https'
    } })
    expect(response.status).toBe(403)
  })

  it('checks bearer authentication before parsing malformed input', async () => {
    expect((await invoke({ headers: { authorization: 'Bearer wrong' }, body: 'secret malformed' })).status).toBe(401)
  })

  it('remains disabled without opt-in and honors explicit disabled bindings', async () => {
    vi.stubEnv('BANNER_ENGINE_ENABLED', '')
    expect((await invoke({ env: {}, body: 'secret malformed' })).status).toBe(503)
    vi.stubEnv('BANNER_ENGINE_ENABLED', 'true')
    expect((await invoke({ env: { ...bindings(), BANNER_ENGINE_ENABLED: 'false' } })).status).toBe(503)
  })

  it.each([
    ['malformed JSON', 'secret malformed', {}, 64, 400],
    ['malformed UTF-8', new Uint8Array([0xff]), {}, 64, 400],
    ['empty body', '', {}, 64, 400],
    ['oversized actual bytes', '{"action":"claim"}', { 'content-length': '2' }, 8, 413],
    ['oversized declared bytes', '{}', { 'content-length': '100' }, 8, 413],
    ['invalid declared length', '{}', { 'content-length': '2x' }, 8, 413],
    ['compressed body', '{}', { 'content-encoding': 'gzip' }, 64, 415],
    ['non-JSON body', '{}', { 'content-type': 'text/plain' }, 64, 415]
  ] as const)('rejects %s', async (_label, body, headers, limit, status) => {
    const response = await invoke({ body, headers, limit })
    expect(response.status).toBe(status)
    expect(await response.text()).not.toContain('secret malformed')
    expect(response.headers.get('cache-control')).toBe('private, no-store')
  })

  it('rejects parsed caller objects instead of serializing them into trusted bytes', async () => {
    const response = await invoke({ auth: false, mutate(event) {
      Object.assign(event.node.req, { body: { action: 'claim' } })
    } })
    expect(response.status).toBe(400)
  })

  it('does not accept a prebuffer without a consumed native platform Request', async () => {
    const response = await invoke({ auth: false, mutate(event) {
      delete event.context._platform
      delete event.context.cloudflare.request
    } })
    expect(response.status).toBe(400)
  })
})
