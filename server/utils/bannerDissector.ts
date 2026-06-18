import type { H3Event } from 'h3'
import { randomUUID } from 'crypto'
import type {
  DissectorManifest,
  DissectorLayer,
  DissectorLayerType,
  DesignToken,
  TokenType,
} from '~/types/banner-studio'

/**
 * Banner Dissector — AI-powered banner analysis and layer segmentation.
 *
 * Vision chain: Gemini 2.5 Flash (primary) → Workers AI → Groq Scout → fallback manifest
 * Pixel extraction: Gemini segmentation masks → crop + RMBG fallback
 */

// ── Workers AI access ──

function getAI(event: H3Event | null): any | null {
  if (!event) return null
  try {
    return (event.context as any).cloudflare?.env?.AI ?? null
  } catch {
    return null
  }
}

// ── Vision prompt (per v2 spec) ──

function buildVisionPrompt(brand?: string): string {
  const brandHint = brand ? `This banner is for the brand "${brand}".` : ''
  return `Analyse this banner image and identify all visual layers. ${brandHint}

Classify each layer as one of: graphic_text | live_text | vehicle | logo | background

Rules:
- "background" = the full background plate (gradient, photo, solid color)
- "vehicle" = product images (cars, phones, shoes, etc.)
- "logo" = brand logos, icons, brand lockups
- "graphic_text" = text that is part of the design/image and NOT editable (headlines baked into graphics)
- "live_text" = text that changes per campaign (prices, model names, CTAs, dates)

For each layer provide:
- type: one of the above
- description: what the layer shows
- region: bounding box as {x, y, width, height} with values from 0 to 1 (normalised coordinates)
- editable: true if it changes per campaign, false if brand-locked
- font_notes: for text layers, describe font style

Also extract ALL editable text values as editable_fields with type being one of: price, model_name, price_label, brand, cta_label, campaign_label, disclaimer.

You MUST return valid JSON with this exact structure:
{"brand":"detected brand","campaign_type":"offer","layers":[{"type":"background","description":"...","region":{"x":0,"y":0,"width":1,"height":1},"editable":false}],"editable_fields":[{"type":"price","value":"$29,990","label":"Price"}]}`
}

// ── Z-index ordering by layer type ──

const Z_ORDER: Record<DissectorLayerType, number> = {
  background: 0,
  vehicle: 1,
  graphic_text: 2,
  live_text: 3,
  logo: 4,
}

// ── Vision model implementations ──

async function analyzeWithWorkersAI(
  ai: any,
  imageBase64: string,
  brand?: string
): Promise<any | null> {
  try {
    const prompt = buildVisionPrompt(brand)
    const result = await ai.run('@cf/llava-hf/llava-1.5-7b-hf', {
      image: Array.from(Buffer.from(imageBase64, 'base64')),
      prompt,
      max_tokens: 1024,
      temperature: 0.2,
    })
    return parseAIResponse(result?.description || result?.response || '', true)
  } catch (err) {
    console.warn('[Dissector] Workers AI vision failed:', err)
    return null
  }
}

async function analyzeWithGemini(
  apiKey: string,
  imageBase64: string,
  mimeType: string,
  brand?: string
): Promise<any | null> {
  // Try gemini-2.5-flash first, fall back to 2.0-flash
  const models = ['gemini-2.5-flash', 'gemini-2.0-flash']

  for (const model of models) {
    try {
      const prompt = buildVisionPrompt(brand)
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [
                { text: prompt },
                { inline_data: { mime_type: mimeType, data: imageBase64 } },
              ],
            }],
            generationConfig: {
              response_mime_type: 'application/json',
              max_output_tokens: 4096,
              temperature: 0.2,
            },
          }),
        }
      )

      if (!response.ok) {
        const errText = await response.text()
        console.warn(`[Dissector] Gemini ${model} returned ${response.status}: ${errText.substring(0, 200)}`)
        continue
      }

      const data = await response.json()
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
      if (!text) continue

      console.log(`[Dissector] Gemini ${model} response: ${text.length} chars`)
      const parsed = parseAIResponse(text)
      if (parsed) {
        console.log(`[Dissector] Gemini ${model}: ${parsed.layers?.length || 0} layers, ${parsed.editable_fields?.length || 0} fields`)
        return parsed
      }
    } catch (err) {
      console.warn(`[Dissector] Gemini ${model} failed:`, err)
    }
  }

  return null
}

