// Split a flattened picture into editable layers.
//
// Cloudflare AI Gateway lists ByteDance Seedream 5.5 but does not expose its native
// layer decomposition (the `layer_decomposition` flag is rejected). This helper builds
// the same result from calls the gateway does accept:
//
//   1. a vision model lists the elements, each with a box, a name and a stacking order;
//   2. one Seedream call per element redraws that element alone, in place, on a
//      transparent canvas, and the result is cropped to what is actually there;
//   3. one Seedream call removes the listed elements to make the base picture.
//
// Pure: no bindings, no codecs, no storage. The caller passes the model runner and
// an image codec, so the same code runs in a Worker and in Nitro. Relative imports
// only, because wrangler's esbuild does not resolve the `~~/` alias.

export const SEEDREAM_LAYER_MODEL = 'bytedance/seedream-5.5'
export const LAYER_VISION_MODEL = 'google/gemini-3.8-flash'

export const DEFAULT_MAX_LAYERS = 8
export const HARD_MAX_LAYERS = 12
export const DEFAULT_MAX_COST_USD = 0.5

// Seedream accepts 921,600 to 4,624,220 output pixels. Staying at or under the
// 1.5K tier (2,601,123 px) keeps every output image at the lower price.
const SEEDREAM_MIN_PIXELS = 921_600
const SEEDREAM_TIER_ONE_MAX_PIXELS = 2_601_123
const SEEDREAM_MAX_ASPECT = 16

// Published Cloudflare prices (USD), checked against gateway logs on 2026-11-24.
const SEEDREAM_INPUT_IMAGE_USD = 0.008
const SEEDREAM_OUTPUT_TIER_ONE_USD = 0.02
const SEEDREAM_OUTPUT_TIER_TWO_USD = 0.035
const VISION_INPUT_USD_PER_TOKEN = 0.75 / 1_000_000
const VISION_OUTPUT_USD_PER_TOKEN = 3.75 / 1_000_000
// Used only to budget a job before the vision call has reported its real token count.
const VISION_ESTIMATE_USD = 0.005

const EXTRACT_CONCURRENCY = 3
const MODEL_CALL_TIMEOUT_MS = 150_000
// Alpha at or below this is treated as empty when finding what the model drew.
const ALPHA_FLOOR = 12

export interface RgbaImage {
  width: number
  height: number
  /** RGBA, 4 bytes per pixel, row-major. */
  data: Uint8Array
}

/** PNG/JPEG in and out of raw RGBA, plus a resize. `workers/asset-intelligence/src/layerCodec.ts` has one. */
export interface LayerCodec {
  decode(bytes: Uint8Array): RgbaImage
  encodePng(image: RgbaImage): Uint8Array
  encodeJpeg(image: RgbaImage, quality?: number): Uint8Array
  resize(image: RgbaImage, width: number, height: number): RgbaImage
}

/** `env.AI.run` from a Workers AI binding, or anything with the same shape. */
export type LayerModelRunner = (
  model: string,
  inputs: Record<string, unknown>,
  options?: Record<string, unknown>
) => Promise<unknown>

/** A rectangle in pixels of the source picture. */
export interface LayerBox {
  x: number
  y: number
  width: number
  height: number
}

/** An element to cut out. Pass these to skip the vision pass (Lift does). */
export interface LayerElementHint {
  name: string
  /** Where the element is, in source pixels. */
  box: LayerBox
  /** Stacking order, 1 is furthest back. Defaults to list order. */
  z?: number
  /** text, logo, button, badge, product, subject, graphic. Free text. */
  kind?: string
}

export interface DecomposeOptions {
  /** Most layers to return. Default 8, never more than 12. */
  maxLayers?: number
  /** Elements to cut out. When given, the vision pass is skipped. */
  elements?: LayerElementHint[]
  /** Extra wording from the user, added to the vision and extraction prompts. */
  guidance?: string | null
  /** Also make the base picture with the elements removed. Default true. */
  includeBase?: boolean
  /** Refuse or trim the job so its estimated cost stays under this. Default US$0.50. */
  maxCostUsd?: number
  /** Sent to the gateway as request metadata, for attribution in gateway logs. */
  metadata?: Record<string, string>
}

