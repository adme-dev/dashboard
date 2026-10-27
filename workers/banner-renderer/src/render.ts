import type { BannerRendererProductionEnv } from '../worker-production'
import type { BannerRendererStagingEnv } from '../worker-staging'
import { Buffer } from 'node:buffer'
import puppeteer, { type Browser, type Page, type HTTPRequest } from '@cloudflare/puppeteer'
import { BannerRenderError, BANNER_RENDER_LIMITS as L, parseBannerRenderRequest, type BannerRenderResponse, type BannerRenderRequest, type BannerRenderedItem, type BannerRenderItem } from '../../../shared/bannerRenderContract'
import { contentSecurityPolicy, DOCUMENT_URL, PINNED_FONT_PATH, parseResourceManifest, resourceAllowed, type ResourceManifest } from './resourcePolicy'
import { encodedDimensions, gifEncoder } from './codec'

type BannerRendererEnv = BannerRendererProductionEnv | BannerRendererStagingEnv
export interface RenderDependencies {
  launch: () => Promise<Browser>
  fetchResource: typeof fetch
  timeoutMs?: number
  retainCleanup?: (promise: Promise<unknown>) => void
}
export interface RenderConfiguration {
  environment: unknown
  appOrigins: unknown
  assetOrigins: unknown
}
class Deadline {
  readonly controller = new AbortController()
  readonly end: number
  constructor(ms: number) { this.end = Date.now() + ms }
  check() {
    if (this.controller.signal.aborted || Date.now() >= this.end) {
      this.controller.abort()
      throw new BannerRenderError('TIMEOUT')
    }
  }

