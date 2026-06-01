// workers/audio-jobs/src/renderVariants.ts
// Worker-side render orchestration: pull the master from R2, invoke the FFmpeg
// CF Container once per requested channel, upload each variant back to R2, and
// return a { channel → r2Key } map for audio_assets.variants. All the ffmpeg
// "math" lives in the tested server/utils/audio/{profiles,render}.ts.
import { getContainer } from '@cloudflare/containers'
import { profileFor } from '../../../server/utils/audio/profiles'
import { buildVariantKey } from '../../../server/utils/audio/render'

export interface RenderEnv {
  // Container Durable Object namespace (the FFmpeg render service).
  RENDER: unknown
  AUDIO_BUCKET: {
    get(key: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer> } | null>
    put(key: string, body: ArrayBuffer | Uint8Array, opts?: { httpMetadata?: { contentType?: string } }): Promise<unknown>
  }
}

export async function renderVariants(env: RenderEnv, params: {
  clientId: string | null
  assetId: string
  masterKey: string
  channels: string[]
}): Promise<Record<string, string>> {
  const master = await env.AUDIO_BUCKET.get(params.masterKey)
  if (!master) throw new Error(`master not found for render: ${params.masterKey}`)
  const masterBytes = await master.arrayBuffer()

  const variants: Record<string, string> = {}
  for (const ch of params.channels) {
    const profile = profileFor(ch)
    if (!profile) continue // unknown channel — skip, don't fail the batch

    const instance = getContainer(env.RENDER, `${params.assetId}:${ch}`)
    const res = await instance.fetch('http://render.local/render', {
      method: 'POST',
      body: masterBytes,
      headers: { 'x-audio-profile': JSON.stringify(profile) },
      // a wedged ffmpeg pass shouldn't hang the queue message — fail fast → retry
      signal: AbortSignal.timeout(120_000)
    })
    if (!res.ok) throw new Error(`render ${ch} failed: ${res.status}`)

    const bytes = await res.arrayBuffer()
    const key = buildVariantKey(params.clientId, params.assetId, ch, profile.format)
    await env.AUDIO_BUCKET.put(key, bytes, {
      httpMetadata: { contentType: profile.format === 'mp3' ? 'audio/mpeg' : 'audio/wav' }
    })
    variants[ch] = key
  }
  return variants
}
