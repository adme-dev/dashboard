// "Import image as layers": turns what the Separate layers job returned into Banner
// Studio layers. Everything here is pure so the placement can be tested without a canvas.
import type { BrandKitFont, Layer } from '~/types/banner-studio'
import type {
  BannerLayerImportBox,
  BannerLayerImportResult,
  BannerLayerImportStatus,
  BannerLayerImportText
} from '~~/shared/bannerLayerImport'
import { LAYER_IMPORT_TYPICAL_SECONDS } from '~~/shared/bannerLayerImport'

export interface CanvasFit {
  /** Canvas pixels per source pixel. */
  scale: number
  offsetX: number
  offsetY: number
  /** The source picture's footprint on the canvas. */
  width: number
  height: number
}

/**
 * How the source picture sits on a canvas. `contain` shows the whole picture and
 * centres it; `cover` fills the canvas and lets the long side overflow.
 */
export function fitSourceToCanvas(
  source: { width: number, height: number },
  canvas: { w: number, h: number },
  mode: 'contain' | 'cover' = 'contain'
): CanvasFit {
  if (!(source.width > 0) || !(source.height > 0) || !(canvas.w > 0) || !(canvas.h > 0)) {
    throw new Error('The picture or the canvas has no size.')
  }
  const ratios = [canvas.w / source.width, canvas.h / source.height]
  const scale = mode === 'cover' ? Math.max(...ratios) : Math.min(...ratios)
  const width = source.width * scale
  const height = source.height * scale
  return { scale, offsetX: (canvas.w - width) / 2, offsetY: (canvas.h - height) / 2, width, height }
}

const px = (value: number) => Math.round(value * 10) / 10

/** A box in source pixels, as a layer frame on the canvas. Never thinner than one pixel. */
export function mapBoxToCanvas(bbox: BannerLayerImportBox, fit: CanvasFit): { x: number, y: number, w: number, h: number } {
  return {
    x: px(fit.offsetX + bbox.x * fit.scale),
    y: px(fit.offsetY + bbox.y * fit.scale),
    w: Math.max(1, px(bbox.width * fit.scale)),
    h: Math.max(1, px(bbox.height * fit.scale))
  }
}

// ── Fonts ─────────────────────────────

export interface ImportFontOption {
  family: string
  category: string
  weights: number[]
}

export interface ImportFontChoice {
  fontFamily: string
  fontWeight: number
  fontAssetId?: string
  /** Why this font: named by the model, the client's brand font, or the nearest style. */
  matchedBy: 'named' | 'brand' | 'style'
}

const CATEGORY_TO_CATALOGUE: Record<BannerLayerImportText['fontCategory'], string> = {
  sans: 'sans-serif', serif: 'serif', slab: 'serif', script: 'handwriting', display: 'display', mono: 'monospace'
}

// The stand-in for each style when neither the named font nor a brand font fits.
const STYLE_DEFAULTS: Record<BannerLayerImportText['fontCategory'], string[]> = {
  sans: ['Inter', 'Arial'],
  serif: ['Playfair Display', 'Georgia'],
  slab: ['Bitter', 'Georgia'],
  script: ['Dancing Script', 'Georgia'],
  display: ['Anton', 'Impact'],
  mono: ['Roboto Mono', 'Courier New']
}

function nearestWeight(weights: number[], wanted: number): number {
  if (!weights.length) return wanted
  // Between two equally near weights the heavier one reads closer to bold display lettering.
  return weights.reduce((best, weight) => {
    const gap = Math.abs(weight - wanted) - Math.abs(best - wanted)
    return gap < 0 || (gap === 0 && weight > best) ? weight : best
  })
}

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

/**
 * The closest font Banner Studio can actually set the words in. A font the model
 * named wins when it is available; otherwise the client's brand font when it is the
 * same kind of face; otherwise a stand-in of the same style.
 */