async function analyzeWithGroq(
  apiKey: string,
  imageBase64: string,
  brand?: string
): Promise<any | null> {
  try {
    const model = 'meta-llama/llama-4-scout-17b-16e-instruct'
    console.log(`[Dissector] Trying Groq model: ${model}`)

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: buildVisionPrompt(brand) },
            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${imageBase64}` } },
          ],
        }],
        max_tokens: 2048,
        temperature: 0.2,
        response_format: { type: 'json_object' },
      }),
    })

    if (!response.ok) {
      console.warn(`[Dissector] Groq ${model} returned ${response.status}: ${await response.text()}`)
      return null
    }

    const data = await response.json()
    const content = data.choices?.[0]?.message?.content || ''
    console.log(`[Dissector] Groq ${model} response length: ${content.length} chars`)

    if (!content) return null

    const parsed = parseAIResponse(content)
    if (parsed) {
      console.log(`[Dissector] Groq: ${parsed.layers?.length || 0} layers, ${parsed.editable_fields?.length || 0} fields`)
    }
    return parsed
  } catch (err) {
    console.warn('[Dissector] Groq vision failed:', err)
    return null
  }
}

// ── Gemini segmentation masks ──

/**
 * Get segmentation masks from Gemini 2.5 Flash.
 * Returns masks keyed by layer ID, plus refined bounding boxes from Gemini's detection.
 */
async function getGeminiSegmentationMasks(
  apiKey: string,
  imageBase64: string,
  mimeType: string,
  analysisLayers: any[]
): Promise<{ masks: Map<string, string>; refinedRegions: Map<string, { x: number; y: number; width: number; height: number }> }> {
  const masks = new Map<string, string>()
  const refinedRegions = new Map<string, { x: number; y: number; width: number; height: number }>()

  try {
    const segPrompt = `Output a JSON list of segmentation masks for every visual element in this banner advertisement image. Each element should be a separate entry. Include backgrounds, text, logos, product images, and buttons. Each entry must contain the 2D bounding box in the key "box_2d", the segmentation mask in key "mask", and the text label in the key "label".`

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: segPrompt },
              { inline_data: { mime_type: mimeType, data: imageBase64 } },
            ],
          }],
          generationConfig: {
            response_mime_type: 'application/json',
            max_output_tokens: 16384,
            temperature: 0.1,
          },
        }),
      }
    )

    if (!response.ok) {
      console.warn(`[Dissector] Gemini segmentation returned ${response.status}: ${(await response.text()).substring(0, 200)}`)
      return { masks, refinedRegions }
    }

    const data = await response.json()
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
    if (!text) return { masks, refinedRegions }

    const segResult = parseAIResponse(text)
    // Response may be a direct array or wrapped in an object
    const segItems: any[] = Array.isArray(segResult)
      ? segResult
      : segResult?.items || segResult?.masks || segResult?.elements || []

    console.log(`[Dissector] Gemini segmentation: ${segItems.length} mask items returned`)

    // Match each mask to an analysis layer by IoU
    const usedLayers = new Set<number>()

    for (const item of segItems) {
      if (!item.box_2d || !item.mask) continue

      // box_2d format: [y_min, x_min, y_max, x_max] normalized to 0-1000
      const [yMin, xMin, yMax, xMax] = item.box_2d
      const segBox = {
        x: xMin / 1000,
        y: yMin / 1000,
        w: (xMax - xMin) / 1000,
        h: (yMax - yMin) / 1000,
      }

      // Find best matching analysis layer
      let bestMatch = -1
      let bestIoU = 0

      for (let j = 0; j < analysisLayers.length; j++) {
        if (usedLayers.has(j)) continue
        const r = analysisLayers[j].region || {}
        const iou = computeIoU(
          segBox,
          { x: r.x || 0, y: r.y || 0, w: r.width || 0, h: r.height || 0 }
        )
        if (iou > bestIoU) {
          bestIoU = iou
          bestMatch = j
        }
      }

      if (bestMatch >= 0 && bestIoU > 0.2) {
        const layerId = `layer_${bestMatch}`
        masks.set(layerId, item.mask)
        refinedRegions.set(layerId, {
          x: segBox.x,
          y: segBox.y,
          width: segBox.w,
          height: segBox.h,
        })
        usedLayers.add(bestMatch)
        console.log(`[Dissector] Mask matched to ${layerId} (IoU: ${bestIoU.toFixed(2)}, label: ${item.label})`)
      }
    }

    console.log(`[Dissector] ${masks.size}/${analysisLayers.length} layers matched with masks`)
  } catch (err) {
    console.warn('[Dissector] Gemini segmentation failed:', err)
  }

  return { masks, refinedRegions }
}

function computeIoU(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number }
): number {
  const x1 = Math.max(a.x, b.x)
  const y1 = Math.max(a.y, b.y)
  const x2 = Math.min(a.x + a.w, b.x + b.w)
  const y2 = Math.min(a.y + a.h, b.y + b.h)

  if (x2 <= x1 || y2 <= y1) return 0

  const intersection = (x2 - x1) * (y2 - y1)
  const union = a.w * a.h + b.w * b.h - intersection
  return union > 0 ? intersection / union : 0
}

/**
 * Apply a Gemini segmentation mask to extract a layer as transparent PNG.
 * The mask is a grayscale PNG where brighter pixels = foreground.
 */
async function applyGeminiMask(
  imageBuffer: Buffer,
  maskBase64: string,
  region: { x: number; y: number; width: number; height: number },
  imageWidth: number,
  imageHeight: number
): Promise<Buffer | null> {
  try {
    const { PNG } = await import('pngjs' as string)

    const src = await decodeImageToRGBA(imageBuffer)
    if (!src) return null

    const cropX = Math.max(0, Math.round(region.x * imageWidth))
    const cropY = Math.max(0, Math.round(region.y * imageHeight))
    const cropW = Math.min(Math.round(region.width * imageWidth), src.width - cropX)
    const cropH = Math.min(Math.round(region.height * imageHeight), src.height - cropY)

    if (cropW <= 0 || cropH <= 0) return null

    // Decode mask PNG — strip data URL prefix if present
    let cleanBase64 = maskBase64
    if (cleanBase64.startsWith('data:')) {
      cleanBase64 = cleanBase64.split(',')[1] || cleanBase64
    }
    const maskBuffer = Buffer.from(cleanBase64, 'base64')
    const maskPng = PNG.sync.read(maskBuffer)

    console.log(`[Dissector] applyGeminiMask: crop=${cropW}x${cropH}, mask=${maskPng.width}x${maskPng.height}`)

    // Create output PNG with mask as alpha channel
    const out = new PNG({ width: cropW, height: cropH })

    for (let row = 0; row < cropH; row++) {
      for (let col = 0; col < cropW; col++) {
        const srcIdx = ((cropY + row) * src.width + (cropX + col)) * 4
        const outIdx = (row * cropW + col) * 4

        // Map to mask coordinates (mask may be different resolution than crop)
        const maskCol = Math.min(Math.round(col * maskPng.width / cropW), maskPng.width - 1)
        const maskRow = Math.min(Math.round(row * maskPng.height / cropH), maskPng.height - 1)
        const maskIdx = (maskRow * maskPng.width + maskCol) * 4

        // Mask R channel as alpha (white=opaque, black=transparent), binarize at 127
        const maskAlpha = maskPng.data[maskIdx] || 0

        out.data[outIdx] = src.data[srcIdx]
        out.data[outIdx + 1] = src.data[srcIdx + 1]
        out.data[outIdx + 2] = src.data[srcIdx + 2]
        out.data[outIdx + 3] = maskAlpha >= 127 ? 255 : 0
      }
    }

    const result = Buffer.from(PNG.sync.write(out))
    console.log(`[Dissector] applyGeminiMask: ${cropW}x${cropH} → ${result.length} bytes`)
    return result
  } catch (err) {
    console.warn('[Dissector] applyGeminiMask failed:', err)
    return null
  }
}

// ── analyzeImage ──

export async function analyzeImage(
  event: H3Event | null,
  imageBase64: string,
  brand?: string
): Promise<DissectorManifest> {
  const jobId = randomUUID()
  const now = new Date().toISOString()
  const config = useRuntimeConfig()

  // Detect MIME type from base64 header bytes
  const mimeType = detectMimeType(imageBase64) || 'image/png'

  let rawResult: any = null
  let usedGemini = false

  // 1. Gemini 2.5 Flash (primary — best quality + segmentation masks)
  if (config.geminiApiKey) {
    rawResult = await analyzeWithGemini(config.geminiApiKey, imageBase64, mimeType, brand)
    if (rawResult) usedGemini = true
  }

  // 2. Workers AI (free, fast fallback)
  const ai = getAI(event)
  if (!rawResult && ai) {
    rawResult = await analyzeWithWorkersAI(ai, imageBase64, brand)
  }

  // 3. Groq Scout (fallback)
  if (!rawResult && config.groqApiKey) {
    rawResult = await analyzeWithGroq(config.groqApiKey, imageBase64, brand)
  }

  // Last resort: generate a multi-layer fallback structure
  if (!rawResult) {
    console.warn('[Dissector] All AI models failed — generating fallback multi-layer manifest')
    rawResult = {
      brand: brand || 'Unknown',
      campaign_type: 'other',
      layers: [
        { type: 'background', description: 'Background', region: { x: 0, y: 0, width: 1, height: 1 }, editable: false },
        { type: 'graphic_text', description: 'Main headline', region: { x: 0.05, y: 0.05, width: 0.9, height: 0.3 }, editable: false },
        { type: 'vehicle', description: 'Product image', region: { x: 0.1, y: 0.25, width: 0.6, height: 0.5 }, editable: false },
        { type: 'live_text', description: 'Price and details', region: { x: 0.5, y: 0.7, width: 0.45, height: 0.2 }, editable: true },
        { type: 'logo', description: 'Brand logo', region: { x: 0.02, y: 0.85, width: 0.25, height: 0.12 }, editable: false },
      ],
      editable_fields: [
        { type: 'brand', value: brand || 'Brand', label: 'Brand' },
        { type: 'price', value: '$XX,XXX', label: 'Price' },
        { type: 'cta_label', value: 'Learn More', label: 'CTA' },
      ],
    }
  }

  // Build typed manifest
  const layers: DissectorLayer[] = (rawResult.layers || []).map((l: any, i: number) => {
    const layerType: DissectorLayerType = validateLayerType(l.type)
    const layerId = `layer_${i}`

    return {
      id: layerId,
      type: layerType,
      description: l.description || `Layer ${i}`,
      z_index: Z_ORDER[layerType] ?? i,
      editable: l.editable ?? (layerType === 'live_text'),
      export_as_png: layerType !== 'live_text',
      region: normalizeRegion(l.region),
      token_bindings: layerType === 'live_text' ? findTokenBindings(l, rawResult.editable_fields) : undefined,
      render_as: layerType === 'live_text' ? 'html' : undefined,
      typography: l.typography,
      font_notes: l.font_notes,
    }
  })

  const tokens = buildManifestTokens(rawResult.editable_fields || [], layers)

  // Second pass: update layer token_bindings from raw type names to token IDs
  // and backfill token affects_layers
  for (const layer of layers) {
    if (!layer.token_bindings?.length) continue
    const resolvedBindings: string[] = []
    for (const rawBinding of layer.token_bindings) {
      // Find token whose type matches the raw binding
      const matchingTokenId = Object.keys(tokens).find(tid => tokens[tid]?.type === rawBinding)
      const matchingToken = matchingTokenId ? tokens[matchingTokenId] : undefined
      if (matchingTokenId && matchingToken) {
        resolvedBindings.push(matchingTokenId)
        if (!matchingToken.affects_layers.includes(layer.id)) {
          matchingToken.affects_layers.push(layer.id)
        }
      }
    }
    layer.token_bindings = resolvedBindings.length > 0 ? resolvedBindings : layer.token_bindings
  }

  // Get Gemini segmentation masks for pixel-perfect layer extraction
  if (usedGemini && config.geminiApiKey && rawResult.layers?.length) {
    const segResult = await getGeminiSegmentationMasks(
      config.geminiApiKey, imageBase64, mimeType, rawResult.layers
    )
    for (const layer of layers) {
      if (segResult.masks.has(layer.id)) {
        layer.mask = segResult.masks.get(layer.id)
      }
      if (segResult.refinedRegions.has(layer.id)) {
        layer.region = segResult.refinedRegions.get(layer.id)!
      }
    }
  }

  return {
    jobId,
    version: '2.0',
    brand: brand || rawResult.brand || 'Unknown',
    campaign_type: rawResult.campaign_type || 'other',
    banner_size: '',
    processed_at: now,
    status: 'segmenting',
    tokens,
    layers,
  }
}

// ── segmentLayer ──

export async function segmentLayer(
  _event: H3Event | null,
  imageBuffer: Buffer,
  region: { x: number; y: number; width: number; height: number },
  layerId: string,
  imageWidth: number,
  imageHeight: number,
  mask?: string
): Promise<Buffer | null> {
  const config = useRuntimeConfig()

  // If we have a Gemini segmentation mask, use it for precise extraction
  if (mask) {
    const masked = await applyGeminiMask(imageBuffer, mask, region, imageWidth, imageHeight)
    if (masked) {
      console.log(`[Dissector] Layer ${layerId}: extracted with Gemini mask, ${masked.length} bytes`)
      return masked
    }
    console.warn(`[Dissector] Layer ${layerId}: Gemini mask failed, falling back to crop+RMBG`)
  }

  // Convert normalized region to pixel coordinates
  const pixelBox = {
    x1: Math.round(region.x * imageWidth),
    y1: Math.round(region.y * imageHeight),
    x2: Math.round((region.x + region.width) * imageWidth),
    y2: Math.round((region.y + region.height) * imageHeight),
  }

  // Step 1: Crop the region from the source image
  const cropped = await cropRegion(imageBuffer, pixelBox, imageWidth, imageHeight)
  if (!cropped) {
    console.warn(`[Dissector] Layer ${layerId}: crop failed`)
    return null
  }

  // Step 2: Remove background from the cropped region using RMBG
  if (config.hfApiToken) {
    const cleaned = await removeBackground(cropped, config.hfApiToken, layerId)
    if (cleaned) return cleaned
  }

  // Fallback: return the rectangular crop (includes background)
  return cropped
}

/**
 * Remove background from a cropped PNG using HuggingFace RMBG model.
 * Returns a transparent PNG, or null on failure.
 */
async function removeBackground(
  croppedPng: Buffer,
  hfApiToken: string,
  layerId: string
): Promise<Buffer | null> {
  try {
    const response = await fetch(
      'https://api-inference.huggingface.co/models/briaai/RMBG-2.0',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${hfApiToken}`,
        },
        body: new Uint8Array(croppedPng),
      }
    )

    if (!response.ok) {
      console.warn(`[Dissector] RMBG returned ${response.status} for layer ${layerId}: ${await response.text()}`)
      return null
    }

    const resultBuffer = Buffer.from(await response.arrayBuffer())
    if (resultBuffer.length > 0) {
      console.log(`[Dissector] Layer ${layerId}: background removed, ${resultBuffer.length} bytes`)
      return resultBuffer
    }

    return null
  } catch (err) {
    console.warn(`[Dissector] RMBG failed for layer ${layerId}:`, err)
    return null
  }
}

