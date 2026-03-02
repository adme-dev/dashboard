/**
 * AI Smart Auto-Resize for Banner Layers
 * POST /api/agency/banner-studio/ai/auto-resize
 * Body: { layers, srcWidth, srcHeight, tgtWidth, tgtHeight }
 * Returns: { layers: ResizedLayer[] }
 *
 * Uses heuristic layout algorithm + optional AI copy trimming.
 * Handles aspect ratio changes intelligently rather than simple proportional scaling.
 */

import { requireAuth } from '~~/server/utils/auth'
import { edgeGenerate } from '~~/server/utils/edgeAi'

interface LayerInput {
  id: number
  type: string
  name: string
  x: number
  y: number
  w: number
  h: number
  zIndex: number
  opacity: number
  text?: string
  fontSize?: number
  fontWeight?: number
  fontFamily?: string
  color?: string
  textColor?: string
  bgColor?: string
  fillColor?: string
  src?: string
  fit?: string
  borderRadius?: number
  paddingH?: number
  paddingV?: number
  textAlign?: string
  lineHeight?: number
  letterSpacing?: string
  textTransform?: string
  animIn?: string
  animInDur?: number
  startTime?: number
  endTime?: number
  ease?: string
  locked?: boolean
  srcType?: string
  animOut?: string
  animOutDur?: number
  animOutEase?: string
  keyframes?: any[]
  feedBindings?: any[]
  [key: string]: any
}

type LayoutMode = 'proportional' | 'reflow_vertical' | 'reflow_horizontal'

export default defineEventHandler(async (event) => {
  await requireAuth(event)

  const body = await readBody(event)
  const { layers, srcWidth, srcHeight, tgtWidth, tgtHeight } = body as {
    layers: LayerInput[]
    srcWidth: number
    srcHeight: number
    tgtWidth: number
    tgtHeight: number
  }

  if (!layers?.length || !srcWidth || !srcHeight || !tgtWidth || !tgtHeight) {
    throw createError({ statusCode: 400, statusMessage: 'layers, srcWidth, srcHeight, tgtWidth, tgtHeight required' })
  }

  // Classify aspect ratio change
  const srcAr = srcWidth / srcHeight
  const tgtAr = tgtWidth / tgtHeight
  const arDiff = Math.abs(srcAr - tgtAr) / Math.max(srcAr, tgtAr)

  let mode: LayoutMode = 'proportional'
  if (arDiff > 0.4) {
    // Dramatic aspect ratio change — need full reflow
    mode = tgtAr < 1 ? 'reflow_vertical' : 'reflow_horizontal'
  } else if (arDiff > 0.2) {
    // Moderate change — use proportional with adjustments
    mode = 'proportional'
  }

  // Classify layers by role
  const classified = classifyLayers(layers)
  let result: LayerInput[]

  if (mode === 'proportional') {
    result = proportionalResize(layers, srcWidth, srcHeight, tgtWidth, tgtHeight)
  } else {
    result = reflowLayout(classified, tgtWidth, tgtHeight, mode)
  }

  // Optional: AI copy trimming for significantly smaller formats
  const tgtArea = tgtWidth * tgtHeight
  const srcArea = srcWidth * srcHeight
  if (tgtArea < srcArea * 0.4) {
    result = await trimCopyForSmallFormat(event, result, tgtWidth)
  }

  return { layers: result }
})

// ─── Layer Classification ───

interface ClassifiedLayers {
  bg: LayerInput[]
  overlay: LayerInput[]
  brand: LayerInput[]
  headline: LayerInput[]
  subheadline: LayerInput[]
  cta: LayerInput[]
  image: LayerInput[]
  other: LayerInput[]
  all: LayerInput[]
}

