// workers/audio-jobs/src/videoCompositeContainer.ts — Worker side of the Container
// /render-composite contract: download clip sources from R2, build the composite
// plan (the synced .mjs port), POST to the Container, upload the mp4 to R2.
// V1.2b: resolvedOverlays carry R2 HTML keys; Worker fetches the HTML from R2 and
// passes overlays[] to the container + buildCompositePlan so the container can
// run Chromium capture before compositing.
import { getContainer } from '@cloudflare/containers'
import { buildCompositePlan } from '../container/videoCompositeGraph.mjs'

export interface CompositeRenderEnv {
  RENDER: unknown
  AUDIO_BUCKET: {
    get(key: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer>; text(): Promise<string> } | null>
    put(key: string, body: ArrayBuffer | Uint8Array, opts?: any): Promise<unknown>
  }
}

export interface ResolvedOverlay {
  clipId: string
  htmlKey: string
  timeline_start_sec: number
  duration_sec: number
}

export async function renderComposite(
  env: CompositeRenderEnv,
  args: {
    projectId: string
    jobId: string
    state: any
    profile: any
    resolvedOverlays?: ResolvedOverlay[]
  }
): Promise<{ key: string }> {
  const resolvedOverlays = args.resolvedOverlays ?? []

  // Build overlay frame inputs for the composite plan (pattern, fps, timing).
  const overlayFrameInputs = resolvedOverlays.map((ov) => ({
    clipId: ov.clipId,
    framesPattern: `ovl_${ov.clipId}/%05d.png`,
    fps: args.profile.fps ?? 30,
    timeline_start_sec: ov.timeline_start_sec,
    duration_sec: ov.duration_sec,
  }))

  const plan = buildCompositePlan(args.state, args.profile, overlayFrameInputs)

  const files: { b64: string }[] = []
  for (const input of plan.inputs) {
    const obj = await env.AUDIO_BUCKET.get(input.r2_key)
    if (!obj) throw new Error(`composite source missing in R2: ${input.r2_key}`)
    files.push({ b64: Buffer.from(await obj.arrayBuffer()).toString('base64') })
  }

  // Fetch overlay HTML from R2 for each resolved overlay.
  const containerOverlays: {
    clipId: string
    html: string
    framesPattern: string
    fps: number
    durationSec: number
    width: number
    height: number
  }[] = []
  for (const ov of resolvedOverlays) {
    const obj = await env.AUDIO_BUCKET.get(ov.htmlKey)
    if (!obj) throw new Error(`overlay HTML missing in R2: ${ov.htmlKey}`)
    const html = await obj.text()
    containerOverlays.push({
      clipId: ov.clipId,
      html,
      framesPattern: `ovl_${ov.clipId}/%05d.png`,
      fps: args.profile.fps ?? 30,
      durationSec: ov.duration_sec,
      width: args.profile.width,
      height: args.profile.height,
    })
  }

  const instance = getContainer(env.RENDER, `vid:${args.jobId}`)
  ;(instance as any).renewActivityTimeout?.()
  const body = JSON.stringify({
    plan,
    files,
    ...(containerOverlays.length > 0 ? { overlays: containerOverlays } : {}),
  })
  const res = await instance.fetch('http://render.local/render-composite', {
    method: 'POST', body,
    headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(600_000)
  })
  if (!res.ok) throw new Error(`composite render failed: ${res.status}`)
  const bytes = await res.arrayBuffer()
  const key = `media/${args.projectId}/${args.jobId}/${args.profile.format}.mp4`
  await env.AUDIO_BUCKET.put(key, bytes, { httpMetadata: { contentType: 'video/mp4' } })
  return { key }
}