// ── buildManifestTokens ──

export function buildManifestTokens(
  editableFields: Array<{ type: string; value: string; label?: string }>,
  layers: DissectorLayer[]
): Record<string, DesignToken> {
  const tokens: Record<string, DesignToken> = {}

  for (const field of editableFields) {
    const tokenType = validateTokenType(field.type)
    const tokenId = `token.${tokenType}`

    // Deduplicate: if same token type already exists, append a suffix
    const finalId = tokens[tokenId] ? `${tokenId}.${Object.keys(tokens).filter(k => k.startsWith(tokenId)).length}` : tokenId

    // Find layers that reference this token type
    const affectsLayers = layers
      .filter(l => l.token_bindings?.some(b => b === finalId))
      .map(l => l.id)

    tokens[finalId] = {
      id: finalId,
      type: tokenType,
      value: field.value || '',
      label: field.label || formatLabel(tokenType),
      editable: true,
      required: tokenType === 'brand' || tokenType === 'price',
      validation: getValidationRules(tokenType),
      affects_layers: affectsLayers,
    }
  }

  return tokens
}

// ── Internal helpers ──

function detectMimeType(base64: string): string | null {
  // Decode first 4 bytes to detect format
  const bytes = Buffer.from(base64.substring(0, 16), 'base64')
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return 'image/png'
  if (bytes[0] === 0xFF && bytes[1] === 0xD8) return 'image/jpeg'
  if (bytes.toString('ascii', 0, 4) === 'RIFF') return 'image/webp'
  return null
}