export function matchImportFont(
  text: Pick<BannerLayerImportText, 'fontGuess' | 'fontCategory' | 'fontWeight'>,
  options: { brandFonts?: BrandKitFont[], catalogue?: ImportFontOption[], headline?: boolean }
): ImportFontChoice {
  const brandFonts = options.brandFonts ?? []
  const catalogue = options.catalogue ?? []
  const fromBrand = (font: BrandKitFont, matchedBy: ImportFontChoice['matchedBy']): ImportFontChoice => {
    const weights = font.assets?.length ? font.assets.map(asset => asset.weight) : font.weights
    const fontWeight = nearestWeight(weights, text.fontWeight)
    return { fontFamily: font.family, fontWeight, fontAssetId: font.assets?.find(asset => asset.weight === fontWeight)?.id, matchedBy }
  }
  const fromCatalogue = (font: ImportFontOption, matchedBy: ImportFontChoice['matchedBy']): ImportFontChoice =>
    ({ fontFamily: font.family, fontWeight: nearestWeight(font.weights, text.fontWeight), matchedBy })

  if (text.fontGuess) {
    const brand = brandFonts.find(font => sameName(font.family, text.fontGuess!))
    if (brand) return fromBrand(brand, 'named')
    const listed = catalogue.find(font => sameName(font.family, text.fontGuess!))
    if (listed) return fromCatalogue(listed, 'named')
  }

  const wanted = CATEGORY_TO_CATALOGUE[text.fontCategory]
  const role = options.headline ? 'heading' : 'body'
  const brand = brandFonts.find(font => font.role === role) ?? brandFonts.find(font => font.role === 'heading' || font.role === 'body') ?? brandFonts[0]
  if (brand) {
    const known = catalogue.find(font => sameName(font.family, brand.family))?.category
    // An uploaded brand face has no listed style; trust it for plain lettering only.
    const fits = known && known !== 'custom' ? known === wanted : text.fontCategory === 'sans' || text.fontCategory === 'serif' || text.fontCategory === 'display'
    if (fits) return fromBrand(brand, 'brand')
  }

  for (const family of STYLE_DEFAULTS[text.fontCategory]) {
    const listed = catalogue.find(font => sameName(font.family, family))
    if (listed) return fromCatalogue(listed, 'style')
  }
  const sameStyle = catalogue.find(font => font.category === wanted)
  if (sameStyle) return fromCatalogue(sameStyle, 'style')
  return { fontFamily: STYLE_DEFAULTS[text.fontCategory][0]!, fontWeight: text.fontWeight, matchedBy: 'style' }
}

// ── Text ──────────────────────────────

/** Width of one line at a font size, in pixels. The editor supplies a canvas-backed one. */
export type MeasureLine = (line: string, font: { fontFamily: string, fontWeight: number, fontSize: number, italic: boolean }) => number | null

const LETTER_SPACING_EM = { tight: -0.02, normal: 0, wide: 0.08 } as const
// Cap height and descender depth of a typical face, as a share of the font size.
const CAP_HEIGHT_EM = 0.72
const DESCENDER_EM = 0.21
// How far the top of a capital sits below the top of its line box, before leading.
const CAP_TOP_EM = 0.18

export interface ImportTextMetrics {
  fontSize: number
  lineHeight: number
  letterSpacing: string
  /** The text frame on the canvas, roomy enough that no line wraps. */
  frame: { x: number, y: number, w: number, h: number }
}

/**
 * Sizes live text to cover the lettering's box. The height of the box gives a first
 * size; when the line can be measured in the chosen font, the size is nudged so the
 * widest line is as wide as the original, within a quarter either way.
 */
