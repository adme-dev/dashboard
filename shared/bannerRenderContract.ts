/** Pure RPC boundary. Possessing this shape grants no project or storage authority. */
export const BANNER_RENDER_LIMITS = Object.freeze({
  MAX_ITEMS: 4, MAX_SIDE: 4000, MAX_GIF_SIDE: 2000, MAX_DEVICE_PIXELS: 16000000,
  MAX_HTML_BYTES: 2 * 1024 * 1024, MAX_REQUEST_HTML_BYTES: 6 * 1024 * 1024,
  MAX_GIF_FRAMES: 100, MAX_GIF_TOTAL_PIXELS: 60000000,
  MAX_ITEM_OUTPUT_BYTES: 20 * 1024 * 1024, MAX_RESPONSE_BYTES: 28 * 1024 * 1024,
  ITEM_DEADLINE_MS: 120000, REQUEST_DEADLINE_MS: 120000,
  NAVIGATION_TIMEOUT_MS: 15000, SETTLE_TIMEOUT_MS: 5000
})
export type BannerRenderEnvironment = 'staging' | 'production'
export type BannerRenderOutput = 'png' | 'jpeg' | 'gif'
export type BannerRenderErrorCode = 'INVALID_INPUT' | 'LIMIT_EXCEEDED' | 'UNAVAILABLE' | 'BROWSER_UNAVAILABLE' | 'RESOURCE_BLOCKED' | 'RESOURCE_FAILED' | 'UNSUPPORTED_TIMELINE' | 'TIMEOUT' | 'RENDER_FAILED'
export interface BannerRenderDiagnostic {
  stage: 'resource-transport' | 'resource-http' | 'font-integrity' | 'resource-decode'
  status?: number
}
export interface BannerRenderItem {
  key: string
  width: number
  height: number
  scale: 1 | 2
  html: string
}
export interface BannerRenderRequest {
  version: 1
  expectedEnvironment: BannerRenderEnvironment
  requestId: string
  output: BannerRenderOutput
  jpegQuality?: number
  fps?: number
  items: BannerRenderItem[]
}
export interface BannerRenderedItem {
  key: string
  output: BannerRenderOutput
  mime: 'image/png' | 'image/jpeg' | 'image/gif'
  width: number
  height: number
  pixelWidth: number
  pixelHeight: number
  frames: number
  frameDelayMs?: number
  durationSec?: number
  byteLength: number
  sha256: string
  bytes: Uint8Array
}
export type BannerRenderResponse = {
  version: 1
  ok: true
  value: {
    items: BannerRenderedItem[]
  }
} | {
  version: 1
  ok: false
  error: {
    code: BannerRenderErrorCode
    message: string
    itemKey?: string
    diagnostic?: BannerRenderDiagnostic
  }
}
export interface BannerRendererClient {
  render(request: BannerRenderRequest): Promise<BannerRenderResponse>
}
export class BannerRenderError extends Error {
  constructor(readonly code: BannerRenderErrorCode, readonly diagnostic?: BannerRenderDiagnostic) {
    super(code)
    this.name = 'BannerRenderError'
  }
}
function record(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(k => !keys.includes(k)))
    throw new BannerRenderError('INVALID_INPUT')
  return value as Record<string, unknown>
}
function integer(value: unknown, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min)
    throw new BannerRenderError('INVALID_INPUT')
  if (value > max)
    throw new BannerRenderError('LIMIT_EXCEEDED')
  return value
}
export function parseBannerRenderRequest(input: unknown): BannerRenderRequest {
  const r = record(input, ['version', 'expectedEnvironment', 'requestId', 'output', 'jpegQuality', 'fps', 'items'])
  if (r.version !== 1 || (typeof r.expectedEnvironment !== 'string' || !['staging', 'production'].includes(r.expectedEnvironment)) || typeof r.requestId !== 'string' || !/^[A-Za-z0-9_-]{8,64}$/.test(r.requestId) || (typeof r.output !== 'string' || !['png', 'jpeg', 'gif'].includes(r.output)))
    throw new BannerRenderError('INVALID_INPUT')
  const output = r.output as BannerRenderOutput
  if ((output !== 'jpeg' && r.jpegQuality !== undefined) || (output !== 'gif' && r.fps !== undefined))
    throw new BannerRenderError('INVALID_INPUT')
  const jpegQuality = output === 'jpeg' ? integer(r.jpegQuality, 1, 100) : undefined
  const fps = output === 'gif' ? integer(r.fps, 5, 15) : undefined
  if (!Array.isArray(r.items) || !r.items.length)
    throw new BannerRenderError('INVALID_INPUT')
  if (r.items.length > BANNER_RENDER_LIMITS.MAX_ITEMS)
    throw new BannerRenderError('LIMIT_EXCEEDED')
  const keys = new Set<string>()
  let htmlBytes = 0
  const items = r.items.map((raw) => {
    const item = record(raw, ['key', 'width', 'height', 'scale', 'html'])
    if (typeof item.key !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.:x-]{0,63}$/.test(item.key) || keys.has(item.key) || ![1, 2].includes(Number(item.scale)) || typeof item.scale !== 'number' || (output === 'gif' && item.scale !== 1) || typeof item.html !== 'string' || !item.html.trim())
      throw new BannerRenderError('INVALID_INPUT')
    keys.add(item.key)
    const side = output === 'gif' ? BANNER_RENDER_LIMITS.MAX_GIF_SIDE : BANNER_RENDER_LIMITS.MAX_SIDE
    const width = integer(item.width, 1, side)
    const height = integer(item.height, 1, side)
    if (width * height * item.scale ** 2 > BANNER_RENDER_LIMITS.MAX_DEVICE_PIXELS || item.html.length > BANNER_RENDER_LIMITS.MAX_HTML_BYTES)
      throw new BannerRenderError('LIMIT_EXCEEDED')
    const bytes = new TextEncoder().encode(item.html).byteLength
    htmlBytes += bytes
    if (bytes > BANNER_RENDER_LIMITS.MAX_HTML_BYTES || htmlBytes > BANNER_RENDER_LIMITS.MAX_REQUEST_HTML_BYTES)
      throw new BannerRenderError('LIMIT_EXCEEDED')
    return { key: item.key, width, height, scale: item.scale as 1 | 2, html: item.html }
  })
  return { version: 1, expectedEnvironment: r.expectedEnvironment as BannerRenderEnvironment, requestId: r.requestId, output, ...(jpegQuality === undefined ? {} : { jpegQuality }), ...(fps === undefined ? {} : { fps }), items }
}