function parseAIResponse(text: string, silent = false): any {
  if (!text || text.trim().length === 0) {
    if (!silent) console.warn('[Dissector] Empty AI response')
    return null
  }

  // Strip markdown code fences if present
  let cleaned = text.trim()
  cleaned = cleaned.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '')

  // Try the whole cleaned text as JSON first
  try {
    return JSON.parse(cleaned)
  } catch {
    // Fall through
  }

  // Try to extract the outermost JSON object with brace balancing
  const start = cleaned.indexOf('{')
  if (start !== -1) {
    let depth = 0
    let inString = false
    let escape = false
    for (let i = start; i < cleaned.length; i++) {
      const ch = cleaned[i]
      if (escape) { escape = false; continue }
      if (ch === '\\') { escape = true; continue }
      if (ch === '"') { inString = !inString; continue }
      if (inString) continue
      if (ch === '{') depth++
      else if (ch === '}') {
        depth--
        if (depth === 0) {
          try {
            return JSON.parse(cleaned.substring(start, i + 1))
          } catch {
            break
          }
        }
      }
    }
  }

  if (!silent) {
    console.warn('[Dissector] Could not parse AI response as JSON. First 200 chars:', text.substring(0, 200))
  }
  return null
}

function validateLayerType(type: string): DissectorLayerType {
  const valid: DissectorLayerType[] = ['graphic_text', 'live_text', 'vehicle', 'logo', 'background']
  return valid.includes(type as DissectorLayerType) ? (type as DissectorLayerType) : 'graphic_text'
}

