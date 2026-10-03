const SPACE_BASE = 'https://qwen-qwen-image-edit-2511.hf.space'
const API_PREFIX = '/gradio_api'

const MAX_OUTPUT_BYTES = 20 * 1024 * 1024

function bufferToBlobPart(buffer: Buffer): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(buffer.length)
  bytes.set(buffer)
  return bytes
}

export interface EditResult {
  buffer: Buffer
  seed: number | null
}

/**
 * Edit an image using the Qwen/Qwen-Image-Edit-2511 HuggingFace Space (Gradio API).
 *
 * Returns the edited image buffer + the seed used, or null on failure.
 */
export async function editImageWithAI(
  imageBuffer: Buffer,
  prompt: string,
  options?: {
    width?: number
    height?: number
    guidanceScale?: number
    steps?: number
    seed?: number
    randomizeSeed?: boolean
    hfToken?: string
    rewritePrompt?: boolean
  }
): Promise<EditResult | null> {
  const width = Math.min(Math.max(options?.width ?? 512, 256), 2048)
  const height = Math.min(Math.max(options?.height ?? 512, 256), 2048)
  const guidanceScale = Math.min(Math.max(options?.guidanceScale ?? 4.0, 1.0), 10.0)
  const steps = Math.min(Math.max(options?.steps ?? 40, 1), 50)
  const seed = options?.seed ?? 0
  const randomizeSeed = options?.randomizeSeed ?? true

  const headers: Record<string, string> = {}
  if (options?.hfToken) {
    headers['Authorization'] = `Bearer ${options.hfToken}`
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 180_000) // 180s for heavier model

  try {
    // Step 1: Upload image to Gradio Space
    const uploadPath = await uploadToSpace(imageBuffer, headers, controller.signal)
    if (!uploadPath) return null

    // Step 2: Submit edit request
    const eventId = await submitEdit(uploadPath, prompt, {
      width, height, guidanceScale, steps, seed, randomizeSeed, rewritePrompt: options?.rewritePrompt ?? true
    }, headers, controller.signal)
    if (!eventId) return null

    // Step 3: Stream SSE result
    const streamOutput = await streamResult(eventId, headers, controller.signal)
    if (!streamOutput?.imageUrl) return null

    // Step 4: Download the edited image
    const resp = await fetch(streamOutput.imageUrl, { headers, signal: controller.signal, redirect: 'error' })
    if (!resp.ok) {
      console.warn(`[ImageEditor] Download failed: ${resp.status}`)
      return null
    }

    if (Number(resp.headers.get('content-length')) > MAX_OUTPUT_BYTES || !resp.body) return null
    const reader = resp.body.getReader()
    const chunks: Uint8Array[] = []
    let size = 0
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > MAX_OUTPUT_BYTES) {
        await reader.cancel()
        return null
      }
      chunks.push(value)
    }
    const buf = Buffer.concat(chunks)
    if (buf.length === 0) {
      console.warn('[ImageEditor] Downloaded empty buffer')
      return null
    }

    console.log(`[ImageEditor] Edit complete, ${buf.length} bytes, seed=${streamOutput.seed}`)
    return { buffer: buf, seed: streamOutput.seed }
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') {
      console.warn('[ImageEditor] Request timed out after 180s')
    } else {
      console.warn('[ImageEditor] Edit failed:', err)
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

    const resp = await fetch(`${SPACE_BASE}${API_PREFIX}/upload`, {
      method: 'POST',
      headers,
      body: formData,
      signal
    })

    if (!resp.ok) {
      console.warn(`[ImageEditor] Upload returned ${resp.status}: ${await resp.text()}`)
      return null
    }

    const result = await resp.json() as Array<string | { name?: string, path?: string }>
    if (!result || result.length === 0) {
      console.warn('[ImageEditor] Upload returned empty result')
      return null
    }

    const first = result[0]
    const path = typeof first === 'string' ? first : first?.name || first?.path
    if (!path) {
      console.warn('[ImageEditor] Upload returned unexpected format:', JSON.stringify(first))
      return null
    }

    return path
  } catch (err) {
    console.warn('[ImageEditor] Upload failed:', err)
    return null
  }
}

async function submitEdit(
  uploadPath: string,
  prompt: string,
  params: { width: number, height: number, guidanceScale: number, steps: number, seed: number, randomizeSeed: boolean, rewritePrompt: boolean },
  headers: Record<string, string>,
  signal: AbortSignal
): Promise<string | null> {
  try {
    // 9 params in order matching the Space's infer endpoint
    const resp = await fetch(`${SPACE_BASE}${API_PREFIX}/call/infer`, {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        data: [
          [{ image: { path: uploadPath, meta: { _type: 'gradio.FileData' } } }],
          prompt, // prompt
          params.seed, // seed
          params.randomizeSeed, // randomize_seed
          params.guidanceScale, // true_guidance_scale
          params.steps, // num_inference_steps
          params.height, // height
          params.width, // width
          params.rewritePrompt
        ]
      }),
      signal
    })

    if (!resp.ok) {
      console.warn(`[ImageEditor] Submit returned ${resp.status}: ${await resp.text()}`)
      return null
    }

    const result = await resp.json() as { event_id: string }
    if (!result?.event_id) {
      console.warn('[ImageEditor] Submit returned no event_id')
      return null
    }

    return result.event_id
  } catch (err) {
    console.warn('[ImageEditor] Submit failed:', err)
    return null
  }
}

interface EditStreamOutput {
  imageUrl: string | null
  seed: number | null
}

async function streamResult(
  eventId: string,
  headers: Record<string, string>,
  signal: AbortSignal
): Promise<EditStreamOutput | null> {
  try {
    const resp = await fetch(`${SPACE_BASE}${API_PREFIX}/call/infer/${eventId}`, {
      headers,
      signal
    })

    if (!resp.ok) {
      console.warn(`[ImageEditor] Stream returned ${resp.status}`)
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
          // Response format: [Gallery (images), seed_number]
          const imageUrl = extractFirstImageUrl(data)
          const seed = extractSeed(data)
          return { imageUrl, seed }
        } catch {
          console.warn('[ImageEditor] Failed to parse complete event data:', line.slice(6))
          return null
        }
      }

      if (line.startsWith('data: ') && currentEvent === 'error') {
        const errorData = line.slice(6)
        console.warn(`[ImageEditor] Space returned error: ${errorData}`)
        return null
      }
    }

    console.warn('[ImageEditor] No complete event found in stream')
    return null
  } catch (err) {
    console.warn('[ImageEditor] Stream failed:', err)
    return null
  }
}

function extractFirstImageUrl(data: unknown): string | null {
  if (!Array.isArray(data) || !Array.isArray(data[0])) return null
  const item = data[0][0]
  const raw = item?.image?.url ?? item?.url
  if (typeof raw !== 'string') return null
  try {
    const url = new URL(raw, SPACE_BASE)
    if (url.origin !== SPACE_BASE || url.username || url.password) return null
    return url.href
  } catch {
    return null
  }
}

/**
 * Extract the seed number from the response data.
 * Response format: [Gallery, seed_number]
 */
function extractSeed(data: unknown): number | null {
  if (!Array.isArray(data)) return null
  // The seed is typically the second element in the top-level array
  for (const item of data) {
    if (typeof item === 'number') return item
  }
  return null
}
