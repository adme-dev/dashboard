// workers/audio-jobs/src/timelineMasterRender.ts — Worker side of the Container
// /render-timeline contract: download clip sources from R2, build the filtergraph
// plan (the synced .mjs port), POST to the Container, upload the master WAV to R2.
import { getContainer } from '@cloudflare/containers'
import { buildTimelineFiltergraph } from '../container/timelineFiltergraph.mjs'

export interface MasterRenderEnv {
  RENDER: unknown
  AUDIO_BUCKET: {
    get(key: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer> } | null>
    put(key: string, body: ArrayBuffer | Uint8Array, opts?: any): Promise<unknown>
  }
}

export async function renderTimelineMaster(
  env: MasterRenderEnv,
  args: { projectId: string; jobId: string; state: any }
): Promise<{ masterKey: string; wallClockSec: number }> {
  const start = Date.now()
  const plan = buildTimelineFiltergraph(args.state)

  // Download each clip's source bytes (in plan input order) → base64 payload.
  const files: { b64: string }[] = []
  for (const input of plan.inputs) {
    const obj = await env.AUDIO_BUCKET.get(input.r2_key)
    if (!obj) throw new Error(`clip source missing in R2: ${input.r2_key}`)
    const buf = Buffer.from(await obj.arrayBuffer())
    files.push({ b64: buf.toString('base64') })
  }

  const instance = getContainer(env.RENDER, `tl:${args.jobId}`)
  // Prior-art lifecycle: keep the instance alive for a long master render so
  // sleepAfter='5m' can't reap it mid-render. renewActivityTimeout is the SDK
  // heartbeat primitive; call it before the (bounded) synchronous render call.
  ;(instance as any).renewActivityTimeout?.()
  const res = await instance.fetch('http://render.local/render-timeline', {
    method: 'POST',
    body: JSON.stringify({ plan, files }),
    headers: { 'content-type': 'application/json' },
    signal: AbortSignal.timeout(300_000)
  })
  if (!res.ok) throw new Error(`timeline master render failed: ${res.status}`)

  const masterBytes = await res.arrayBuffer()
  const masterKey = `media/${args.projectId}/${args.jobId}/master.wav`
  await env.AUDIO_BUCKET.put(masterKey, masterBytes, { httpMetadata: { contentType: 'audio/wav' } })

  return { masterKey, wallClockSec: Math.max(1, Math.round((Date.now() - start) / 1000)) }
}