export function importTextMetrics(
  text: Pick<BannerLayerImportText, 'text' | 'align' | 'letterSpacing'>,
  box: { x: number, y: number, w: number, h: number },
  font: { fontFamily: string, fontWeight: number, italic: boolean },
  measure?: MeasureLine
): ImportTextMetrics {
  const lines = text.text.split('\n').filter(line => line.trim())
  const count = Math.max(1, lines.length)
  const lineHeight = count > 1 ? 1.15 : 1.1
  const hasDescender = /[gjpqy,;]/.test(text.text) && text.text !== text.text.toUpperCase()
  const inkEm = (count - 1) * lineHeight + CAP_HEIGHT_EM + (hasDescender ? DESCENDER_EM : 0)
  const byHeight = box.h / inkEm
  const spacingEm = LETTER_SPACING_EM[text.letterSpacing] ?? 0

  let fontSize = byHeight
  if (measure) {
    const reference = 100
    const widest = Math.max(0, ...lines.map((line) => {
      const width = measure(line, { ...font, fontSize: reference })
      return width == null ? 0 : width + Math.max(0, [...line].length - 1) * spacingEm * reference
    }))
    if (widest > 0) {
      const byWidth = reference * box.w / widest
      fontSize = Math.min(byHeight * 1.25, Math.max(byHeight * 0.75, byWidth))
    }
  }
  fontSize = Math.max(4, Math.round(fontSize * 10) / 10)

  // Slack on the width so the widest line never wraps in a slightly wider fallback face.
  const slack = Math.max(4, box.w * 0.08)
  const w = box.w + slack
  const x = text.align === 'center' ? box.x - slack / 2 : text.align === 'right' ? box.x - slack : box.x
  const y = box.y - fontSize * ((lineHeight - 1) / 2 + CAP_TOP_EM)
  return {
    fontSize,
    lineHeight,
    letterSpacing: spacingEm ? `${spacingEm}em` : '0',
    frame: { x: px(x), y: px(y), w: px(w), h: px(count * lineHeight * fontSize + fontSize * 0.1) }
  }
}

// ── Layers ────────────────────────────

export interface BuildImportOptions {
  jobId: string
  /** Shown as the group's name in the timeline. */
  groupName: string
  groupId: string
  fit?: 'contain' | 'cover'
  brandFonts?: BrandKitFont[]
  catalogue?: ImportFontOption[]
  measure?: MeasureLine
}

export interface BuiltImport {
  /** Back to front. The caller assigns ids and stacking numbers in this order. */
  layers: Partial<Layer>[]
  /** How many elements became live text. */
  textCount: number
  /** How many elements are logos that still need the real file. */
  logoCount: number
}

const isLogoKind = (kind: string) => kind.trim().toLowerCase() === 'logo'

/**
 * The layers for one import, back to front: the background, then each element at its
 * place. Lettering becomes live text with the cut-out kept hidden directly beneath it.
 */
