// workers/audio-jobs/src/videoCompositeContainer.ts — Worker side of the Container
// /render-composite contract: download clip sources from R2, build the composite
// plan (the synced .mjs port), POST to the Container, upload the mp4 to R2.
// V1.2b: resolvedOverlays carry R2 HTML keys; Worker fetches the HTML from R2 and
// passes overlays[] to the container + buildCompositePlan so the container can
// run Chromium capture before compositing.
import { putCompositeOutput } from './compositeOutputStream'
import { verifyPinnedObject } from '../../../shared/video-storyboard/renderManifest'
import type { PinnedRenderObject, CopyRequirement } from '../../../shared/video-storyboard/renderManifest'
import { getContainer } from '@cloudflare/containers'
import { buildCompositePlan } from '../container/videoCompositeGraph.mjs'

export interface CompositeRenderEnv {
  RENDER: Parameters<typeof getContainer>[0]
  AUDIO_BUCKET: {
    get(key: string): Promise<{ size: number, arrayBuffer(): Promise<ArrayBuffer>, text(): Promise<string> } | null>
    put(key: string, body: ArrayBuffer | Uint8Array | ReadableStream<Uint8Array>, opts?: { httpMetadata: { contentType: string } }): Promise<unknown>
  }
}

export interface ResolvedOverlay {
  clipId: string
  htmlKey: string
  timeline_start_sec: number
  duration_sec: number
  requiredCopy?: CopyRequirement[]
}

export async function renderComposite(
  env: CompositeRenderEnv,
  args: {
    projectId: string
    jobId: string
    state: unknown
    profile: { width: number, height: number, fps: number, format: string }
    pinnedObjects?: PinnedRenderObject[]
    resolvedOverlays?: ResolvedOverlay[]
  }
): Promise<{ key: string }> {
  const resolvedOverlays = args.resolvedOverlays ?? []
  if (args.pinnedObjects && (args.pinnedObjects.reduce((sum, object) => sum + object.size, 0) > 16 * 1024 * 1024 || resolvedOverlays.some(overlay => !overlay.requiredCopy?.length)))
    throw new Error('Storyboard composite exceeds supported immutable input contract')
  const readInput = async (key: string) => {
    const pinned = args.pinnedObjects?.find(object => object.key === key)
    if (args.pinnedObjects && !pinned) throw new Error('Unpinned composite input')
    const object = await env.AUDIO_BUCKET.get(key)
    if (!object) throw new Error('Composite input unavailable')
    if (pinned && object.size !== pinned.size) throw new Error('Pinned render input size changed')
    const bytes = await object.arrayBuffer()
    if (pinned) await verifyPinnedObject(bytes, pinned)
    return bytes
  }

  // Build overlay frame inputs for the composite plan (pattern, fps, timing).
  const overlayFrameInputs = resolvedOverlays.map((ov, index) => ({
    clipId: ov.clipId,
    framesPattern: `ovl_${index}/%05d.png`,
    fps: args.profile.fps ?? 30,
    timeline_start_sec: ov.timeline_start_sec,
    duration_sec: ov.duration_sec
  }))

  const plan = buildCompositePlan(args.state, args.profile, overlayFrameInputs)

  const files: { b64: string }[] = []
  for (const input of plan.inputs) {
    files.push({ b64: Buffer.from(await readInput(input.r2_key)).toString('base64') })
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
    requiredCopy?: CopyRequirement[]
  }[] = []
  for (const [index, ov] of resolvedOverlays.entries()) {
    const html = new TextDecoder().decode(await readInput(ov.htmlKey))
    containerOverlays.push({
      clipId: ov.clipId,
      html,
      requiredCopy: ov.requiredCopy,
      framesPattern: `ovl_${index}/%05d.png`,
      fps: args.profile.fps ?? 30,
      durationSec: ov.duration_sec,
      width: args.profile.width,
      height: args.profile.height
    })
  }

  const instance = getContainer(env.RENDER, `vid:${args.jobId}`)
  const body = JSON.stringify({
    plan,
    files,
    ...(containerOverlays.length > 0 ? { overlays: containerOverlays } : {})
  })
  const res = await instance.fetch('http://render.local/render-composite', {
    method: 'POST', body,
    headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(600_000)
  })
  if (!res.ok) throw new Error(`composite render failed: ${res.status}`)
  if (!res.body) throw new Error('Composite render body missing')
  const key = `media/${args.projectId}/${args.jobId}/${crypto.randomUUID()}/${args.profile.format}.mp4`
  await putCompositeOutput(env.AUDIO_BUCKET, key, res)
  return { key }
}
