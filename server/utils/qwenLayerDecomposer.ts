const SPACE_BASE = 'https://qwen-qwen-image-layered.hf.space'

const MAX_LAYER_BYTES = 20 * 1024 * 1024

function bufferToBlobPart(buffer: Buffer): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(buffer.length)
  bytes.set(buffer)
  return bytes
}

interface DecomposeLayerResult {
  index: number
  label: string
  pngBuffer: Buffer
  width: number
  height: number
}

export interface DecomposeOutput {
  layers: DecomposeLayerResult[]
  pptxUrl?: string
  zipUrl?: string
}

export interface DecomposeOptions {
  numLayers?: number
  prompt?: string
  negPrompt?: string
  guidanceScale?: number
  steps?: number
  hfToken?: string
}

/**
 * Decompose an image into multiple RGBA PNG layers using the
 * Qwen/Qwen-Image-Layered HuggingFace Space (Gradio API).
 *
 * Returns layers + optional PPTX/ZIP download URLs, or null on failure.
 */
export async function decomposeImageLayers(
  imageBuffer: Buffer,
  options?: DecomposeOptions
): Promise<DecomposeOutput | null> {
  const numLayers = Math.min(Math.max(options?.numLayers ?? 4, 2), 8)
  const prompt = options?.prompt?.trim() || ''
  const negPrompt = options?.negPrompt?.trim() || ' '
  const guidanceScale = Math.min(Math.max(options?.guidanceScale ?? 4.0, 1.0), 10.0)
  const steps = Math.min(Math.max(options?.steps ?? 50, 1), 50)
  const headers: Record<string, string> = {}
  if (options?.hfToken) {
    headers['Authorization'] = `Bearer ${options.hfToken}`
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 120_000)

  try {
    // Step 1: Upload image to Gradio Space
    const uploadPath = await uploadToSpace(imageBuffer, headers, controller.signal)
    if (!uploadPath) return null

    // Step 2: Submit prediction with all 10 params
    const eventId = await submitPrediction(uploadPath, {
      numLayers, prompt, negPrompt, guidanceScale, steps
    }, headers, controller.signal)
    if (!eventId) return null

    // Step 3: Stream SSE result
    const result = await streamResult(eventId, headers, controller.signal)
    if (!result?.layerUrls || result.layerUrls.length === 0) return null

    // Gallery count is authoritative: Qwen may include a background in addition
    // to the requested layers. Never silently accept a missing gallery member.
    const layers: DecomposeLayerResult[] = []
    for (let i = 0; i < result.layerUrls.length; i++) {
      const resp = await fetch(result.layerUrls[i]!, { headers, signal: controller.signal, redirect: 'error' })
      if (!resp.ok || Number(resp.headers.get('content-length')) > MAX_LAYER_BYTES) {
        console.warn(`[Decomposer] Layer ${i} download rejected`)
        return null
      }
      const pngBuffer = Buffer.from(await resp.arrayBuffer())
      const frame = readRgbaPngFrame(pngBuffer)
      if (!frame || (layers[0] && (frame.width !== layers[0].width || frame.height !== layers[0].height))) {
        console.warn(`[Decomposer] Layer ${i} has invalid PNG frame`)
        return null
      }
      layers.push({ index: i, label: `Layer ${i + 1}`, pngBuffer, ...frame })
    }

    console.log(`[Decomposer] Decomposed into ${layers.length} layers`)
    return {
      layers,
      pptxUrl: result.pptxUrl,
      zipUrl: result.zipUrl
    }
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      console.warn('[Decomposer] Request timed out after 120s')
    } else {
      console.warn('[Decomposer] Decomposition failed')
    }
    return null
  } finally {
    clearTimeout(timeout)
  }
}

async function uploadToSpace(
  imageBuffer: Buffer,
  headers: Record<string, string>,
  signal: AbortSignal
): Promise<string | null> {
  try {
    const blob = new Blob([bufferToBlobPart(imageBuffer)], { type: 'image/png' })
    const formData = new FormData()
    formData.append('files', blob, 'input.png')

    const resp = await fetch(`${SPACE_BASE}/gradio_api/upload`, {
      method: 'POST',
      headers,
      body: formData,
      signal,
      redirect: 'error'
    })

    if (!resp.ok) {
      console.warn(`[Decomposer] Upload returned ${resp.status}`)
      return null
    }

    // Gradio /upload returns either string[] or {name: string}[] depending on version
    const result: unknown = await resp.json()
    if (!Array.isArray(result) || result.length === 0) {
      console.warn('[Decomposer] Upload returned empty result')
      return null
    }

    const first: unknown = result[0]
    const file = isRecord(first) ? first : undefined
    const path = typeof first === 'string' ? first : file?.name || file?.path
    if (typeof path !== 'string' || !path) {
      console.warn('[Decomposer] Upload returned unexpected format')
      return null
    }

    return path
  } catch {
    console.warn('[Decomposer] Upload failed')
    return null
  }
}