export function buildImportedLayers(result: BannerLayerImportResult, format: { w: number, h: number }, options: BuildImportOptions): BuiltImport {
  const fit = fitSourceToCanvas(result, format, options.fit)
  const timelineGroup = { id: options.groupId, name: options.groupName }
  const shared = { timelineGroup, animIn: 'none', animOut: 'none', opacity: 1 } as const
  const layers: Partial<Layer>[] = []
  let textCount = 0
  let logoCount = 0

  if (result.base) {
    layers.push({
      ...shared,
      type: 'image',
      name: 'Background',
      src: result.base.url,
      fit: 'fill',
      ...mapBoxToCanvas({ x: 0, y: 0, width: result.width, height: result.height }, fit),
      importedFrom: { jobId: options.jobId, role: 'base' }
    })
  }

  const elements = [...result.layers].sort((a, b) => a.z - b.z)
  // The largest lettering is the headline, which decides between the brand's heading and body fonts.
  const headline = elements.filter(element => element.text).reduce<typeof elements[number] | null>(
    (best, element) => (!best || element.bbox.height / element.text!.lines > best.bbox.height / best.text!.lines ? element : best), null)

  for (const element of elements) {
    const frame = mapBoxToCanvas(element.bbox, fit)
    const logo = isLogoKind(element.kind)
    const picture: Partial<Layer> = {
      ...shared,
      type: 'image',
      name: element.name,
      src: element.url,
      fit: 'fill',
      ...frame,
      importedFrom: { jobId: options.jobId, role: 'element', kind: element.kind }
    }
    if (logo) {
      logoCount += 1
      Object.assign(picture, { isLogo: true, fit: 'contain', importedFrom: { jobId: options.jobId, role: 'element', kind: element.kind, logoPlaceholder: true } })
    }
    if (!element.text || logo) {
      layers.push(picture)
      continue
    }

    // Live text sits directly above its own cut-out, which stays hidden for comparison.
    const read = element.text
    const font = matchImportFont(read, { brandFonts: options.brandFonts, catalogue: options.catalogue, headline: element === headline })
    const metrics = importTextMetrics(read, frame, { fontFamily: font.fontFamily, fontWeight: font.fontWeight, italic: read.italic }, options.measure)
    layers.push({
      ...picture,
      name: `${element.name} (original picture)`,
      hidden: true,
      importedFrom: { jobId: options.jobId, role: 'text-source', kind: element.kind }
    })
    layers.push({
      ...shared,
      type: 'text',
      name: element.name,
      text: read.text,
      fontFamily: font.fontFamily,
      fontWeight: font.fontWeight,
      ...(font.fontAssetId ? { fontAssetId: font.fontAssetId } : {}),
      fontSize: metrics.fontSize,
      fontStyle: read.italic ? 'italic' : 'normal',
      color: read.color || '#ffffff',
      textTransform: 'none',
      letterSpacing: metrics.letterSpacing,
      lineHeight: metrics.lineHeight,
      textAlign: read.align,
      ...metrics.frame,
      importedFrom: { jobId: options.jobId, role: 'text', kind: element.kind }
    })
    textCount += 1
  }
  return { layers, textCount, logoCount }
}

// ── Job status ────────────────────────

export interface LayerImportView {
  phase: 'waiting' | 'working' | 'done' | 'partial' | 'failed'
  title: string
  detail: string
  /** 0 to 100 while working; an estimate from the usual run time, not a measurement. */
  progress: number | null
}

/** What to tell the person watching an import, from the job's state and how long it has run. */
export function layerImportView(status: Pick<BannerLayerImportStatus, 'status' | 'error' | 'result'> | null, elapsedMs: number): LayerImportView {
  const seconds = Math.max(0, Math.round(elapsedMs / 1000))
  if (!status || status.status === 'queued') {
    return {
      phase: 'waiting',
      title: 'Waiting to start',
      detail: seconds > 45 ? 'Still in the queue. This can take a minute when other jobs are running.' : 'The import is queued.',
      progress: 2
    }
  }
  if (status.status === 'running') {
    const overdue = seconds > LAYER_IMPORT_TYPICAL_SECONDS * 2
    return {
      phase: 'working',
      title: 'Separating the picture',
      detail: overdue
        ? 'Taking longer than usual. It will finish or stop by itself; nothing is charged twice.'
        : 'Finding the elements, cutting each one out and rebuilding the background.',
      // Approaches but never reaches 100 until the job says it is done.
      progress: Math.min(95, Math.round(5 + 90 * (1 - Math.exp(-seconds / LAYER_IMPORT_TYPICAL_SECONDS))))
    }
  }
  if (status.status === 'failed') {
    return { phase: 'failed', title: 'The import failed', detail: status.error || 'Nothing was added to the canvas.', progress: null }
  }
  const result = status.result
  if (!result || (!result.layers.length && !result.base)) {
    return { phase: 'failed', title: 'Nothing came back', detail: 'The job finished without any layers. Nothing was added to the canvas.', progress: null }
  }
  const count = `${result.layers.length} element${result.layers.length === 1 ? '' : 's'}${result.base ? ' and the background' : ''}`
  if (result.skipped.length || !result.base) {
    return { phase: 'partial', title: 'Imported, with gaps', detail: `${count} came back. Some parts did not; they are listed below.`, progress: 100 }
  }
  return { phase: 'done', title: 'Imported', detail: `${count} came back.`, progress: 100 }
}

export function formatUsd(value: number): string {
  return `US$${value.toFixed(2)}`
}