export interface DecomposeDeps {
  run: LayerModelRunner
  codec: LayerCodec
  /** Downloads a model output. Defaults to global fetch. Only https URLs are fetched. */
  fetchBytes?: (url: string) => Promise<Uint8Array>
  /** Clock, for tests. */
  now?: () => number
}

export interface DecomposedLayer {
  /** RGBA PNG of this element alone, cropped to its bounds. */
  png: Uint8Array
  /** Pixel size of `png`. This is the model's resolution, not the source's. */
  width: number
  height: number
  /** Where the layer sits in the source picture, in source pixels. Draw `png` scaled into this box. */
  bbox: LayerBox
  /** Stacking order: 1 is directly above the base, higher is further in front. */
  z: number
  name: string
  kind: string
}

export interface DecomposedBase {
  /** The picture with the listed elements removed and the gaps filled. */
  png: Uint8Array
  width: number
  height: number
}

export type LayerStep = 'vision' | 'extract' | 'base'

export interface LayerModelCall {
  step: LayerStep
  model: string
  /** The element this call was for, when it was an extraction. */
  element?: string
  ms: number
  /** From published prices; the gateway bill is the authority. */
  costUsd: number
  ok: boolean
}

export interface LayerSkip {
  name: string
  step: LayerStep
  reason: string
}

export interface DecomposeUsage {
  calls: LayerModelCall[]
  /** Sum of `calls[].costUsd`, in US dollars. */
  costUsd: number
  /** Wall-clock time for the whole job. */
  latencyMs: number
}

export interface DecomposeResult {
  /** Size of the source picture. Every `bbox` is in these pixels. */
  width: number
  height: number
  /** Null when `includeBase` is false or the base call failed (see `skipped`). */
  base: DecomposedBase | null
  /** Back to front. */
  layers: DecomposedLayer[]
  /** Elements that were found but could not be cut out, and why. */
  skipped: LayerSkip[]
  usage: DecomposeUsage
}

export type LayerDecompositionErrorCode
  = | 'invalid_image'
    | 'vision_failed'
    | 'no_elements'
    | 'extraction_failed'
    | 'budget_exceeded'

/** Thrown when no usable result can be returned. `message` is written for the person who ran the job. */
export class LayerDecompositionError extends Error {
  code: LayerDecompositionErrorCode
  usage: DecomposeUsage | null

  constructor(code: LayerDecompositionErrorCode, message: string, usage: DecomposeUsage | null = null) {
    super(message)
    this.name = 'LayerDecompositionError'
    this.code = code
    this.usage = usage
  }
}

