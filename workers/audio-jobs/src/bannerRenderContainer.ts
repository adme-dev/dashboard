// workers/audio-jobs/src/bannerRenderContainer.ts — Worker side of the Container
// /render-banner contract: send banner HTML + render params to the container,
// receive MP4 bytes, upload to R2.
import { getContainer } from '@cloudflare/containers'

export async function renderBanner(
  env: { RENDER: unknown; AUDIO_BUCKET: R2Bucket },
  args: { jobId: string; html: string; width: number; height: number; fps: number; crf: number; quality: number },
): Promise<Uint8Array> {
  const instance = getContainer(env.RENDER, `ban:${args.jobId}`)
  ;(instance as any).renewActivityTimeout?.()
  const res = await instance.fetch('http://render.local/render-banner', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(600_000),
  })
  if (!res.ok) throw new Error(`banner container ${res.status}: ${await res.text().catch(() => '')}`)
  return new Uint8Array(await res.arrayBuffer())
}

export async function getSourceHtml(env: { AUDIO_BUCKET: R2Bucket }, key: string): Promise<string> {
  const obj = await env.AUDIO_BUCKET.get(key)
  if (!obj) throw new Error(`source html not found: ${key}`)
  return await obj.text()
}

export async function uploadBannerMp4(
  env: { AUDIO_BUCKET: R2Bucket },
  projectId: string,
  formatKey: string,
  bytes: Uint8Array,
  jobId: string,
): Promise<{ r2Key: string; url: string; size: number }> {
  const r2Key = `banner-videos/${projectId}/${formatKey}_${jobId}.mp4`
  await env.AUDIO_BUCKET.put(r2Key, bytes, { httpMetadata: { contentType: 'video/mp4' } })
  return {
    r2Key,
    url: `/api/agency/banner-studio/export-video/jobs/${encodeURIComponent(jobId)}/download`,
    size: bytes.byteLength,
  }
}
