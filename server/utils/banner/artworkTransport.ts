import type { ChatCompletion, ChatCompletionCreateParamsNonStreaming } from 'openai/resources/chat/completions'
import type { ImageGenerateParamsNonStreaming, ImagesResponse } from 'openai/resources/images'

type ImageEditParams = ImageGenerateParamsNonStreaming & { image: File[] }
type WithRequestId<T> = T & { _request_id: string | null }

/** Artwork uses three non-streaming endpoints. Keeping this bounded transport
 * avoids eagerly constructing every SDK resource in the Pages runtime. */
export default class ArtworkTransport {
  constructor(private readonly options: { apiKey: string, maxRetries: 0, timeout: number }) {}

  images = {
    generate: (params: ImageGenerateParamsNonStreaming) => this.post<ImagesResponse>('/images/generations', params),
    edit: (params: ImageEditParams) => {
      const { image, ...fields } = params
      const form = new FormData()
      for (const [key, value] of Object.entries(fields)) {
        if (value !== undefined) form.append(key, String(value))
      }
      for (const file of image) form.append('image[]', file, file.name)
      return this.post<ImagesResponse>('/images/edits', form)
    }
  }

  chat = { completions: {
    create: (params: ChatCompletionCreateParamsNonStreaming) => this.post<ChatCompletion>('/chat/completions', params)
  } }

  private async post<T>(endpoint: string, body: object): Promise<WithRequestId<T>> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.options.timeout)
    try {
      const multipart = body instanceof FormData
      const response = await fetch(`https://api.openai.com/v1${endpoint}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.options.apiKey}`,
          Accept: 'application/json',
          ...(multipart ? {} : { 'Content-Type': 'application/json' })
        },
        body: multipart ? body : JSON.stringify(body),
        signal: controller.signal,
        // workerd supports manual, not redirect:error. Reject every 3xx below.
        redirect: 'manual'
      })
      // No retries: another paid request requires explicit user intent.
      if (!response.ok) {
        await response.body?.cancel()
        throw new Error('Artwork provider request failed')
      }
      const maximumBytes = endpoint === '/chat/completions' ? 64 * 1024 : 13 * 1024 * 1024
      if (Number(response.headers.get('content-length')) > maximumBytes || !response.body) {
        await response.body?.cancel()
        throw new Error('Invalid response size')
      }
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let bytes = 0
      let text = ''
      let complete = false
      try {
        for (;;) {
          const chunk = await reader.read()
          if (chunk.done) {
            complete = true
            break
          }
          bytes += chunk.value.byteLength
          if (bytes > maximumBytes) throw new Error('Invalid response size')
          text += decoder.decode(chunk.value, { stream: true })
        }
        text += decoder.decode()
      } finally {
        if (!complete) await reader.cancel().catch(() => {})
        reader.releaseLock()
      }
      const result = JSON.parse(text) as T
      return Object.assign(result as object, { _request_id: response.headers.get('x-request-id') }) as WithRequestId<T>
    } catch {
      // Provider errors, JSON excerpts and credentials must never escape.
      throw new Error('Artwork provider request failed')
    } finally {
      clearTimeout(timer)
    }
  }
}

export async function toFile(bytes: Uint8Array, name: string, options: { type: string }) {
  return new File([new Uint8Array(bytes)], name, options)
}