interface PlannedElement {
  name: string
  kind: string
  z: number
  /** Normalised 0..1 on the source picture. */
  left: number
  top: number
  right: number
  bottom: number
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function roundUsd(value: number): number {
  return Math.round(value * 100_000) / 100_000
}

/** The size sent to and asked of Seedream: the source's shape, inside the model's pixel range. */
export function layerModelFrame(width: number, height: number): { width: number, height: number } {
  if (!(width > 0) || !(height > 0)) throw new LayerDecompositionError('invalid_image', 'The picture could not be read.')
  const aspect = width / height
  if (aspect > SEEDREAM_MAX_ASPECT || aspect < 1 / SEEDREAM_MAX_ASPECT) {
    throw new LayerDecompositionError('invalid_image', 'The picture is too long and thin to separate. The limit is 16:1.')
  }
  const pixels = width * height
  if (pixels >= SEEDREAM_MIN_PIXELS && pixels <= SEEDREAM_TIER_ONE_MAX_PIXELS) return { width, height }
  const target = clamp(pixels, SEEDREAM_MIN_PIXELS, SEEDREAM_TIER_ONE_MAX_PIXELS)
  const scale = Math.sqrt(target / pixels)
  // Round away from the limit that was crossed, so the result is always inside the range.
  const snap = scale > 1 ? Math.ceil : Math.floor
  return { width: snap(width * scale), height: snap(height * scale) }
}

/** Estimated price of one Seedream call with one input picture and one output picture. */
export function seedreamCallCostUsd(outputPixels: number): number {
  const output = outputPixels > SEEDREAM_TIER_ONE_MAX_PIXELS ? SEEDREAM_OUTPUT_TIER_TWO_USD : SEEDREAM_OUTPUT_TIER_ONE_USD
  return SEEDREAM_INPUT_IMAGE_USD + output
}

/** Estimated price of a whole job, before it runs. */
export function estimateDecomposeCostUsd(input: { layers: number, includeBase: boolean, vision: boolean, framePixels: number }): number {
  const perCall = seedreamCallCostUsd(input.framePixels)
  return roundUsd((input.vision ? VISION_ESTIMATE_USD : 0) + input.layers * perCall + (input.includeBase ? perCall : 0))
}

/** How many layers fit in a budget once the vision call and the base are paid for. */
export function layersWithinBudget(input: { maxCostUsd: number, includeBase: boolean, vision: boolean, framePixels: number }): number {
  const perCall = seedreamCallCostUsd(input.framePixels)
  const fixed = (input.vision ? VISION_ESTIMATE_USD : 0) + (input.includeBase ? perCall : 0)
  return Math.max(0, Math.floor((input.maxCostUsd - fixed + 1e-9) / perCall))
}

export function resolveMaxLayers(requested: number | null | undefined): number {
  const value = Number(requested)
  if (!Number.isFinite(value) || value < 1) return DEFAULT_MAX_LAYERS
  return Math.min(HARD_MAX_LAYERS, Math.floor(value))
}

export function buildVisionPrompt(maxLayers: number, guidance?: string | null): string {
  const lines = [
    'List the separate visual elements of this picture that a designer would want as individual layers: headline and other text blocks, logos, buttons and badges, and the main product or subject.',
    'Do not list the background, scenery, or small decorative scatter.',
    `Return at most ${maxLayers} elements, most important first.`,
    'Reply with JSON only: {"elements":[{"name":"short name","kind":"text|logo|button|badge|product|subject|graphic","box_2d":[ymin,xmin,ymax,xmax],"z":1}]}',
    'box_2d uses integers 0-1000 relative to the picture height and width and must tightly enclose the whole element.',
    'z is the stacking order: 1 is furthest back, higher numbers are in front.'
  ]
  const extra = guidance?.trim()
  if (extra) lines.push(`The editor asked for: ${extra}`)
  return lines.join('\n')
}

function jsonFromModelText(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text)
  const candidate = (fenced?.[1] ?? text).trim()
  try {
    return JSON.parse(candidate)
  } catch {
    const start = candidate.indexOf('{')
    const end = candidate.lastIndexOf('}')
    if (start >= 0 && end > start) {
      try { return JSON.parse(candidate.slice(start, end + 1)) } catch { /* fall through */ }
    }
    return null
  }
}

function visionText(raw: unknown): string | null {
  if (typeof raw === 'string') return raw
  const value = raw as any
  const content = value?.choices?.[0]?.message?.content
    ?? value?.result?.choices?.[0]?.message?.content
    ?? value?.response
    ?? value?.result?.response
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    const text = content.map(part => (typeof part?.text === 'string' ? part.text : '')).join('')
    return text || null
  }
  return null
}

function visionTokens(raw: unknown): { input: number, output: number } | null {
  const usage = (raw as any)?.usage ?? (raw as any)?.result?.usage
  const input = Number(usage?.prompt_tokens)
  const total = Number(usage?.total_tokens)
  if (!Number.isFinite(input) || !Number.isFinite(total)) return null
  // Output includes the model's reasoning tokens, which are billed as output.
  return { input, output: Math.max(0, total - input) }
}

/**
 * Reads the vision model's element list. Accepts `box_2d` as [ymin, xmin, ymax, xmax]
 * on a 0-1000 scale (what the prompt asks for) and `bbox` as [x1, y1, x2, y2].
 * Boxes that are empty, inverted or cover nearly the whole picture are dropped.
 */
