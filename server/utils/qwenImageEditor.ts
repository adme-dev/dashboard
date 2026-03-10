const SPACE_BASE = 'https://qwen-qwen-image-edit-2511.hf.space'
const API_PREFIX = '/gradio_api'

// Trusted domains for output image URLs returned by the Space
const TRUSTED_HOSTS = ['.hf.space', '.huggingface.co']

/**
 * Edit an image using the Qwen/Qwen-Image-Edit-2511 HuggingFace Space (Gradio API).
 *
 * Returns a single PNG/WebP buffer of the edited image, or null on failure.
 */
export async function editImageWithAI(
  imageBuffer: Buffer,
  prompt: string,
  options?: {
    width?: number
    height?: number
    guidanceScale?: number
    steps?: number
    hfToken?: string
  }
): Promise<Buffer | null> {
  const width = Math.min(Math.max(options?.width ?? 512, 256), 2048)
  const height = Math.min(Math.max(options?.height ?? 512, 256), 2048)
  const guidanceScale = Math.min(Math.max(options?.guidanceScale ?? 4.0, 1.0), 10.0)
  const steps = Math.min(Math.max(options?.steps ?? 40, 1), 50)

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
      width, height, guidanceScale, steps,
    }, headers, controller.signal)
    if (!eventId) return null

    // Step 3: Stream SSE result
    const imageUrl = await streamResult(eventId, headers, controller.signal)
    if (!imageUrl) return null

    // Step 4: Download the edited image
    const resp = await fetch(imageUrl, { headers, signal: controller.signal })
    if (!resp.ok) {
      console.warn(`[ImageEditor] Download failed: ${resp.status}`)
      return null
    }

    const buf = Buffer.from(await resp.arrayBuffer())
    if (buf.length === 0) {
      console.warn('[ImageEditor] Downloaded empty buffer')
      return null
    }

    console.log(`[ImageEditor] Edit complete, ${buf.length} bytes`)
    return buf
  } catch (err: any) {
    if (err.name === 'AbortError') {
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
    const blob = new Blob([imageBuffer], { type: 'image/png' })
    const formData = new FormData()
    formData.append('files', blob, 'input.png')

    const resp = await fetch(`${SPACE_BASE}${API_PREFIX}/upload`, {
      method: 'POST',
      headers,
      body: formData,
      signal,
    })

    if (!resp.ok) {
      console.warn(`[ImageEditor] Upload returned ${resp.status}: ${await resp.text()}`)
      return null
    }

    const result = await resp.json() as any[]
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
  params: { width: number; height: number; guidanceScale: number; steps: number },
  headers: Record<string, string>,
  signal: AbortSignal
): Promise<string | null> {
  try {
    // 9 params in order matching the Space's infer endpoint
    const resp = await fetch(`${SPACE_BASE}${API_PREFIX}/call/infer`, {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        data: [
          [{ path: uploadPath }],  // images — Gallery format
          prompt,                   // prompt
          0,                        // seed
          true,                     // randomize_seed
          params.guidanceScale,     // true_guidance_scale
          params.steps,             // num_inference_steps
          params.height,            // height
          params.width,             // width
          true,                     // rewrite_prompt
        ],
      }),
      signal,
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

async function streamResult(
  eventId: string,
  headers: Record<string, string>,
  signal: AbortSignal
): Promise<string | null> {
  try {
    const resp = await fetch(`${SPACE_BASE}${API_PREFIX}/call/infer/${eventId}`, {
      headers,
      signal,
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
          return extractFirstImageUrl(data)
        } catch (parseErr) {
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

function extractFirstImageUrl(data: any): string | null {
  // Walk the data structure to find the first image URL
  // Gradio returns gallery format: [[{url: "..."}, ...], seed]
  function walk(node: any): string | null {
    if (!node) return null
    if (typeof node === 'object' && node.url && typeof node.url === 'string') {
      const rawUrl = node.url
      if (rawUrl.startsWith('http')) {
        try {
          const parsed = new URL(rawUrl)
          const isTrusted = TRUSTED_HOSTS.some(h => parsed.hostname.endsWith(h))
          if (!isTrusted) {
            console.warn('[ImageEditor] Skipping untrusted URL:', rawUrl)
            return null
          }
        } catch {
          return null
        }
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