function classifyLayers(layers: LayerInput[]): ClassifiedLayers {
  const result: ClassifiedLayers = {
    bg: [], overlay: [], brand: [], headline: [],
    subheadline: [], cta: [], image: [], other: [], all: layers,
  }

  for (const l of layers) {
    const name = (l.name || '').toLowerCase()
    const type = l.type

    if (type === 'bg') {
      result.bg.push(l)
    } else if (type === 'rect' && name.includes('overlay')) {
      result.overlay.push(l)
    } else if (type === 'button' || name.includes('cta') || name.includes('button')) {
      result.cta.push(l)
    } else if (name.includes('brand') || name.includes('logo')) {
      result.brand.push(l)
    } else if (name.includes('headline') && !name.includes('sub')) {
      result.headline.push(l)
    } else if (name.includes('sub') || name.includes('description') || name.includes('body')) {
      result.subheadline.push(l)
    } else if (type === 'image') {
      result.image.push(l)
    } else if (type === 'text') {
      // Unclassified text — classify by font size (larger = headline)
      if (l.fontSize && l.fontSize > 20) {
        result.headline.push(l)
      } else {
        result.subheadline.push(l)
      }
    } else {
      result.other.push(l)
    }
  }

  return result
}

// ─── Proportional Resize (with smart adjustments) ───

function proportionalResize(
  layers: LayerInput[],
  srcW: number, srcH: number,
  tgtW: number, tgtH: number,
): LayerInput[] {
  const sx = tgtW / srcW
  const sy = tgtH / srcH
  const fontScale = Math.min(sx, sy)

  return layers.map((l) => {
    const n: LayerInput = JSON.parse(JSON.stringify(l))

    if (n.type === 'bg') {
      n.x = 0; n.y = 0; n.w = tgtW; n.h = tgtH
    } else if (n.type === 'rect' && (n.name || '').toLowerCase().includes('overlay')) {
      n.x = 0; n.y = 0; n.w = tgtW; n.h = tgtH
    } else {
      n.x = Math.round(l.x * sx)
      n.y = Math.round(l.y * sy)
      n.w = Math.round(l.w * sx)
      n.h = Math.round(l.h * sy)

      // Ensure minimum readable font size
      if (n.fontSize) {
        n.fontSize = Math.max(8, Math.round(n.fontSize * fontScale))
      }

      // Ensure layers stay within bounds
      n.x = Math.max(0, Math.min(n.x, tgtW - Math.min(n.w, tgtW)))
      n.y = Math.max(0, Math.min(n.y, tgtH - Math.min(n.h, tgtH)))
      n.w = Math.min(n.w, tgtW)
      n.h = Math.min(n.h, tgtH)
    }

    return n
  })
}

// ─── Reflow Layout (for dramatic aspect ratio changes) ───