export function parseVisionElements(raw: unknown, maxLayers: number): PlannedElement[] {
  const text = visionText(raw)
  const parsed = text ? jsonFromModelText(text) : raw
  const list = Array.isArray(parsed) ? parsed : (parsed as any)?.elements
  if (!Array.isArray(list)) return []
  const elements: PlannedElement[] = []
  for (const item of list) {
    if (!item || typeof item !== 'object') continue
    const entry = item as Record<string, unknown>
    let left: number, top: number, right: number, bottom: number
    const box2d = entry.box_2d
    const bbox = entry.bbox
    if (Array.isArray(box2d) && box2d.length === 4) {
      [top, left, bottom, right] = box2d.map(Number) as [number, number, number, number]
    } else if (Array.isArray(bbox) && bbox.length === 4) {
      [left, top, right, bottom] = bbox.map(Number) as [number, number, number, number]
    } else {
      continue
    }
    if (![left, top, right, bottom].every(Number.isFinite)) continue
    left = clamp(left / 1000, 0, 1)
    top = clamp(top / 1000, 0, 1)
    right = clamp(right / 1000, 0, 1)
    bottom = clamp(bottom / 1000, 0, 1)
    const width = right - left
    const height = bottom - top
    if (width < 0.01 || height < 0.01) continue
    // An "element" the size of the picture is the background.
    if (width * height > 0.92) continue
    const name = typeof entry.name === 'string' && entry.name.trim() ? entry.name.trim().slice(0, 80) : `Element ${elements.length + 1}`
    const kind = typeof entry.kind === 'string' && entry.kind.trim() ? entry.kind.trim().toLowerCase().slice(0, 24) : 'graphic'
    const z = Number(entry.z)
    elements.push({ name, kind, z: Number.isFinite(z) ? z : elements.length + 1, left, top, right, bottom })
    if (elements.length >= maxLayers) break
  }
  return elements
}

function elementsFromHints(hints: LayerElementHint[], width: number, height: number, maxLayers: number): PlannedElement[] {
  const elements: PlannedElement[] = []
  for (const hint of hints) {
    const left = clamp(hint.box.x / width, 0, 1)
    const top = clamp(hint.box.y / height, 0, 1)
    const right = clamp((hint.box.x + hint.box.width) / width, 0, 1)
    const bottom = clamp((hint.box.y + hint.box.height) / height, 0, 1)
    if (right - left <= 0 || bottom - top <= 0) continue
    elements.push({
      name: hint.name.trim().slice(0, 80) || `Element ${elements.length + 1}`,
      kind: hint.kind?.trim().toLowerCase().slice(0, 24) || 'graphic',
      z: Number.isFinite(hint.z) ? Number(hint.z) : elements.length + 1,
      left, top, right, bottom
    })
    if (elements.length >= maxLayers) break
  }
  return elements
}

/** Seedream's coordinate tag: integers 0-999, x1 y1 x2 y2. */
export function seedreamBoxTag(element: { left: number, top: number, right: number, bottom: number }): string {
  const n = (value: number) => clamp(Math.round(value * 999), 0, 999)
  return `<bbox>${n(element.left)} ${n(element.top)} ${n(element.right)} ${n(element.bottom)}</bbox>`
}

export function buildExtractInputs(input: {
  element: PlannedElement
  imageDataUri: string
  frame: { width: number, height: number }
  guidance?: string | null
}): Record<string, unknown> {
  const extra = input.guidance?.trim()
  const { element } = input
  // A box over the whole picture means "the subject, whatever it is": background removal.
  const wholePicture = (element.right - element.left) * (element.bottom - element.top) > 0.9
  const prompt = [
    wholePicture
      ? `Remove the background from this image and keep only the ${element.name}.`
      : `Extract only the ${element.name} at ${seedreamBoxTag(element)} from this image.`,
    'Output that element alone on a fully transparent background, at exactly the same position, size and angle as in the original image.',
    'Keep its pixels, text, colours and edges unchanged. Do not add shadows, outlines or any other element.',
    extra ? `The editor asked for: ${extra}` : ''
  ].filter(Boolean).join(' ')
  return {
    prompt,
    image: input.imageDataUri,
    background: 'transparent',
    output_format: 'png',
    size: `${input.frame.width}x${input.frame.height}`,
    watermark: false
  }
}

export function buildBaseInputs(input: {
  elements: PlannedElement[]
  imageDataUri: string
  frame: { width: number, height: number }
}): Record<string, unknown> {
  const list = input.elements.map(element => `the ${element.name} at ${seedreamBoxTag(element)}`).join('; ')
  return {
    prompt: `Remove these elements from the image completely: ${list}. Fill each gap with the natural background that would be behind it. Keep everything else exactly as it is, at the same position and size. Do not add any new text or objects.`,
    image: input.imageDataUri,
    background: 'opaque',
    output_format: 'png',
    size: `${input.frame.width}x${input.frame.height}`,
    watermark: false
  }
}