  async run<T>(promise: Promise<T>, maximum = Infinity): Promise<T> {
    try {
      this.check()
    } catch (error) {
      void promise.catch(() => {})
      throw error
    }
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      return await Promise.race([promise, new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          this.controller.abort()
          reject(new BannerRenderError('TIMEOUT'))
        }, Math.min(maximum, this.end - Date.now()))
      })])
    } finally {
      clearTimeout(timer)
    }
  }
}
async function closeBounded(close: () => Promise<unknown>) {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([close().catch(() => { }), new Promise((resolve) => {
      timer = setTimeout(resolve, 2000)
    })])
  } finally {
    clearTimeout(timer)
  }
}
async function readResource(response: Response, budget: {
  bytes: number
}, deadline: Deadline): Promise<Uint8Array> {
  const max = 10 * 1024 * 1024
  if (Number(response.headers.get('content-length')) > max) {
    await response.body?.cancel()
    throw new BannerRenderError('LIMIT_EXCEEDED')
  }
  const reader = response.body?.getReader()
  if (!reader)
    throw new BannerRenderError('RESOURCE_FAILED')
  const chunks: Uint8Array[] = []
  let length = 0
  try {
    while (true) {
      const next = await deadline.run(reader.read(), L.SETTLE_TIMEOUT_MS)
      if (next.done)
        break
      length += next.value.byteLength
      budget.bytes += next.value.byteLength
      if (length > max || budget.bytes > 32 * 1024 * 1024)
        throw new BannerRenderError('LIMIT_EXCEEDED')
      chunks.push(next.value)
    }
  } finally {
    await reader.cancel().catch(() => { })
  }
  const result = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.byteLength
  }
  return result
}
async function prepare(page: Page, item: BannerRenderItem, request: BannerRenderRequest, manifest: ResourceManifest, deps: RenderDependencies, deadline: Deadline) {
  let resourceError: BannerRenderError | undefined
  let count = 0
  let delivered = false
  const budget = { bytes: 0 }
  const pending = new Set<Promise<void>>()
  const fail = (error: unknown) => {
    resourceError ??= error instanceof BannerRenderError ? error : new BannerRenderError('RESOURCE_FAILED')
  }
  const handle = async (req: HTTPRequest) => {
    try {
      deadline.check()
      if (++count > 100)
        throw new BannerRenderError('LIMIT_EXCEEDED')
      if (!delivered && req.url() === DOCUMENT_URL && req.isNavigationRequest() && req.frame() === page.mainFrame()) {
        delivered = true
        await req.respond({ status: 200, contentType: 'text/html; charset=utf-8', headers: { 'content-security-policy': contentSecurityPolicy(request.output === 'gif'), 'cache-control': 'no-store', 'x-dns-prefetch-control': 'off', 'referrer-policy': 'no-referrer' }, body: item.html })
        return
      }
      // Chrome requests a favicon even when the document does not; fulfill locally only.
      if (req.url() === 'https://banner-render.invalid/favicon.ico' && req.resourceType() === 'other' && req.method() === 'GET') {
        await req.respond({ status: 204 })
        return
      }
      if (req.isNavigationRequest() || !resourceAllowed(req.url(), req.resourceType(), req.method(), req.redirectChain().length > 0, request.output === 'gif', manifest))
        throw new BannerRenderError('RESOURCE_BLOCKED')
      if (req.url().startsWith('data:')) {
        await req.continue()
        return
      }
      // Only reviewed manifest URLs reach fetch, without browser cookies or caller headers.
      let response: Response
      try {
        response = await deadline.run(deps.fetchResource(req.url(), { method: 'GET', redirect: 'manual', credentials: 'omit', signal: deadline.controller.signal }), L.NAVIGATION_TIMEOUT_MS)
      } catch (error) {
        throw error instanceof BannerRenderError ? error : new BannerRenderError('RESOURCE_FAILED', { stage: 'resource-transport' })
      }
      if (response.status >= 300 && response.status < 400) {
        await response.body?.cancel()
        throw new BannerRenderError('RESOURCE_BLOCKED')
      }
      if (!response.ok) {
        await response.body?.cancel()
        throw new BannerRenderError('RESOURCE_FAILED', { stage: 'resource-http', status: response.status })
      }
      const bytes = await readResource(response, budget, deadline)
      if (new URL(req.url()).pathname === PINNED_FONT_PATH) {
        const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes).buffer)
        const hash = Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, '0')).join('')
        if (bytes.length !== 428176 || hash !== '9214b9d95e4231c609802815c2646c98174e2102d0d37f88978a7f8e71006e6a') throw new BannerRenderError('RESOURCE_FAILED', { stage: 'font-integrity' })
      }
      await req.respond({ status: 200, contentType: response.headers.get('content-type') || 'application/octet-stream', headers: { 'access-control-allow-origin': '*', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }, body: Buffer.from(bytes) })
    } catch (error) {
      fail(error)
      await req.abort('blockedbyclient').catch(() => { })
    }
  }
  await deadline.run(page.setRequestInterception(true))
  page.on('request', (req) => {
    const task = handle(req)
    pending.add(task)
    void task.finally(() => pending.delete(task))
  })
  page.on('requestfailed', () => fail(new BannerRenderError('RESOURCE_FAILED')))
  page.on('pageerror', () => fail(new BannerRenderError('RENDER_FAILED')))
  await deadline.run(page.setJavaScriptEnabled(request.output === 'gif'))
  await deadline.run(page.setBypassServiceWorker(true))
  await deadline.run(page.setCacheEnabled(false))
  await deadline.run(page.setViewport({ width: item.width, height: item.height, deviceScaleFactor: item.scale }))
  await deadline.run(page.evaluateOnNewDocument(() => {
    for (const name of ['RTCPeerConnection', 'webkitRTCPeerConnection', 'WebTransport', 'WebSocket', 'EventSource', 'Worker', 'SharedWorker', 'open']) {
      Object.defineProperty(globalThis, name, { value: undefined, writable: false, configurable: false })
    }
    document.addEventListener('securitypolicyviolation', () => {
      document.documentElement.dataset.bannerPolicyViolation = 'true'
    })
  }))
  const cdp = await deadline.run(page.createCDPSession())
  await deadline.run(cdp.send('Animation.enable'))
  await deadline.run(cdp.send('Animation.setPlaybackRate', { playbackRate: 0 }))
  try {
    await deadline.run(page.goto(DOCUMENT_URL, { waitUntil: 'load', timeout: L.NAVIGATION_TIMEOUT_MS }))
  } catch (error) {
    throw resourceError ?? error
  }
  const settle = async () => {
    await page.evaluate(async () => {
      await document.fonts.ready
      for (const font of document.fonts.values()) {
        if (font.status === 'error') throw new Error('Font failed to decode')
      }
      await Promise.all(Array.from(document.images).map(image => image.decode()))
      if (document.documentElement.dataset.bannerPolicyViolation)
        throw new Error('Policy violation')
    })
    while (pending.size)
      await Promise.all([...pending])
  }
  try {
    await deadline.run(settle(), L.SETTLE_TIMEOUT_MS)
  } catch (error) {
    throw resourceError ?? (error instanceof BannerRenderError ? error : new BannerRenderError('RESOURCE_FAILED', { stage: 'resource-decode' }))
  }
  if (resourceError)
    throw resourceError
  return async () => {
    await deadline.run(settle(), L.SETTLE_TIMEOUT_MS)
    if (resourceError)
      throw resourceError
    deadline.check()
  }
}
interface FrameRuntime {
  ready: boolean
  duration: number
  seek(t: number): void
  getDiagnostics(): {
    hasTimeline: boolean
    events: unknown[]
  }
}
declare global {
  interface Window {
    __engagrFrame?: FrameRuntime
    gsap?: {
      ticker: {
        sleep(): void
      }
    }
  }
}
async function capture(page: Page, item: BannerRenderItem, request: BannerRenderRequest, deadline: Deadline, check: () => Promise<void>): Promise<BannerRenderedItem> {
  let frames = 1
  let durationSec: number | undefined
  let frameDelayMs: number | undefined
  let bytes: Uint8Array
  const screenshot = (type: 'png' | 'jpeg') => deadline.run(page.screenshot({ type, ...(type === 'jpeg' ? { quality: request.jpegQuality } : {}), clip: { x: 0, y: 0, width: item.width, height: item.height }, captureBeyondViewport: false }))
  if (request.output === 'gif') {
    durationSec = await deadline.run(page.evaluate(() => {
      const runtime = window.__engagrFrame
      if (!runtime?.ready || typeof runtime.seek !== 'function' || typeof runtime.getDiagnostics !== 'function' || !runtime.getDiagnostics().hasTimeline || !Number.isFinite(runtime.duration) || runtime.duration <= 0)
        return -1
      window.gsap?.ticker.sleep()
      return runtime.duration
    }))
    if (durationSec <= 0)
      throw new BannerRenderError('UNSUPPORTED_TIMELINE')
    frames = Math.ceil(durationSec * request.fps!)
    if (frames > L.MAX_GIF_FRAMES || frames * item.width * item.height > L.MAX_GIF_TOTAL_PIXELS)
      throw new BannerRenderError('LIMIT_EXCEEDED')
    frameDelayMs = Math.round(100 / request.fps!) * 10
    const gif = gifEncoder(item.width, item.height, frameDelayMs)
    for (let frame = 0;
      frame < frames;
      frame++) {
      await check()
      await deadline.run(page.evaluate((time) => {
        window.__engagrFrame!.seek(time)
        if (window.__engagrFrame!.getDiagnostics().events.length)
          throw new Error('Timeline failed')
      }, frame / request.fps!))
      await check()
      bytes = new Uint8Array(await screenshot('png'))
      gif.frame(bytes)
    }
    bytes = gif.finish()
  } else {
    await deadline.run(page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}' }))
    bytes = new Uint8Array(await screenshot(request.output))
  }
  await check()
  if (!bytes.length || bytes.byteLength > L.MAX_ITEM_OUTPUT_BYTES)
    throw new BannerRenderError('LIMIT_EXCEEDED')
  const dimensions = encodedDimensions(bytes, request.output)
  if (dimensions.width !== item.width * item.scale || dimensions.height !== item.height * item.scale)
    throw new BannerRenderError('RENDER_FAILED')
  const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes).buffer)
  const sha256 = Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, '0')).join('')
  return { key: item.key, output: request.output, mime: request.output === 'jpeg' ? 'image/jpeg' : request.output === 'gif' ? 'image/gif' : 'image/png', width: item.width, height: item.height, pixelWidth: dimensions.width, pixelHeight: dimensions.height, frames, ...(durationSec === undefined ? {} : { durationSec, frameDelayMs }), byteLength: bytes.length, sha256, bytes }
}
export async function handleBannerRender(input: unknown, config: RenderConfiguration, deps: RenderDependencies): Promise<BannerRenderResponse> {
  let browser: Browser | undefined
  let page: Page | undefined
  let itemKey: string | undefined
  const deadline = new Deadline(deps.timeoutMs ?? L.REQUEST_DEADLINE_MS)
  try {
    const request = parseBannerRenderRequest(input)
    if (request.expectedEnvironment !== config.environment)
      throw new BannerRenderError('UNAVAILABLE')
    const manifest = parseResourceManifest(config.appOrigins, config.assetOrigins)
    try {
      const launching = deps.launch().then(async (launched) => {
        if (deadline.controller.signal.aborted) {
          await closeBounded(() => launched.close())
          throw new BannerRenderError('TIMEOUT')
        }
        return launched
      })
      deps.retainCleanup?.(launching.catch(() => {}))
      browser = await deadline.run(launching)
    } catch (error) {
      throw error instanceof BannerRenderError ? error : new BannerRenderError('BROWSER_UNAVAILABLE')
    }
    const items: BannerRenderedItem[] = []
    let totalBytes = 0
    for (const item of request.items) {
      itemKey = item.key
      const creating = browser.newPage().then(async (created) => {
        if (deadline.controller.signal.aborted) {
          await closeBounded(() => created.close())
          throw new BannerRenderError('TIMEOUT')
        }
        return created
      })
      deps.retainCleanup?.(creating.catch(() => {}))
      page = await deadline.run(creating)
      try {
        const check = await prepare(page, item, request, manifest, deps, deadline)
        const result = await capture(page, item, request, deadline, check)
        totalBytes += result.byteLength
        if (totalBytes > L.MAX_RESPONSE_BYTES)
          throw new BannerRenderError('LIMIT_EXCEEDED')
        items.push(result)
      } finally {
        const closing = page
        page = undefined
        await closeBounded(() => closing.close())
      }
    }
    return { version: 1, ok: true, value: { items } }
  } catch (error) {
    const code = error instanceof BannerRenderError ? error.code : 'RENDER_FAILED'
    return { version: 1, ok: false, error: { code, message: `Banner rendering failed: ${code}.`, ...(itemKey ? { itemKey } : {}), ...(error instanceof BannerRenderError && error.diagnostic ? { diagnostic: error.diagnostic } : {}) } }
  } finally {
    deadline.controller.abort()
    if (page) {
      const closing = page
      await closeBounded(() => closing.close())
    }
    if (browser) {
      const closing = browser
      await closeBounded(() => closing.close())
    }
  }
}
export function renderWithBinding(input: unknown, env: BannerRendererEnv, ctx: Pick<ExecutionContext, 'waitUntil'>) {
  return handleBannerRender(input, { environment: env.BANNER_RENDER_ENVIRONMENT, appOrigins: env.BANNER_RENDER_APP_ORIGINS, assetOrigins: env.BANNER_RENDER_ASSET_ORIGINS }, {
    launch: () => {
      if (!env.BROWSER)
        throw new BannerRenderError('UNAVAILABLE')
      return puppeteer.launch(env.BROWSER)
    },
    fetchResource: fetch,
    retainCleanup: promise => ctx.waitUntil(promise)
  })
}