function reflowLayout(
  classified: ClassifiedLayers,
  tgtW: number, tgtH: number,
  mode: 'reflow_vertical' | 'reflow_horizontal',
): LayerInput[] {
  const result: LayerInput[] = []
  const pad = Math.round(tgtW * 0.05)
  const contentW = tgtW - pad * 2

  // 1. Background — always fills
  for (const bg of classified.bg) {
    result.push({
      ...JSON.parse(JSON.stringify(bg)),
      x: 0, y: 0, w: tgtW, h: tgtH,
    })
  }

  // 2. Overlay — always fills
  for (const ov of classified.overlay) {
    result.push({
      ...JSON.parse(JSON.stringify(ov)),
      x: 0, y: 0, w: tgtW, h: tgtH,
    })
  }

  // 3. Content layers — flow vertically or horizontally
  let cursor = Math.round(tgtH * 0.06) // Start position

  // Brand text (small, at top)
  for (const brand of classified.brand) {
    const n: LayerInput = JSON.parse(JSON.stringify(brand))
    const fontSize = Math.max(8, Math.round(tgtW * 0.03))
    n.x = pad
    n.y = cursor
    n.w = contentW
    n.h = Math.round(fontSize * 1.5)
    n.fontSize = fontSize
    result.push(n)
    cursor += n.h + Math.round(pad * 0.5)
  }

  // Images (in vertical mode, place before headline; horizontal, place to the side)
  if (mode === 'reflow_vertical') {
    for (const img of classified.image) {
      const n: LayerInput = JSON.parse(JSON.stringify(img))
      const imgH = Math.round(tgtH * 0.25)
      n.x = pad
      n.y = cursor
      n.w = contentW
      n.h = imgH
      result.push(n)
      cursor += imgH + pad
    }
  }

  // Headline
  for (const hl of classified.headline) {
    const n: LayerInput = JSON.parse(JSON.stringify(hl))
    // Size headline relative to target width
    const fontSize = Math.max(16, Math.round(tgtW * 0.09))
    const lineH = (n.lineHeight || 0.95)
    const estimatedLines = Math.ceil(((n.text || '').length * fontSize * 0.55) / contentW)
    const blockH = Math.round(fontSize * lineH * Math.max(1, estimatedLines) * 1.2)

    n.x = pad
    n.y = cursor
    n.w = contentW
    n.h = blockH
    n.fontSize = fontSize
    result.push(n)
    cursor += blockH + Math.round(pad * 0.5)
  }

  // Subheadline
  for (const sub of classified.subheadline) {
    const n: LayerInput = JSON.parse(JSON.stringify(sub))
    const fontSize = Math.max(10, Math.round(tgtW * 0.04))
    const estimatedLines = Math.ceil(((n.text || '').length * fontSize * 0.5) / contentW)
    const blockH = Math.round(fontSize * 1.4 * Math.max(1, estimatedLines) * 1.1)

    n.x = pad
    n.y = cursor
    n.w = Math.round(contentW * 0.85)
    n.h = blockH
    n.fontSize = fontSize
    result.push(n)
    cursor += blockH + pad
  }

  // Horizontal mode: place images to the right of text
  if (mode === 'reflow_horizontal') {
    for (const img of classified.image) {
      const n: LayerInput = JSON.parse(JSON.stringify(img))
      n.x = Math.round(tgtW * 0.55)
      n.y = Math.round(tgtH * 0.1)
      n.w = Math.round(tgtW * 0.4)
      n.h = Math.round(tgtH * 0.6)
      result.push(n)
    }
  }

  // CTA button (anchored near bottom)
  for (const cta of classified.cta) {
    const n: LayerInput = JSON.parse(JSON.stringify(cta))
    const fontSize = Math.max(10, Math.round(tgtW * 0.04))
    const btnH = Math.max(28, Math.round(fontSize * 2.5))
    const btnW = Math.round(Math.min(contentW * 0.55, Math.max(80, (n.text || '').length * fontSize * 0.65 + 30)))

    // Place at bottom with breathing room, but ensure it doesn't overlap content
    const ctaY = Math.max(cursor + pad, Math.round(tgtH * 0.78))
    n.x = pad
    n.y = ctaY
    n.w = btnW
    n.h = btnH
    n.fontSize = fontSize
    result.push(n)
  }

  // Other layers — proportional fallback
  for (const other of classified.other) {
    const n: LayerInput = JSON.parse(JSON.stringify(other))
    // Place in remaining space
    n.x = Math.round((n.x / (n.w || 1)) * tgtW * 0.8)
    n.y = Math.round((n.y / (n.h || 1)) * tgtH * 0.8)
    n.w = Math.round(tgtW * 0.3)
    n.h = Math.round(tgtH * 0.1)
    result.push(n)
  }

  return result
}

// ─── AI Copy Trimming ───

async function trimCopyForSmallFormat(
  event: any,
  layers: LayerInput[],
  tgtWidth: number,
): Promise<LayerInput[]> {
  // Only trim text layers with long content
  const textLayers = layers.filter(l =>
    (l.type === 'text' || l.type === 'button') && l.text && l.text.length > 15
  )

  if (textLayers.length === 0) return layers

  const textItems = textLayers.map(l => `${l.name}: "${l.text}"`).join('\n')
  const maxChars = tgtWidth < 400 ? 25 : 50

  const prompt = `Shorten these banner ad texts to fit a small ${tgtWidth}px wide banner. Max ~${maxChars} chars each. Keep the meaning.

${textItems}

Return ONLY valid JSON: {"results":[{"name":"...","text":"shortened text"},...]}`

  try {
    const aiResult = await edgeGenerate(event, prompt, {
      systemPrompt: 'You are an ad copywriter. Return only valid JSON, no markdown.',
      maxTokens: 200,
      temperature: 0.3,
    })

    if (aiResult) {
      const match = aiResult.match(/\{[\s\S]*\}/)
      if (match) {
        const parsed = JSON.parse(match[0])
        if (parsed.results && Array.isArray(parsed.results)) {
          const trimMap = new Map<string, string>()
          for (const r of parsed.results) {
            if (r.name && r.text) trimMap.set(r.name, r.text)
          }

          return layers.map(l => {
            const trimmed = trimMap.get(l.name)
            if (trimmed && l.text) {
              return { ...l, text: trimmed }
            }
            return l
          })
        }
      }
    }
  } catch {
    // AI unavailable — return layers as-is
  }

  return layers
}