async function submitPrediction(
  uploadPath: string,
  params: { numLayers: number, prompt: string, negPrompt: string, guidanceScale: number, steps: number },
  headers: Record<string, string>,
  signal: AbortSignal
): Promise<string | null> {
  try {
    // 10 params in order matching the Space's infer_1 endpoint:
    // input_image, seed, randomize_seed, prompt, neg_prompt,
    // true_guidance_scale, num_inference_steps, layer, cfg_norm, use_en_prompt
    const resp = await fetch(`${SPACE_BASE}/gradio_api/call/infer_1`, {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        data: [
          { path: uploadPath }, // input_image
          0, // seed
          true, // randomize_seed
          params.prompt, // overall image description, not per-layer control
          params.negPrompt, // neg_prompt
          params.guidanceScale, // true_guidance_scale
          params.steps, // num_inference_steps
          params.numLayers, // layer (number of output layers)
          true, // cfg_norm
          true // use_en_prompt
        ]
      }),
      signal,
      redirect: 'error'
    })

    if (!resp.ok) {
      console.warn(`[Decomposer] Submit returned ${resp.status}`)
      return null
    }

    const result = await resp.json() as { event_id: string }
    if (typeof result?.event_id !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(result.event_id)) {
      console.warn('[Decomposer] Submit returned no event_id')
      return null
    }

    return result.event_id
  } catch {
    console.warn('[Decomposer] Submit failed')
    return null
  }
}

interface StreamOutput {
  layerUrls: string[]
  pptxUrl?: string
  zipUrl?: string
}

async function streamResult(
  eventId: string,
  headers: Record<string, string>,
  signal: AbortSignal
): Promise<StreamOutput | null> {
  try {
    const resp = await fetch(`${SPACE_BASE}/gradio_api/call/infer_1/${eventId}`, {
      headers,
      signal,
      redirect: 'error'
    })

    if (!resp.ok) {
      console.warn(`[Decomposer] Stream returned ${resp.status}`)
      return null
    }

    const text = await resp.text()
    const lines = text.split('\n')

    let currentEvent = ''
    for (const line of lines) {
      if (line.startsWith('event: ')) {
        currentEvent = line.slice(7).trim()
        continue
      }

      if (line.startsWith('data: ') && currentEvent === 'complete') {
        try {
          const data = JSON.parse(line.slice(6))
          return extractAllOutputs(data)
        } catch {
          console.warn('[Decomposer] Failed to parse complete event data')
          return null
        }
      }

      if (line.startsWith('data: ') && currentEvent === 'error') {
        console.warn('[Decomposer] Space returned error')
        return null
      }
    }

    console.warn('[Decomposer] No complete event found in stream')
    return null
  } catch {
    console.warn('[Decomposer] Stream failed')
    return null
  }
}

/**
 * Extract all outputs from the Space response.
 * The Space returns 3 outputs: [Gallery (layers), PPTX file, ZIP file]
 */
function extractAllOutputs(data: unknown): StreamOutput | null {
  const layerUrls: string[] = []
  let pptxUrl: string | undefined
  let zipUrl: string | undefined

  // data is the top-level array of outputs
  // data[0] = Gallery (array of image objects)
  // data[1] = PPTX file object { path/url, ... }
  // data[2] = ZIP file object { path/url, ... }
  if (Array.isArray(data) && Array.isArray(data[0]) && data[0].length > 0) {
    // Gradio Gallery uses { image: FileData, caption }; older versions
    // expose FileData directly or [FileData, caption]. Preserve every slot.
    for (const entry of data[0]) {
      const node = Array.isArray(entry) ? entry[0] : isRecord(entry) ? entry.image ?? entry : entry
      const url = resolveFileUrl(node)
      if (!url) return null
      layerUrls.push(url)
    }
    // Extract PPTX URL (second output)
    pptxUrl = resolveFileUrl(data[1])
    // Extract ZIP URL (third output)
    zipUrl = resolveFileUrl(data[2])
  } else return null

  return { layerUrls, pptxUrl, zipUrl }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function resolveFileUrl(node: unknown): string | undefined {
  if (!isRecord(node)) return undefined
  const rawUrl = node.url || node.path
  if (!rawUrl || typeof rawUrl !== 'string') return undefined
  try {
    const parsed = new URL(rawUrl)
    if (parsed.origin !== SPACE_BASE || parsed.username || parsed.password) return undefined
    return parsed.href
  } catch {
    // FileData.path is an absolute server filesystem path, not another URL.
    if (!rawUrl.startsWith('/') || rawUrl.startsWith('//') || /[\\\r\n?#]/.test(rawUrl)) return undefined
    return `${SPACE_BASE}/gradio_api/file=${rawUrl}`
  }
}

/** Header/structure validation only; pixel fidelity and masks need review. */
function readRgbaPngFrame(buffer: Buffer): { width: number, height: number } | null {
  if (buffer.length < 45 || buffer.length > MAX_LAYER_BYTES
    || !buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    || buffer.readUInt32BE(8) !== 13 || buffer.toString('ascii', 12, 16) !== 'IHDR'
    || ![8, 16].includes(buffer[24]!) || buffer[25] !== 6
    || buffer[26] !== 0 || buffer[27] !== 0 || buffer[28]! > 1) return null

  const width = buffer.readUInt32BE(16)
  const height = buffer.readUInt32BE(20)
  if (!width || !height || width > 4096 || height > 4096) return null
  let offset = 33
  let hasImageData = false
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset)
    const end = offset + 12 + length
    if (end > buffer.length) return null
    const type = buffer.toString('ascii', offset + 4, offset + 8)
    if (type === 'IHDR') return null
    if (type === 'IDAT' && length > 0) hasImageData = true
    if (type === 'IEND') return length === 0 && end === buffer.length && hasImageData ? { width, height } : null
    offset = end
  }
  return null
}
