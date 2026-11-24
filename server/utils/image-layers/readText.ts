// Reads the words and the look of the lettering in separated layers, so an editor can
// rebuild them as live text. One vision call covers every element.
//
// Pure, like decompose.ts: no bindings, codecs or storage, relative imports only.
import { LAYER_VISION_MODEL, type LayerBox, type RgbaImage } from './decompose'

export type LayerFontCategory = 'sans' | 'serif' | 'slab' | 'script' | 'display' | 'mono'

export interface LayerTextRead {
  /** The words, with a line break where the picture breaks the line. */
  text: string
  lines: number
  /** The typeface the model thinks it is, when it could name one. */
  fontGuess: string | null
  fontCategory: LayerFontCategory
  /** 100 to 900. */
  fontWeight: number
  italic: boolean
  /** True when the lettering is set in capitals. `text` keeps the capitals as drawn. */
  uppercase: boolean
  align: 'left' | 'center' | 'right'
  /** #rrggbb, from the model. `dominantInkColor` on the layer's own pixels is more exact. */
  color: string | null
  letterSpacing: 'tight' | 'normal' | 'wide'
}

export interface LayerTextElement {
  /** The caller's own handle for the element; echoed back in the result. */
  id: number
  name: string
  kind: string
  bbox: LayerBox
}

export interface LayerTextResult {
  /** Only elements that are lettering and nothing else. */
  texts: Map<number, LayerTextRead>
  /** The model call that was made, or null when there was nothing to read. */
  call: { step: 'text', model: string, ms: number, costUsd: number, ok: boolean } | null
  /** Why no text came back, when the call failed. Written for the person who ran the job. */
  error: string | null
}

// Same published prices and budget figure as the element-finding call in decompose.ts.
const VISION_INPUT_USD_PER_TOKEN = 0.75 / 1_000_000
const VISION_OUTPUT_USD_PER_TOKEN = 3.75 / 1_000_000
export const TEXT_READ_ESTIMATE_USD = 0.005
const TEXT_READ_TIMEOUT_MS = 60_000

const CATEGORIES: LayerFontCategory[] = ['sans', 'serif', 'slab', 'script', 'display', 'mono']

/** Logos are never rebuilt as text: a wordmark set in a lookalike font is a wrong logo. */
export function isTextCandidate(kind: string): boolean {
  return kind.trim().toLowerCase() !== 'logo'
}

