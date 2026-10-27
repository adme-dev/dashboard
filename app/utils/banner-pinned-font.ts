import type { Layer } from '~/types/banner-studio'
import type { BridgeTextMeasurement } from '~~/shared/bannerDocumentBridge'
import { BANNER_PINNED_FONT, isBannerPinnedFamily, isBannerPinnedFace } from '~~/shared/bannerPinnedFont'

let installedFace: FontFace | undefined
let loading: Promise<FontFace> | undefined
const assertActive = (signal?: AbortSignal) => {
  signal?.throwIfAborted()
}

function assertNoCollision() {
  for (const face of document.fonts) {
    if (face === installedFace || !isBannerPinnedFamily(face.family) || face.style !== 'normal') continue
    const weights = face.weight === 'bold' ? [700] : face.weight === 'normal' ? [400] : face.weight.split(/\s+/).map(Number)
    if (weights.length === 1 ? weights[0] === 700 : weights[0]! <= 700 && weights[1]! >= 700) {
      throw new Error('A conflicting Source Sans 3 Bold font is installed; reload with the platform font')
    }
  }
}

function cancellable<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  assertActive(signal)
  if (!signal) return promise
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason ?? new DOMException('Cancelled', 'AbortError'))
    signal.addEventListener('abort', abort, { once: true })
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort))
  })
}

async function fetchAndInstall(): Promise<FontFace> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(new Error('Pinned font loading timed out')), 15000)
  try {
    const response = await fetch(BANNER_PINNED_FONT.url, { signal: controller.signal, credentials: 'same-origin' })
    if (!response.ok || !response.body) throw new Error('Pinned font asset is unavailable')
    const reader = response.body.getReader()
    const bytes = new Uint8Array(BANNER_PINNED_FONT.byteLength)
    let length = 0
    try {
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        if (length + value.byteLength > bytes.byteLength) throw new Error('Pinned font byte length mismatch')
        bytes.set(value, length)
        length += value.byteLength
      }
    } finally {
      await reader.cancel()
      reader.releaseLock()
    }
    if (length !== bytes.byteLength) throw new Error('Pinned font byte length mismatch')
    const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(v => v.toString(16).padStart(2, '0')).join('')
    if (hash !== BANNER_PINNED_FONT.sha256) throw new Error('Pinned font checksum mismatch')
    assertActive(controller.signal)
    const face = new FontFace(BANNER_PINNED_FONT.family, bytes.buffer, { weight: '700', style: 'normal', display: 'block' })
    await cancellable(face.load(), controller.signal)
    assertActive(controller.signal)
    if (face.status !== 'loaded') throw new Error('Pinned font failed to load')
    assertNoCollision()
    document.fonts.add(face)
    installedFace = face
    return face
  } finally {
    clearTimeout(timeout)
  }
}

/** Resolve only after the exact bytes are verified, decoded and installed. Never uses a local() face. */
export async function loadBannerPinnedFont(options: { signal?: AbortSignal } = {}): Promise<FontFace> {
  assertActive(options.signal)
  if (typeof document === 'undefined' || !document.fonts || typeof FontFace === 'undefined' || !globalThis.crypto?.subtle) {
    throw new Error('Exact platform font loading requires a supported secure browser')
  }
  assertNoCollision()
  if (installedFace) {
    if (installedFace.status !== 'loaded' || !document.fonts.has(installedFace)) throw new Error('Pinned font is no longer installed')
    return installedFace
  }
  if (!loading) {
    loading = fetchAndInstall().finally(() => {
      loading = undefined
    })
  }
  const face = await cancellable(loading, options.signal)
  assertActive(options.signal)
  assertNoCollision()
  if (face.status !== 'loaded' || !document.fonts.has(face)) throw new Error('Pinned font is no longer installed')
  return face
}

