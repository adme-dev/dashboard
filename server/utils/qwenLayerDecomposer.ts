const SPACE_BASE = 'https://qwen-qwen-image-layered.hf.space'

// Trusted domains for layer download URLs returned by the Space
const TRUSTED_HOSTS = ['.hf.space', '.huggingface.co']

interface DecomposeLayerResult {
  index: number
  label: string
  pngBuffer: Buffer
}

/**
 * Decompose an image into multiple RGBA PNG layers using the
 * Qwen/Qwen-Image-Layered HuggingFace Space (Gradio API).
 *
 * Returns an array of PNG buffers (one per layer), or null on failure.
 */
export async function decomposeImageLayers(
  imageBuffer: Buffer,
  options?: { numLayers?: number; hfToken?: string }
): Promise<DecomposeLayerResult[] | null> {
  const numLayers = Math.min(Math.max(options?.numLayers ?? 4, 2), 8)
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

    // Step 2: Submit prediction
    const eventId = await submitPrediction(uploadPath, numLayers, headers, controller.signal)
    if (!eventId) return null

    // Step 3: Stream SSE result
    const layerUrls = await streamResult(eventId, headers, controller.signal)
    if (!layerUrls || layerUrls.length === 0) return null

    // Step 4: Download each layer PNG
    const layers: DecomposeLayerResult[] = []
    for (let i = 0; i < layerUrls.length; i++) {
      const url = layerUrls[i]
      try {
        const resp = await fetch(url, { headers, signal: controller.signal })
        if (!resp.ok) {
          console.warn(`[Decomposer] Layer ${i} download failed: ${resp.status}`)
          continue
        }
        const buf = Buffer.from(await resp.arrayBuffer())
        if (buf.length > 0) {
          layers.push({
            index: i,
            label: `Layer ${i + 1}`,
            pngBuffer: buf,
          })
        }
      } catch (err) {
        console.warn(`[Decomposer] Layer ${i} download error:`, err)
      }
    }

    if (layers.length === 0) {
      console.warn('[Decomposer] No layers downloaded successfully')
      return null
    }

    console.log(`[Decomposer] Decomposed into ${layers.length} layers`)
    return layers
  } catch (err: any) {
    if (err.name === 'AbortError') {
      console.warn('[Decomposer] Request timed out after 120s')
    } else {
      console.warn('[Decomposer] Decomposition failed:', err)
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

    const resp = await fetch(`${SPACE_BASE}/gradio_api/upload`, {
      method: 'POST',
      headers,
      body: formData,
      signal,
    })

    if (!resp.ok) {
      console.warn(`[Decomposer] Upload returned ${resp.status}: ${await resp.text()}`)
      return null
    }

    // Gradio /upload returns either string[] or {name: string}[] depending on version
    const result = await resp.json() as any[]
    if (!result || result.length === 0) {
      console.warn('[Decomposer] Upload returned empty result')
      return null
    }

    const first = result[0]
    const path = typeof first === 'string' ? first : first?.name || first?.path
    if (!path) {
      console.warn('[Decomposer] Upload returned unexpected format:', JSON.stringify(first))
      return null
    }

    return path
  } catch (err) {
    console.warn('[Decomposer] Upload failed:', err)
    return null
  }
}

async function submitPrediction(
  uploadPath: string,
  numLayers: number,
  headers: Record<string, string>,
  signal: AbortSignal
): Promise<string | null> {
  try {
    const resp = await fetch(`${SPACE_BASE}/gradio_api/call/infer_1`, {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        data: [
          // Gradio 4.x+ file reference — both formats are tried for compatibility
          { path: uploadPath },
          numLayers,
        ],
      }),
      signal,
    })

    if (!resp.ok) {
      console.warn(`[Decomposer] Submit returned ${resp.status}: ${await resp.text()}`)
      return null
    }

    const result = await resp.json() as { event_id: string }
    if (!result?.event_id) {
      console.warn('[Decomposer] Submit returned no event_id')
      return null
    }

    return result.event_id
  } catch (err) {
    console.warn('[Decomposer] Submit failed:', err)
    return null
  }
}

async function streamResult(
  eventId: string,
  headers: Record<string, string>,
  signal: AbortSignal
): Promise<string[] | null> {
  try {
    const resp = await fetch(`${SPACE_BASE}/gradio_api/call/infer_1/${eventId}`, {
      headers,
      signal,
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
          return extractLayerUrls(data)
        } catch (parseErr) {
          console.warn('[Decomposer] Failed to parse complete event data:', line.slice(6))
          return null
        }
      }

      if (line.startsWith('data: ') && currentEvent === 'error') {
        const errorData = line.slice(6)
        console.warn(`[Decomposer] Space returned error: ${errorData}`)
        return null
      }
    }

    console.warn('[Decomposer] No complete event found in stream')
    return null
  } catch (err) {
    console.warn('[Decomposer] Stream failed:', err)
    return null
  }
}

function extractLayerUrls(data: any): string[] {
  const urls: string[] = []

  // Gradio returns data as nested arrays with file objects
  // Format: [[{url: "..."}, {url: "..."}]] or [{url: "..."}] etc.
  function walk(node: any) {
    if (!node) return
    if (typeof node === 'object' && node.url && typeof node.url === 'string') {
      const rawUrl = node.url
      if (rawUrl.startsWith('http')) {
        // Validate the URL origin to prevent laundering through our R2
        try {
          const parsed = new URL(rawUrl)
          const isTrusted = TRUSTED_HOSTS.some(h => parsed.hostname.endsWith(h))
          if (!isTrusted) {
            console.warn('[Decomposer] Skipping untrusted layer URL:', rawUrl)
            return
          }
        } catch {
          return
        }
        urls.push(rawUrl)
      } else {
        // Relative path — resolve against Space base
        urls.push(`${SPACE_BASE}/gradio_api/file=${rawUrl}`)
      }
      return
    }
    if (Array.isArray(node)) {
      for (const item of node) walk(item)
    }
  }

  walk(data)
  return urls
}