export function buildTextReadPrompt(elements: LayerTextElement[], size: { width: number, height: number }): string {
  const rows = elements.map((element) => {
    const { x, y, width, height } = element.bbox
    const box = [y / size.height, x / size.width, (y + height) / size.height, (x + width) / size.width]
      .map(value => Math.round(Math.min(1, Math.max(0, value)) * 1000))
    return `- id ${element.id}: "${element.name}" (${element.kind}), box_2d [${box.join(', ')}]`
  })
  return [
    'These elements were found in the picture. Each box_2d is [ymin, xmin, ymax, xmax] on a 0-1000 scale.',
    ...rows,
    '',
    'For each element, say whether it is lettering and nothing else. A button, badge, sticker, product, photo or logo that contains words is NOT lettering only.',
    'For lettering-only elements, read the words exactly as drawn: same capitals, punctuation and symbols, with "\\n" where the line breaks in the picture.',
    'Reply with JSON only: {"elements":[{"id":1,"text_only":true,"text":"LINE ONE\\nLINE TWO","font_guess":"Montserrat","font_category":"sans|serif|slab|script|display|mono","font_weight":700,"italic":false,"uppercase":true,"align":"left|center|right","color":"#rrggbb","letter_spacing":"tight|normal|wide"}]}',
    'Use text_only false and leave the other fields out for anything that is not lettering only. font_guess is the closest well-known typeface, or null if unsure.'
  ].join('\n')
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

function modelText(raw: unknown): string | null {
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

function modelTokens(raw: unknown): { input: number, output: number } | null {
  const usage = (raw as any)?.usage ?? (raw as any)?.result?.usage
  const input = Number(usage?.prompt_tokens)
  const total = Number(usage?.total_tokens)
  if (!Number.isFinite(input) || !Number.isFinite(total)) return null
  return { input, output: Math.max(0, total - input) }
}

function normaliseHex(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim())
  if (!match) return null
  const hex = match[1]!.toLowerCase()
  return `#${hex.length === 3 ? [...hex].map(c => c + c).join('') : hex}`
}

/** Reads the model's reply. Entries for unknown ids, non-text elements and empty text are dropped. */
export function parseTextRead(raw: unknown, knownIds: Iterable<number>): Map<number, LayerTextRead> {
  const known = new Set(knownIds)
  const text = modelText(raw)
  const parsed = text ? jsonFromModelText(text) : raw
  const list = Array.isArray(parsed) ? parsed : (parsed as any)?.elements
  const texts = new Map<number, LayerTextRead>()
  if (!Array.isArray(list)) return texts
  for (const item of list) {
    if (!item || typeof item !== 'object') continue
    const entry = item as Record<string, unknown>
    const id = Number(entry.id)
    if (!known.has(id) || texts.has(id)) continue
    if (entry.text_only !== true) continue
    const words = typeof entry.text === 'string'
      ? entry.text.replace(/\r\n?/g, '\n').split('\n').map(line => line.trim()).filter(Boolean).join('\n').slice(0, 600)
      : ''
    if (!words) continue
    const category = String(entry.font_category ?? '').toLowerCase() as LayerFontCategory
    const weight = Number(entry.font_weight)
    const align = String(entry.align ?? '').toLowerCase()
    const spacing = String(entry.letter_spacing ?? '').toLowerCase()
    const guess = typeof entry.font_guess === 'string' ? entry.font_guess.trim().slice(0, 60) : ''
    texts.set(id, {
      text: words,
      lines: words.split('\n').length,
      fontGuess: guess && !/^(null|unknown|none|n\/a)$/i.test(guess) ? guess : null,
      fontCategory: CATEGORIES.includes(category) ? category : 'sans',
      fontWeight: Number.isFinite(weight) ? Math.min(900, Math.max(100, Math.round(weight / 100) * 100)) : 400,
      italic: entry.italic === true,
      uppercase: entry.uppercase === true || (words === words.toUpperCase() && words !== words.toLowerCase()),
      align: align === 'center' || align === 'right' ? align : 'left',
      color: normaliseHex(entry.color),
      letterSpacing: spacing === 'tight' || spacing === 'wide' ? spacing : 'normal'
    })
  }
  return texts
}

/**
 * The colour of the lettering in a cut-out layer: the most common colour among its
 * solid pixels. Null when the layer has no solid pixels.
 */
export function dominantInkColor(image: RgbaImage): string | null {
  const buckets = new Map<number, { count: number, r: number, g: number, b: number }>()
  const { data } = image
  for (let offset = 0; offset + 3 < data.length; offset += 4) {
    // Soft edge pixels are a blend with whatever was behind, so only solid ones count.
    if (data[offset + 3]! < 200) continue
    const r = data[offset]!
    const g = data[offset + 1]!
    const b = data[offset + 2]!
    const key = (r >> 4 << 8) | (g >> 4 << 4) | (b >> 4)
    const bucket = buckets.get(key)
    if (bucket) {
      bucket.count += 1
      bucket.r += r
      bucket.g += g
      bucket.b += b
    } else {
      buckets.set(key, { count: 1, r, g, b })
    }
  }
  let best: { count: number, r: number, g: number, b: number } | null = null
  for (const bucket of buckets.values()) if (!best || bucket.count > best.count) best = bucket
  if (!best) return null
  const hex = (sum: number) => Math.round(sum / best!.count).toString(16).padStart(2, '0')
  return `#${hex(best.r)}${hex(best.g)}${hex(best.b)}`
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Reading the text took longer than ${Math.round(ms / 1000)} seconds`)), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer)) as Promise<T>
}

/**
 * One vision call that reads every lettering-only element. Never throws and never
 * retries: a failed read costs the import its live text, not its layers.
 */
export async function readLayerTexts(
  input: {
    /** The source picture as a data URI. */
    imageDataUri: string
    size: { width: number, height: number }
    elements: LayerTextElement[]
    metadata?: Record<string, string>
  },
  deps: { run: (model: string, inputs: Record<string, unknown>, options?: Record<string, unknown>) => Promise<unknown>, now?: () => number }
): Promise<LayerTextResult> {
  const now = deps.now ?? (() => Date.now())
  const candidates = input.elements.filter(element => isTextCandidate(element.kind))
  if (!candidates.length) {
    return { texts: new Map(), call: null, error: null }
  }
  const started = now()
  try {
    const raw = await withTimeout(deps.run(LAYER_VISION_MODEL, {
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: buildTextReadPrompt(candidates, input.size) },
          { type: 'image_url', image_url: { url: input.imageDataUri } }
        ]
      }],
      temperature: 0,
      max_tokens: 2000
    }, { gateway: { id: 'default', metadata: { feature: 'image-layers-text', ...(input.metadata ?? {}) } } }), TEXT_READ_TIMEOUT_MS)
    const tokens = modelTokens(raw)
    const costUsd = tokens
      ? Math.round((tokens.input * VISION_INPUT_USD_PER_TOKEN + tokens.output * VISION_OUTPUT_USD_PER_TOKEN) * 100_000) / 100_000
      : TEXT_READ_ESTIMATE_USD
    return {
      texts: parseTextRead(raw, candidates.map(element => element.id)),
      call: { step: 'text', model: LAYER_VISION_MODEL, ms: now() - started, costUsd, ok: true },
      error: null
    }
  } catch (error) {
    const message = error instanceof Error && error.message ? error.message : 'the vision model did not answer'
    return {
      texts: new Map(),
      call: { step: 'text', model: LAYER_VISION_MODEL, ms: now() - started, costUsd: 0, ok: false },
      error: `The words could not be read: ${message}.`
    }
  }
}