function validateTokenType(type: string): TokenType {
  const valid: TokenType[] = [
    'price', 'price_label', 'model_name', 'brand',
    'campaign_label', 'color', 'font_size', 'disclaimer',
    'cta_label', 'image_asset',
  ]
  return valid.includes(type as TokenType) ? (type as TokenType) : 'campaign_label'
}

function normalizeRegion(region: any): { x: number; y: number; width: number; height: number } {
  if (!region || typeof region !== 'object') {
    return { x: 0, y: 0, width: 1, height: 1 }
  }
  return {
    x: clamp(Number(region.x) || 0, 0, 1),
    y: clamp(Number(region.y) || 0, 0, 1),
    width: clamp(Number(region.width) || 1, 0, 1),
    height: clamp(Number(region.height) || 1, 0, 1),
  }
}

function clamp(val: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, val))
}

function findTokenBindings(
  layer: any,
  editableFields: Array<{ type: string; value: string }>
): string[] {
  // Match live_text layers to tokens based on description overlap
  const bindings: string[] = []
  const desc = (layer.description || '').toLowerCase()

  for (const field of editableFields) {
    const fieldValue = (field.value || '').toLowerCase()
    if (desc.includes(fieldValue) || desc.includes(field.type)) {
      bindings.push(field.type)
    }
  }

  // If no matches found, bind based on layer type hints
  if (bindings.length === 0 && layer.type === 'live_text') {
    if (desc.includes('price') || desc.includes('$')) bindings.push('price')
    else if (desc.includes('cta') || desc.includes('button')) bindings.push('cta_label')
    else if (desc.includes('model') || desc.includes('name')) bindings.push('model_name')
    else if (desc.includes('brand') || desc.includes('logo')) bindings.push('brand')
  }

  return bindings
}

