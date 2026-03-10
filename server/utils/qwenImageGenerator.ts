const SPACE_BASE = 'https://qwen-qwen-image-2512.hf.space'
const API_PREFIX = '/gradio_api'

// Trusted domains for output image URLs returned by the Space
const TRUSTED_HOSTS = ['.hf.space', '.huggingface.co']

export interface GenerateResult {
  buffer: Buffer
  seed: number | null
}

export interface GenerateOptions {
  seed?: number
  randomizeSeed?: boolean
  aspectRatio?: string // e.g. "1:1", "16:9", "9:16", "4:3", "3:4"
  guidanceScale?: number
  steps?: number
  promptEnhance?: boolean
  hfToken?: string
}

/**
 * Generate an image from a text prompt using the Qwen/Qwen-Image-2512
 * HuggingFace Space (Gradio API).
 *
 * Returns the generated image buffer + seed used, or null on failure.
 */
export async function generateImageFromPrompt(
  prompt: string,
  options?: GenerateOptions
): Promise<GenerateResult | null> {
  const seed = options?.seed ?? 0
  const randomizeSeed = options?.randomizeSeed ?? true
  const aspectRatio = options?.aspectRatio || '1:1'
  const guidanceScale = Math.min(Math.max(options?.guidanceScale ?? 3.5, 1.0), 10.0)
  const steps = Math.min(Math.max(options?.steps ?? 28, 1), 50)
  const promptEnhance = options?.promptEnhance ?? true

  const headers: Record<string, string> = {}
  if (options?.hfToken) {
    headers['Authorization'] = `Bearer ${options.hfToken}`
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 180_000) // 180s for GPU cold starts

  try {
    // Step 1: Submit generation request (no upload needed — text only)
    const eventId = await submitGeneration(prompt, {
      seed, randomizeSeed, aspectRatio, guidanceScale, steps, promptEnhance,
    }, headers, controller.signal)
    if (!eventId) return null

    // Step 2: Stream SSE result
    const streamOutput = await streamResult(eventId, headers, controller.signal)
    if (!streamOutput?.imageUrl) return null

    // Step 3: Download the generated image
    const resp = await fetch(streamOutput.imageUrl, { headers, signal: controller.signal })
    if (!resp.ok) {
      console.warn(`[ImageGenerator] Download failed: ${resp.status}`)
      return null
    }

    const buf = Buffer.from(await resp.arrayBuffer())
    if (buf.length === 0) {
      console.warn('[ImageGenerator] Downloaded empty buffer')
      return null
    }

    console.log(`[ImageGenerator] Generation complete, ${buf.length} bytes, seed=${streamOutput.seed}`)
    return { buffer: buf, seed: streamOutput.seed }
  } catch (err: any) {
    if (err.name === 'AbortError') {
      console.warn('[ImageGenerator] Request timed out after 180s')
    } else {
      console.warn('[ImageGenerator] Generation failed:', err)
    }
    return null
  } finally {
    clearTimeout(timeout)
  }
}

async function submitGeneration(
  prompt: string,
  params: { seed: number; randomizeSeed: boolean; aspectRatio: string; guidanceScale: number; steps: number; promptEnhance: boolean },
  headers: Record<string, string>,
  signal: AbortSignal
): Promise<string | null> {
  try {
    // 7 params in order matching the Space's infer endpoint:
    // prompt, seed, randomize_seed, aspect_ratio, guidance_scale, num_inference_steps, prompt_enhance
    const resp = await fetch(`${SPACE_BASE}${API_PREFIX}/call/infer`, {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        data: [
          prompt,                // prompt
          params.seed,           // seed
          params.randomizeSeed,  // randomize_seed
          params.aspectRatio,    // aspect_ratio
          params.guidanceScale,  // guidance_scale
          params.steps,          // num_inference_steps
          params.promptEnhance,  // prompt_enhance
        ],
      }),
      signal,
    })

    if (!resp.ok) {
      console.warn(`[ImageGenerator] Submit returned ${resp.status}: ${await resp.text()}`)
      return null
    }

    const result = await resp.json() as { event_id: string }
    if (!result?.event_id) {
      console.warn('[ImageGenerator] Submit returned no event_id')
      return null
    }

    return result.event_id
  } catch (err) {
    console.warn('[ImageGenerator] Submit failed:', err)
    return null
  }
}

interface GenerateStreamOutput {
  imageUrl: string | null
  seed: number | null
}

async function streamResult(
  eventId: string,
  headers: Record<string, string>,
  signal: AbortSignal
): Promise<GenerateStreamOutput | null> {
  try {
    const resp = await fetch(`${SPACE_BASE}${API_PREFIX}/call/infer/${eventId}`, {
      headers,
      signal,
    })

    if (!resp.ok) {
      console.warn(`[ImageGenerator] Stream returned ${resp.status}`)
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
          // Response format: [Image object, seed_number]
          const imageUrl = extractFirstImageUrl(data)
          const seed = extractSeed(data)
          return { imageUrl, seed }
        } catch (parseErr) {
          console.warn('[ImageGenerator] Failed to parse complete event data:', line.slice(6))
          return null
        }
      }

      if (line.startsWith('data: ') && currentEvent === 'error') {
        const errorData = line.slice(6)
        console.warn(`[ImageGenerator] Space returned error: ${errorData}`)
        return null
      }
    }

    console.warn('[ImageGenerator] No complete event found in stream')
    return null
  } catch (err) {
    console.warn('[ImageGenerator] Stream failed:', err)
    return null
  }
}

function extractFirstImageUrl(data: any): string | null {
  function walk(node: any): string | null {
    if (!node) return null
    if (typeof node === 'object' && node.url && typeof node.url === 'string') {
      const rawUrl = node.url
      if (rawUrl.startsWith('http')) {
        try {
          const parsed = new URL(rawUrl)
          const isTrusted = TRUSTED_HOSTS.some(h => parsed.hostname.endsWith(h))
          if (!isTrusted) {
            console.warn('[ImageGenerator] Skipping untrusted URL:', rawUrl)
            return null
          }
        } catch { return null }
        return rawUrl
      } else {
        return `${SPACE_BASE}${API_PREFIX}/file=${rawUrl}`
      }
    }
    if (Array.isArray(node)) {
      for (const item of node) {
        const found = walk(item)
        if (found) return found
      }
    }
    return null
  }

  return walk(data)
}

function extractSeed(data: any): number | null {
  if (!Array.isArray(data)) return null
  for (const item of data) {
    if (typeof item === 'number') return item
  }
  return null
}
