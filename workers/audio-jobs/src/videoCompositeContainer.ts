// workers/audio-jobs/src/videoCompositeContainer.ts — Worker side of the Container
// /render-composite contract: download clip sources from R2, build the composite
// plan (the synced .mjs port), POST to the Container, upload the mp4 to R2.
// V1.2b: resolvedOverlays carry R2 HTML keys; Worker fetches the HTML from R2 and
// passes overlays[] to the container + buildCompositePlan so the container can
// run Chromium capture before compositing.
import { putCompositeOutput } from './compositeOutputStream'
import { verifyPinnedObject } from '../../../shared/video-storyboard/renderManifest'
import type { PinnedRenderObject, CopyRequirement } from '../../../shared/video-storyboard/renderManifest'
import type { ReelmotionBaseFootage } from '../../../shared/reelmotionBaseFootage'
import { getContainer } from '@cloudflare/containers'
import { buildCompositePlan } from '../container/videoCompositeGraph.mjs'

export interface CompositeRenderEnv {
  RENDER: Parameters<typeof getContainer>[0]
  AUDIO_BUCKET: {
    get(key: string): Promise<{ size: number, etag?: string, arrayBuffer(): Promise<ArrayBuffer>, text(): Promise<string> } | null>
    put(key: string, body: ArrayBuffer | Uint8Array | ReadableStream<Uint8Array>, opts?: { httpMetadata: { contentType: string } }): Promise<unknown>
  }
}

export interface ResolvedOverlay {
  clipId: string
  htmlKey: string
  timeline_start_sec: number
  duration_sec: number
  requiredCopy?: CopyRequirement[]
  baseFootage?: ReelmotionBaseFootage
}

// The producer emits one video with one double-quoted src. If the original
// snapshot differs, fail closed instead of letting Chromium refetch footage.
function embedPinnedFootage(html: string, b64: string): string {
  const videos = [...html.matchAll(/<video\b[^<>]*>/gi)]
  if (videos.length !== 1 || /<source\b/i.test(html)) throw new Error('Invalid whole-artwork footage snapshot')
  const tag = videos[0]![0]
  if (tag.match(/\s+src\s*=/gi)?.length !== 1 || !/\s+src="[^"<>]+"/i.test(tag)) {
    throw new Error('Invalid whole-artwork footage source')
  }
  const embedded = tag.replace(/(\s+src=")[^"<>]+"/i, (_, prefix) => prefix + 'data:video/mp4;base64,' + b64 + '"')
  return html.replace(tag, () => embedded)
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
  if (args.pinnedObjects && (args.pinnedObjects.reduce((sum, object) => sum + object.size, 0) > 16 * 1024 * 1024 || resolvedOverlays.some(overlay => overlay.baseFootage || !overlay.requiredCopy?.length)))
    throw new Error('Storyboard composite exceeds supported immutable input contract')
  const baseOverlay = resolvedOverlays.find(overlay => overlay.baseFootage)
  const base = baseOverlay?.baseFootage
  if (base && baseOverlay) {
    const expectedHtmlKey = `media/${args.projectId}/${args.jobId}/${args.profile.format}/overlay-${baseOverlay.clipId}.html`
    const source = base.source
    if (base.version !== 1 || resolvedOverlays.length !== 1
      || ![args.projectId, args.jobId, baseOverlay.clipId].every(id => /^[a-zA-Z0-9_-]+$/.test(id))
      || baseOverlay.htmlKey !== expectedHtmlKey || base.graphicsHtmlKey !== expectedHtmlKey.slice(0, -5) + '-graphics.html'
      || typeof source?.r2Key !== 'string' || !source.r2Key.startsWith('banner-assets/')
      || source.r2Key.split('/').some(part => !part || part === '..' || part === '.')
      || typeof source.etag !== 'string' || !source.etag.trim()
      || !Number.isSafeInteger(source.size) || source.size <= 0 || source.size > 16 * 1024 * 1024) {
      throw new Error('Invalid managed base footage descriptor')
    }
  }
  const readInput = async (key: string) => {
    const pinned = args.pinnedObjects?.find(object => object.key === key)
    if (args.pinnedObjects && !pinned) throw new Error('Unpinned composite input')
    const object = await env.AUDIO_BUCKET.get(key)
    if (!object) throw new Error('Composite input unavailable')
    if (base && key === base.source.r2Key && (object.etag !== base.source.etag || object.size !== base.source.size))
      throw new Error('Managed base footage changed')
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
    duration_sec: ov.duration_sec,
    ...(ov.baseFootage ? { baseFootage: { r2Key: ov.baseFootage.source.r2Key, zoom: ov.baseFootage.zoom } } : {})
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
    const html = new TextDecoder().decode(await readInput(ov.baseFootage?.graphicsHtmlKey ?? ov.htmlKey))
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
  const signal = AbortSignal.timeout(600_000)
  const post = (renderPlan: typeof plan, media: typeof files, overlays: typeof containerOverlays) =>
    instance.fetch('http://render.local/render-composite', {
      method: 'POST', headers: { 'content-type': 'application/json' }, signal,
      body: JSON.stringify({ plan: renderPlan, files: media, ...(overlays.length ? { overlays } : {}) })
    })
  let res = await post(plan, files, containerOverlays)
  if (baseOverlay && res.status === 422 && res.headers.get('x-reelmotion-base') === 'unsupported') {
    await res.body?.cancel()
    const original = new TextDecoder().decode(await readInput(baseOverlay.htmlKey))
    const fullOverlay = { ...containerOverlays[0]!, html: embedPinnedFootage(original, files[0]!.b64) }
    const fallback = buildCompositePlan(args.state, args.profile, [{ ...overlayFrameInputs[0], baseFootage: undefined }])
    res = await post(fallback, files.slice(1), [fullOverlay])
  }
  if (!res.ok) throw new Error(`composite render failed: ${res.status}`)
  if (!res.body) throw new Error('Composite render body missing')
  const key = `media/${args.projectId}/${args.jobId}/${crypto.randomUUID()}/${args.profile.format}.mp4`
  await putCompositeOutput(env.AUDIO_BUCKET, key, res)
  return { key }
}
