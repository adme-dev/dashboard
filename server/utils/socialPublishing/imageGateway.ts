import type { CreativeAiBinding } from '../creative-generation/aiGatewayProvider'

export const SOCIAL_IMAGE_MODEL = 'google/nano-banana-2'

/** Full-resolution reference editing through the application's existing gateway. */
export async function recomposeImageWithGateway(
  ai: CreativeAiBinding,
  input: { buffer: Buffer, mime: string, prompt: string, aspectRatio: string, gatewayId: string, metadata: Record<string, string> },
  fetchImpl: typeof fetch = fetch
): Promise<{ buffer: Buffer }> {
  const raw = await ai.run(SOCIAL_IMAGE_MODEL, {
    prompt: input.prompt,
    image_input: [`data:${input.mime};base64,${input.buffer.toString('base64')}`],
    aspect_ratio: input.aspectRatio,
    resolution: '2K',
    output_format: 'png'
  }, { gateway: { id: input.gatewayId, skipCache: true, metadata: input.metadata } }) as {
    result?: { image?: string, result?: { image?: string } }
    image?: string
  }
  const output = raw?.result?.result?.image ?? raw?.result?.image ?? raw?.image
  if (!output) throw new Error('Image gateway returned no image')
  const url = new URL(output)
  // Gateway-owned output objects only. Do not follow redirects to arbitrary URLs.
  if (url.protocol !== 'https:' || url.username || url.password || url.port
    || !/^ai-gateway-outputs\.[a-f0-9]{32}\.r2\.cloudflarestorage\.com$/.test(url.hostname)) {
    throw new Error('Image gateway returned an unsupported output location')
  }
  const response = await fetchImpl(url, { redirect: 'error', signal: AbortSignal.timeout(30000) })
  const limit = 20 * 1024 * 1024
  if (!response.ok || !response.body || Number(response.headers.get('content-length')) > limit) {
    throw new Error(`Image gateway output could not be downloaded (HTTP ${response.status})`)
  }
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > limit) {
        await reader.cancel()
        throw new Error('Image gateway output exceeds 20 MB')
      }
      chunks.push(value)
    }
  } finally { reader.releaseLock() }
  if (!size) throw new Error('Image gateway returned an empty image')
  return { buffer: Buffer.concat(chunks) }
}
