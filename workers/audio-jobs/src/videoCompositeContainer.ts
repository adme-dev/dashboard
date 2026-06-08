// workers/audio-jobs/src/videoCompositeContainer.ts — Worker side of the Container
// /render-composite contract: download clip sources from R2, build the composite
// plan (the synced .mjs port), POST to the Container, upload the mp4 to R2.
import { getContainer } from '@cloudflare/containers'
import { buildCompositePlan } from '../container/videoCompositeGraph.mjs'

export interface CompositeRenderEnv {
  RENDER: unknown
  AUDIO_BUCKET: {
    get(key: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer> } | null>
    put(key: string, body: ArrayBuffer | Uint8Array, opts?: any): Promise<unknown>
  }
}

export async function renderComposite(
  env: CompositeRenderEnv,
  args: { projectId: string; jobId: string; state: any; profile: any }
): Promise<{ key: string }> {
  const plan = buildCompositePlan(args.state, args.profile)
  const files: { b64: string }[] = []
  for (const input of plan.inputs) {
    const obj = await env.AUDIO_BUCKET.get(input.r2_key)
    if (!obj) throw new Error(`composite source missing in R2: ${input.r2_key}`)
    files.push({ b64: Buffer.from(await obj.arrayBuffer()).toString('base64') })
  }
  const instance = getContainer(env.RENDER, `vid:${args.jobId}`)
  ;(instance as any).renewActivityTimeout?.()
  const res = await instance.fetch('http://render.local/render-composite', {
    method: 'POST', body: JSON.stringify({ plan, files }),
    headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(600_000)
  })
  if (!res.ok) throw new Error(`composite render failed: ${res.status}`)
  const bytes = await res.arrayBuffer()
  const key = `media/${args.projectId}/${args.jobId}/${args.profile.format}.mp4`
  await env.AUDIO_BUCKET.put(key, bytes, { httpMetadata: { contentType: 'video/mp4' } })
  return { key }
}
