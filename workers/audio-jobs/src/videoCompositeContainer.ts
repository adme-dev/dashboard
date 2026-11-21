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
import { createRenderDeadline, VIDEO_RENDER_FORMAT_MS, VIDEO_PROGRESS_INTERVAL_MS, VIDEO_PROGRESS_REQUEST_MS, measuredRenderProgress, type MeasuredRenderProgress } from '../../../shared/video/renderExecution'

export interface CompositeRenderEnv {
  RENDER: Parameters<typeof getContainer>[0]
  AUDIO_BUCKET: {
    get(key: string): Promise<{ size: number, etag?: string, arrayBuffer(): Promise<ArrayBuffer>, text(): Promise<string> } | null>
    put(key: string, body: ArrayBuffer | Uint8Array | ReadableStream<Uint8Array>, opts?: { httpMetadata: { contentType: string } }): Promise<unknown>
    delete?(key: string): Promise<unknown>
  }
}

export interface ResolvedOverlay {
  clipId: string
  htmlKey: string
  timeline_start_sec: number
  duration_sec: number
  requiredCopy?: CopyRequirement[]
  baseFootage?: ReelmotionBaseFootage
  containedPortraitFootage?: ReelmotionBaseFootage
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

export interface CompositeRenderArgs {
    projectId: string
    jobId: string
    state: unknown
    profile: { width: number, height: number, fps: number, format: string }
    pinnedObjects?: PinnedRenderObject[]
    resolvedOverlays?: ResolvedOverlay[]
    signal?: AbortSignal
    deadlineAtMs?: number
    onProgress?(progress: MeasuredRenderProgress): Promise<void>
}

export async function renderComposite(env: CompositeRenderEnv, args: CompositeRenderArgs): Promise<{ key: string }> {
  const execution = createRenderDeadline(VIDEO_RENDER_FORMAT_MS, { signal: args.signal, deadlineAtMs: args.deadlineAtMs })
  try { return await renderCompositeWithinBudget(env, args, execution) }
  finally { execution.dispose() }
}

async function renderCompositeWithinBudget(env: CompositeRenderEnv, args: CompositeRenderArgs, execution: ReturnType<typeof createRenderDeadline>): Promise<{ key: string }> {
  const resolvedOverlays = args.resolvedOverlays ?? []
  if (args.pinnedObjects && (args.pinnedObjects.reduce((sum, object) => sum + object.size, 0) > 16 * 1024 * 1024 || resolvedOverlays.some(overlay => overlay.baseFootage || overlay.containedPortraitFootage || !overlay.requiredCopy?.length)))
    throw new Error('Storyboard composite exceeds supported immutable input contract')
  const baseOverlay = resolvedOverlays.find(overlay => overlay.baseFootage || overlay.containedPortraitFootage)
  const contained = baseOverlay?.containedPortraitFootage
  const base = contained ?? baseOverlay?.baseFootage
  if (contained && (baseOverlay?.baseFootage || args.profile.fps !== 30 || args.profile.height !== 1080
    || !((args.profile.format === 'square_1x1' && args.profile.width === 1080)
      || (args.profile.format === 'youtube_16x9' && args.profile.width === 1920)))) {
    throw new Error('Invalid contained portrait output')
  }
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
    const object = await execution.run(() => env.AUDIO_BUCKET.get(key))
    if (!object) throw new Error('Composite input unavailable')
    if (base && key === base.source.r2Key && (object.etag !== base.source.etag || object.size !== base.source.size))
      throw new Error('Managed base footage changed')
    if (pinned && object.size !== pinned.size) throw new Error('Pinned render input size changed')
    const bytes = await execution.run(() => object.arrayBuffer())
    if (pinned) await execution.run(() => verifyPinnedObject(bytes, pinned))
    return bytes
  }

  // Build overlay frame inputs for the composite plan (pattern, fps, timing).
  const overlayFrameInputs = resolvedOverlays.map((ov, index) => ({
    clipId: ov.clipId,
    framesPattern: `ovl_${index}/%05d.png`,
    fps: args.profile.fps ?? 30,
    timeline_start_sec: ov.timeline_start_sec,
    duration_sec: ov.duration_sec,
    ...(base && ov === baseOverlay ? { baseFootage: { r2Key: base.source.r2Key, zoom: base.zoom } } : {})
  }))