/** The output URL from a Seedream call. The binding and the REST API nest it differently. */
export function seedreamImageUrl(raw: unknown): string | null {
  const value = raw as any
  const images = value?.result?.result?.images ?? value?.result?.images ?? value?.images
  const url = Array.isArray(images) ? images[0] : null
  return typeof url === 'string' && url ? url : null
}

function modelErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error || 'request failed')
  if (message.includes('7003')) return 'the image service rejected the request'
  if (/(^|\D)3030(\D|$)/.test(message) || /been flagged/i.test(message)) return 'the AI safety filter blocked it'
  return message.slice(0, 200)
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)} seconds`)), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer)) as Promise<T>
}

async function defaultFetchBytes(url: string): Promise<Uint8Array> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`the result could not be downloaded (HTTP ${response.status})`)
  return new Uint8Array(await response.arrayBuffer())
}

function base64FromBytes(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk))
  }
  return btoa(binary)
}

export interface IsolatedLayer {
  image: RgbaImage
  /** Normalised 0..1 bounds of what was kept, on the model's output canvas. */
  left: number
  top: number
  right: number
  bottom: number
}

/**
 * Takes the model's full-canvas RGBA output and returns the element cropped to its
 * real bounds. Anything drawn well outside the box we asked for is discarded, so a
 * stray fragment elsewhere cannot stretch the layer. Returns a reason when there is
 * nothing usable.
 */
export function isolateLayer(
  output: RgbaImage,
  expected: { left: number, top: number, right: number, bottom: number }
): IsolatedLayer | { reason: string } {
  const { width, height, data } = output
  // Allow the element to be a little larger than the box, but not to wander.
  const marginX = Math.max(0.04, (expected.right - expected.left) * 0.15)
  const marginY = Math.max(0.04, (expected.bottom - expected.top) * 0.15)
  const x0 = clamp(Math.floor((expected.left - marginX) * width), 0, width - 1)
  const y0 = clamp(Math.floor((expected.top - marginY) * height), 0, height - 1)
  const x1 = clamp(Math.ceil((expected.right + marginX) * width), x0 + 1, width)
  const y1 = clamp(Math.ceil((expected.bottom + marginY) * height), y0 + 1, height)

  let minX = x1, minY = y1, maxX = -1, maxY = -1
  let kept = 0
  let opaqueEverywhere = 0
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = data[(y * width + x) * 4 + 3]!
      if (alpha > 240) opaqueEverywhere += 1
      if (alpha <= ALPHA_FLOOR || x < x0 || x >= x1 || y < y0 || y >= y1) continue
      kept += 1
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }
  const expectedArea = (expected.right - expected.left) * (expected.bottom - expected.top)
  if (opaqueEverywhere > width * height * 0.97) {
    return { reason: 'the model returned the whole picture instead of a cut-out' }
  }
  const boxPixels = Math.max(1, expectedArea * width * height)
  if (maxX < 0 || kept < boxPixels * 0.01) return { reason: 'the model returned nothing for this element' }

  const cropWidth = maxX - minX + 1
  const cropHeight = maxY - minY + 1
  const cropped = new Uint8Array(cropWidth * cropHeight * 4)
  for (let y = 0; y < cropHeight; y += 1) {
    const from = ((minY + y) * width + minX) * 4
    cropped.set(data.subarray(from, from + cropWidth * 4), y * cropWidth * 4)
  }
  return {
    image: { width: cropWidth, height: cropHeight, data: cropped },
    left: minX / width,
    top: minY / height,
    right: (maxX + 1) / width,
    bottom: (maxY + 1) / height
  }
}

function boxInSource(bounds: { left: number, top: number, right: number, bottom: number }, width: number, height: number): LayerBox {
  const x = clamp(Math.round(bounds.left * width), 0, width - 1)
  const y = clamp(Math.round(bounds.top * height), 0, height - 1)
  const right = clamp(Math.round(bounds.right * width), x + 1, width)
  const bottom = clamp(Math.round(bounds.bottom * height), y + 1, height)
  return { x, y, width: right - x, height: bottom - y }
}

async function inBatches<T, R>(items: T[], size: number, worker: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0
  async function lane() {
    while (next < items.length) {
      const index = next
      next += 1
      results[index] = await worker(items[index]!, index)
    }
  }
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, lane))
  return results
}

/**
 * Splits a flattened picture into a base and separate RGBA layers.
 *
 * ```ts
 * const { base, layers } = await decomposeImageToLayers(jpegBytes, { maxLayers: 8 }, {
 *   run: (model, inputs, options) => env.AI.run(model, inputs, options),
 *   codec: workerLayerCodec,
 * })
 * for (const layer of layers) draw(layer.png, layer.bbox) // back to front, over `base.png`
 * ```
 *
 * Pass `opts.elements` to cut out known regions and skip the vision pass. Lift is
 * exactly that with one element and `includeBase: false`.
 *
 * Resolves when at least one layer was produced. Elements that failed are listed in
 * `skipped`; a failed base leaves `base` null with an entry in `skipped`. Throws
 * `LayerDecompositionError` when nothing usable came back. Never retries, because
 * every call is billed.
 *
 * Limits of the approach: each layer is redrawn by the model, so fine detail can
 * differ from the source; overlapping elements are each drawn whole, not as they were
 * hidden; and the base is a separate generation, so it can differ slightly from the
 * source outside the removed areas.
 */
export async function decomposeImageToLayers(
  image: Uint8Array,
  opts: DecomposeOptions,
  deps: DecomposeDeps
): Promise<DecomposeResult> {
  const now = deps.now ?? Date.now
  const startedAt = now()
  const fetchBytes = deps.fetchBytes ?? defaultFetchBytes
  const calls: LayerModelCall[] = []
  const skipped: LayerSkip[] = []
  const usage = (): DecomposeUsage => ({
    calls,
    costUsd: roundUsd(calls.reduce((sum, call) => sum + call.costUsd, 0)),
    latencyMs: now() - startedAt
  })
  const fail = (code: LayerDecompositionErrorCode, message: string) => new LayerDecompositionError(code, message, usage())

  let source: RgbaImage
  try {
    source = deps.codec.decode(image)
  } catch (error) {
    throw fail('invalid_image', error instanceof Error ? error.message : 'The picture could not be read.')
  }
  const frame = layerModelFrame(source.width, source.height)
  const framePixels = frame.width * frame.height
  const includeBase = opts.includeBase !== false
  const useVision = !opts.elements?.length
  const maxCostUsd = Number.isFinite(opts.maxCostUsd) && opts.maxCostUsd! > 0 ? opts.maxCostUsd! : DEFAULT_MAX_COST_USD

  // Cap the layer count by request and by budget before anything is billed.
  const affordable = layersWithinBudget({ maxCostUsd, includeBase, vision: useVision, framePixels })
  if (affordable < 1) {
    throw fail('budget_exceeded', `This job would cost more than the limit of US$${maxCostUsd.toFixed(2)} for one run.`)
  }
  const maxLayers = Math.min(resolveMaxLayers(opts.maxLayers), affordable)

  const reference = frame.width === source.width && frame.height === source.height
    ? source
    : deps.codec.resize(source, frame.width, frame.height)
  const imageDataUri = `data:image/jpeg;base64,${base64FromBytes(deps.codec.encodeJpeg(reference, 92))}`
  const gatewayOptions = { gateway: { id: 'default', metadata: { feature: 'image-layers', ...(opts.metadata ?? {}) } } }

  let elements: PlannedElement[]
  if (useVision) {
    const callStarted = now()
    let raw: unknown
    try {
      raw = await withTimeout(deps.run(LAYER_VISION_MODEL, {
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: buildVisionPrompt(maxLayers, opts.guidance) },
            { type: 'image_url', image_url: { url: imageDataUri } }
          ]
        }],
        temperature: 0,
        max_tokens: 2000
      }, gatewayOptions), MODEL_CALL_TIMEOUT_MS, 'Finding the elements')
    } catch (error) {
      calls.push({ step: 'vision', model: LAYER_VISION_MODEL, ms: now() - callStarted, costUsd: 0, ok: false })
      throw fail('vision_failed', `Could not find the elements in this picture: ${modelErrorMessage(error)}.`)
    }
    const tokens = visionTokens(raw)
    calls.push({
      step: 'vision',
      model: LAYER_VISION_MODEL,
      ms: now() - callStarted,
      costUsd: roundUsd(tokens ? tokens.input * VISION_INPUT_USD_PER_TOKEN + tokens.output * VISION_OUTPUT_USD_PER_TOKEN : VISION_ESTIMATE_USD),
      ok: true
    })
    elements = parseVisionElements(raw, maxLayers)
    if (!elements.length) {
      throw fail('no_elements', 'No separate elements were found in this picture. Try Lift and paint over the part you want.')
    }
  } else {
    elements = elementsFromHints(opts.elements!, source.width, source.height, maxLayers)
    if (!elements.length) throw fail('no_elements', 'The selected area is empty.')
  }

  // Back to front, with z renumbered 1..n so callers get a dense order.
  elements = elements
    .map((element, index) => ({ element, index }))
    .sort((a, b) => a.element.z - b.element.z || a.index - b.index)
    .map(({ element }, index) => ({ ...element, z: index + 1 }))

  const callCost = seedreamCallCostUsd(framePixels)

  async function runSeedream(step: LayerStep, inputs: Record<string, unknown>, element?: string): Promise<RgbaImage> {
    const callStarted = now()
    let url: string | null = null
    try {
      const raw = await withTimeout(deps.run(SEEDREAM_LAYER_MODEL, inputs, gatewayOptions), MODEL_CALL_TIMEOUT_MS, 'The image model')
      url = seedreamImageUrl(raw)
      if (!url) throw new Error('the image model returned no picture')
    } catch (error) {
      // A request that is refused or returns no picture is not billed.
      calls.push({ step, model: SEEDREAM_LAYER_MODEL, element, ms: now() - callStarted, costUsd: 0, ok: false })
      throw error
    }
    // From here the call is billed, even if the download or decode then fails.
    calls.push({ step, model: SEEDREAM_LAYER_MODEL, element, ms: now() - callStarted, costUsd: callCost, ok: true })
    if (!/^https:\/\//i.test(url)) throw new Error('the image model returned an unexpected address')
    return deps.codec.decode(await fetchBytes(url))
  }

  const extracted = await inBatches(elements, EXTRACT_CONCURRENCY, async (element) => {
    try {
      const output = await runSeedream('extract', buildExtractInputs({ element, imageDataUri, frame, guidance: opts.guidance }), element.name)
      const isolated = isolateLayer(output, element)
      if ('reason' in isolated) {
        skipped.push({ name: element.name, step: 'extract', reason: isolated.reason })
        return null
      }
      const layer: DecomposedLayer = {
        png: deps.codec.encodePng(isolated.image),
        width: isolated.image.width,
        height: isolated.image.height,
        bbox: boxInSource(isolated, source.width, source.height),
        z: element.z,
        name: element.name,
        kind: element.kind
      }
      return layer
    } catch (error) {
      skipped.push({ name: element.name, step: 'extract', reason: modelErrorMessage(error) })
      return null
    }
  })
  const layers = extracted.filter((layer): layer is DecomposedLayer => layer !== null)
  if (!layers.length) {
    const why = skipped[0]?.reason ?? 'no layer could be produced'
    throw fail('extraction_failed', `None of the ${elements.length} element${elements.length === 1 ? '' : 's'} could be cut out: ${why}.`)
  }

  let base: DecomposedBase | null = null
  if (includeBase) {
    // Only remove what was actually lifted, so nothing disappears from both base and layers.
    const lifted = elements.filter(element => layers.some(layer => layer.z === element.z))
    try {
      const output = await runSeedream('base', buildBaseInputs({ elements: lifted, imageDataUri, frame }))
      base = { png: deps.codec.encodePng(output), width: output.width, height: output.height }
    } catch (error) {
      skipped.push({ name: 'Base picture', step: 'base', reason: modelErrorMessage(error) })
    }
  }

  return { width: source.width, height: source.height, base, layers, skipped, usage: usage() }
}