function formatLabel(type: TokenType): string {
  return type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function getValidationRules(type: TokenType): DesignToken['validation'] {
  switch (type) {
    case 'price':
      return { maxLength: 20, pattern: '^\\$?[\\d,]+\\.?\\d*$' }
    case 'model_name':
      return { maxLength: 50 }
    case 'brand':
      return { maxLength: 40 }
    case 'cta_label':
      return { maxLength: 30 }
    case 'campaign_label':
      return { maxLength: 60 }
    case 'disclaimer':
      return { maxLength: 200 }
    case 'price_label':
      return { maxLength: 30 }
    default:
      return undefined
  }
}

/**
 * Decode a PNG or JPEG image buffer into raw RGBA pixel data.
 * Uses pngjs for PNG, jpeg-js for JPEG.
 */
async function decodeImageToRGBA(
  imageBuffer: Buffer
): Promise<{ data: Uint8Array | Buffer; width: number; height: number } | null> {
  // Detect format from magic bytes instead of try/catch decoding
  const isPNG = imageBuffer[0] === 0x89 && imageBuffer[1] === 0x50
  const isJPEG = imageBuffer[0] === 0xFF && imageBuffer[1] === 0xD8

  if (isPNG) {
    try {
      const { PNG } = await import('pngjs' as string)
      const png = PNG.sync.read(imageBuffer)
      return { data: png.data, width: png.width, height: png.height }
    } catch (err) {
      console.warn('[Dissector] PNG decode failed:', err)
    }
  }

  if (isJPEG) {
    try {
      const jpegModule = await import('jpeg-js' as string)
      // CJS/ESM interop: jpeg-js uses module.exports which lands at .default in ESM
      const jpegDecode = typeof jpegModule.decode === 'function'
        ? jpegModule.decode
        : typeof jpegModule.default?.decode === 'function'
          ? jpegModule.default.decode
          : null

      if (!jpegDecode) {
        console.warn('[Dissector] jpeg-js loaded but decode not found. Module keys:', Object.keys(jpegModule))
        return null
      }

      const decoded = jpegDecode(imageBuffer, { useTArray: true, formatAsRGBA: true })
      console.log(`[Dissector] JPEG decoded: ${decoded.width}x${decoded.height}, data length: ${decoded.data.length}`)
      return { data: decoded.data, width: decoded.width, height: decoded.height }
    } catch (err) {
      console.warn('[Dissector] JPEG decode failed:', err)
    }
  }

  console.warn(`[Dissector] Unknown image format. First bytes: ${imageBuffer[0]?.toString(16)} ${imageBuffer[1]?.toString(16)}`)
  return null
}

/**
 * Crop a region from a PNG or JPEG image buffer.
 * Decodes to raw RGBA pixels, crops the bounding box, encodes to PNG.
 */
async function cropRegion(
  imageBuffer: Buffer,
  box: { x1: number; y1: number; x2: number; y2: number },
  _imageWidth: number,
  _imageHeight: number
): Promise<Buffer | null> {
  try {
    const { PNG } = await import('pngjs' as string)

    console.log(`[Dissector] cropRegion: decoding ${imageBuffer.length} byte image (first bytes: ${imageBuffer[0]?.toString(16)} ${imageBuffer[1]?.toString(16)})`)
    const src = await decodeImageToRGBA(imageBuffer)
    if (!src) {
      console.warn('[Dissector] cropRegion: could not decode image — decodeImageToRGBA returned null')
      return null
    }

    const cropX = Math.max(0, box.x1)
    const cropY = Math.max(0, box.y1)
    const cropW = Math.min(box.x2, src.width) - cropX
    const cropH = Math.min(box.y2, src.height) - cropY

    console.log(`[Dissector] cropRegion: src=${src.width}x${src.height}, crop box=[${cropX},${cropY} ${cropW}x${cropH}]`)

    if (cropW <= 0 || cropH <= 0) {
      console.warn(`[Dissector] cropRegion: invalid crop dimensions ${cropW}x${cropH}`)
      return null
    }

    const out = new PNG({ width: cropW, height: cropH })

    for (let row = 0; row < cropH; row++) {
      for (let col = 0; col < cropW; col++) {
        const srcIdx = ((cropY + row) * src.width + (cropX + col)) * 4
        const outIdx = (row * cropW + col) * 4
        out.data[outIdx] = src.data[srcIdx]
        out.data[outIdx + 1] = src.data[srcIdx + 1]
        out.data[outIdx + 2] = src.data[srcIdx + 2]
        out.data[outIdx + 3] = src.data[srcIdx + 3] ?? 255
      }
    }

    const result = Buffer.from(PNG.sync.write(out))
    console.log(`[Dissector] cropRegion: success — ${cropW}x${cropH} PNG, ${result.length} bytes`)
    return result
  } catch (err) {
    console.warn('[Dissector] cropRegion failed:', err)
    return null
  }
}

/**
 * Get image dimensions from a JPEG or PNG buffer by reading headers.
 */
export function getImageDimensions(buffer: Buffer): { width: number; height: number } | null {
  // PNG: width at bytes 16-19, height at bytes 20-23 (big-endian, after 8-byte signature + 4-byte chunk length + 4-byte IHDR)
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
    const width = buffer.readUInt32BE(16)
    const height = buffer.readUInt32BE(20)
    return { width, height }
  }

  // JPEG: scan for SOF0 (0xFF 0xC0) or SOF2 (0xFF 0xC2) marker
  if (buffer[0] === 0xFF && buffer[1] === 0xD8) {
    let offset = 2
    while (offset < buffer.length - 8) {
      if (buffer[offset] !== 0xFF) { offset++; continue }
      const marker = buffer[offset + 1]
      if (marker === 0xC0 || marker === 0xC2) {
        const height = buffer.readUInt16BE(offset + 5)
        const width = buffer.readUInt16BE(offset + 7)
        return { width, height }
      }
      // Skip to next marker
      const segmentLength = buffer.readUInt16BE(offset + 2)
      offset += 2 + segmentLength
    }
  }

  // WebP: RIFF header, then VP8 chunk
  if (buffer.length > 30 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    const chunk = buffer.toString('ascii', 12, 16)
    if (chunk === 'VP8 ') {
      // Lossy WebP
      const width = buffer.readUInt16LE(26) & 0x3FFF
      const height = buffer.readUInt16LE(28) & 0x3FFF
      return { width, height }
    } else if (chunk === 'VP8L') {
      // Lossless WebP
      const bits = buffer.readUInt32LE(21)
      const width = (bits & 0x3FFF) + 1
      const height = ((bits >> 14) & 0x3FFF) + 1
      return { width, height }
    }
  }

  return null
}