  // Compose footage, zoom and graphics at authored resolution. Fit the complete
  // picture once at the output boundary so captions and end cards stay in frame.
  const artworkProfile = contained ? { ...args.profile, format: 'reels_9x16', width: 1080, height: 1920 } : args.profile
  const plan = buildCompositePlan(args.state, artworkProfile, overlayFrameInputs)
  if (contained) {
    const { width, height } = args.profile
    plan.filterComplex += `;${plan.vLabel}scale=-2:${height},setsar=1,pad=${width}:${height}:(ow-iw)/2:0[contained]`
    plan.vLabel = '[contained]'
    plan.profile = args.profile
  }

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
    const html = new TextDecoder().decode(await readInput(base && ov === baseOverlay ? base.graphicsHtmlKey : ov.htmlKey))
    containerOverlays.push({
      clipId: ov.clipId,
      html,
      requiredCopy: ov.requiredCopy,
      framesPattern: `ovl_${index}/%05d.png`,
      fps: args.profile.fps ?? 30,
      durationSec: ov.duration_sec,
      width: artworkProfile.width,
      height: artworkProfile.height
    })
  }

  const instance = getContainer(env.RENDER, `vid:${args.jobId}`)
  const signal = execution.signal
  const post = async (renderPlan: typeof plan, media: typeof files, overlays: typeof containerOverlays) => {
    signal.throwIfAborted()
    const id = crypto.randomUUID()
    const polling = createRenderProgressPoller(instance, id, execution, args.onProgress)
    try {
      return await execution.run(() => instance.fetch('http://render.local/render-composite', {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-render-execution-id': id, 'x-render-timeout-ms': String(Math.max(1, Math.floor(execution.remainingMs()))) }, signal,
        body: JSON.stringify({ plan: renderPlan, files: media, ...(overlays.length ? { overlays } : {}) })
      }), async response => { await response.body?.cancel().catch(() => {}) })
    } finally { await polling.stop() }
  }
  let res = await post(plan, files, containerOverlays)
  if (baseOverlay && res.status === 422 && res.headers.get('x-reelmotion-base') === 'unsupported') {
    await res.body?.cancel()
    const original = new TextDecoder().decode(await readInput(baseOverlay.htmlKey))
    const fullOverlay = { ...containerOverlays[0]!, width: args.profile.width, height: args.profile.height, html: embedPinnedFootage(original, files[0]!.b64) }
    const fallback = buildCompositePlan(args.state, args.profile, [{ ...overlayFrameInputs[0], baseFootage: undefined }])
    res = await post(fallback, files.slice(1), [fullOverlay])
  }
  if (!res.ok) throw new Error(`composite render failed: ${res.status}`)
  if (!res.body) throw new Error('Composite render body missing')
  const key = `media/${args.projectId}/${args.jobId}/${crypto.randomUUID()}/${args.profile.format}.mp4`
  const reportUpload = async (bytesDone: number, bytesTotal: number) => {
    if (!args.onProgress || signal.aborted) return
    const advisory = createRenderDeadline(VIDEO_PROGRESS_REQUEST_MS, { signal })
    try { await advisory.run(() => args.onProgress!({ stage: 'uploading', bytesDone, bytesTotal })) }
    catch { /* telemetry never owns export success */ }
    finally { advisory.dispose() }
  }
  await execution.run(() => putCompositeOutput(env.AUDIO_BUCKET, key, res, { signal, onProgress: reportUpload }), async () => { await env.AUDIO_BUCKET.delete?.(key) })
  if (signal.aborted) {
    if (env.AUDIO_BUCKET.delete) await env.AUDIO_BUCKET.delete(key).catch(() => {})
    signal.throwIfAborted()
  }
  return { key }
}

/** Only one status read at a time; callbacks cannot outlive their HTTP attempt. */
function createRenderProgressPoller(instance: { fetch(input: string, init: RequestInit): Promise<Response> }, id: string, execution: ReturnType<typeof createRenderDeadline>, onProgress?: CompositeRenderArgs['onProgress']) {
  let stopped = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let pending: Promise<void> = Promise.resolve()
  let read: ReturnType<typeof createRenderDeadline> | undefined
  const controller = new AbortController()
  const schedule = () => {
    if (!onProgress || stopped || execution.signal.aborted) return
    timer = setTimeout(() => {
      timer = undefined
      pending = (async () => {
        read = createRenderDeadline(VIDEO_PROGRESS_REQUEST_MS, { signal: controller.signal, deadlineAtMs: execution.deadlineAtMs })
        try {
          const response = await read.run(() => instance.fetch(`http://render.local/render-progress/${id}`, { method: 'GET', signal: read!.signal }))
          if (!response.ok) { await response.body?.cancel().catch(() => {}); return }
          const progress = measuredRenderProgress(await read.run(() => response.json()))
          if (progress && !stopped && !execution.signal.aborted) await read.run(() => onProgress!(progress))
        } catch { /* old containers and unavailable progress remain compatible */ }
        finally { read.dispose(); read = undefined; schedule() }
      })()
    }, VIDEO_PROGRESS_INTERVAL_MS)
  }
  schedule()
  return { async stop() { stopped = true; if (timer) clearTimeout(timer); controller.abort(); read?.dispose(); await pending } }
}