function assertSupported(layer: Layer, text: string) {
  if (layer.type !== 'text' || !isBannerPinnedFace(layer.fontFamily, layer.fontWeight)
    || (layer.fontStyle && layer.fontStyle !== 'normal') || (layer.textAlign && layer.textAlign !== 'left')
    || (layer.textTransform && layer.textTransform !== 'none') || (layer.letterSpacing && !['0', '0px', 'normal'].includes(layer.letterSpacing))
    || ['textRuns', 'lineBoxFontSize', 'textShadow', 'textStroke', 'gradientColors', 'textDepth', 'textTexture', 'bgColor', 'effectOrigin', 'letteringRecipe'].some((key) => {
      const value = layer[key as keyof Layer]
      return value !== undefined && value !== null && value !== false && value !== ''
    }) || (layer.visualFilter && layer.visualFilter !== 'none') || layer.textAntialias === false) {
    throw new Error('Unsupported pinned-font typography; the original layer is not converted')
  }
  if (!text.trim() || text.length > 4000 || [...text].some((char) => {
    const code = char.codePointAt(0)!
    return !((code >= 32 && code <= 126) || (code >= 160 && code <= 255) || [0x2013, 0x2014, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022].includes(code))
  })) throw new Error('Text uses unproven glyphs or is not a bounded single line')
  if (![layer.fontSize, layer.w, layer.h, layer.lineHeight ?? 1.2].every(value => Number.isFinite(value) && value! > 0)
    || layer.fontSize! > 512 || text.length * layer.fontSize! ** 2 > 16_777_216) throw new Error('Text exceeds pinned-font measurement limits')
}

/** Fresh browser ink + advance + line-box bounds; neither native metrics nor submitted bounds are trusted. */
export async function measureBannerPinnedText(layer: Layer, text: string, options: { signal?: AbortSignal } = {}): Promise<BridgeTextMeasurement> {
  // Snapshot before the await; the caller separately fences its project/selection after each await.
  const original = structuredClone(layer)
  assertSupported(original, text)
  await loadBannerPinnedFont(options)
  assertActive(options.signal)
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  if (!context || !document.body) throw new Error('Browser text measurement is unavailable')
  const size = original.fontSize!
  const font = `normal 700 ${size}px "${BANNER_PINNED_FONT.family}"`
  context.font = font
  context.textAlign = 'left'
  context.textBaseline = 'alphabetic'
  context.direction = 'ltr'
  context.fontKerning = 'auto'
  context.textRendering = original.textAntialias ? 'optimizeLegibility' : 'auto'
  const metrics = context.measureText(text)
  const probe = document.createElement('div')
  const lineHeight = size * (original.lineHeight ?? 1.2)
  probe.style.cssText = `all:initial;position:fixed;left:-100000px;top:0;visibility:hidden;pointer-events:none;display:block;width:${original.w}px;height:auto;padding:0;margin:0;border:0;font:${font};font-synthesis:none;line-height:${lineHeight}px;white-space:pre;letter-spacing:normal;word-spacing:normal;text-transform:none;direction:ltr;`
  if (original.textAntialias) probe.style.textRendering = 'optimizeLegibility'
  const node = document.createTextNode(text)
  const baselineMarker = document.createElement('span')
  baselineMarker.style.cssText = 'all:initial;display:inline-block;width:0;height:0;vertical-align:baseline;'
  probe.append(node, baselineMarker)
  document.body.append(probe)
  try {
    const box = probe.getBoundingClientRect()
    const baseline = baselineMarker.getBoundingClientRect().top - box.top
    const range = document.createRange()
    range.selectNode(node)
    const advance = range.getBoundingClientRect().width
    const bounds = {
      left: Math.min(0, -metrics.actualBoundingBoxLeft) + 0,
      top: Math.min(0, baseline - metrics.actualBoundingBoxAscent),
      right: Math.max(advance, metrics.width, metrics.actualBoundingBoxRight),
      bottom: Math.max(box.height, lineHeight, baseline + metrics.actualBoundingBoxDescent)
    }
    assertActive(options.signal)
    assertNoCollision()
    if (!Object.values(bounds).every(Number.isFinite) || bounds.left < 0 || bounds.top < 0
      || bounds.right <= bounds.left || bounds.bottom <= bounds.top || bounds.right > original.w || bounds.bottom > original.h) {
      throw new Error('Returned text does not fit unchanged layer bounds')
    }
    return bounds
  } finally {
    probe.remove()
  }
}
