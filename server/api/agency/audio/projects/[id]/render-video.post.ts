// server/api/agency/audio/projects/[id]/render-video.post.ts
// Flag-gated composite-video render endpoint. Available only on AV projects and
// only when VIDEO_STUDIO_ENABLED='true'. Mirrors render.post.ts: snapshot →
// render-job → enqueue → 202.
// Resolves overlay clips (gsap_project_id → banner layers → server HTML → R2 upload)
// before enqueuing, so the worker has pre-built HTML to pass to the container.
import { z } from 'zod'
import { requireWriteAccess } from '~~/server/utils/auth'
import { getProjectWithCurrentTimeline, createRenderJob, markRenderJobFailed } from '~~/server/utils/audio/projects'
import { enqueueVideoRender } from '~~/server/utils/audio/renderQueue'
import { resolveOverlayFormatKey, loadBannerLayers } from '~~/server/utils/audio/bannerOverlay'
import { buildBannerHTML } from '~~/server/utils/banner/htmlBuilder'
import { uploadFile } from '~~/server/utils/storage'
import { videoFormatFor } from '~~/server/utils/audio/videoProfiles'

const ALL_FORMATS = ['reels_9x16', 'square_1x1', 'youtube_16x9'] as const
type VideoFormatKey = typeof ALL_FORMATS[number]

const BodySchema = z.object({
  formats: z.array(z.enum(ALL_FORMATS)).nonempty().optional()
})

export default defineEventHandler(async (event) => {
  if (process.env.VIDEO_STUDIO_ENABLED !== 'true') {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }

  const user = await requireWriteAccess(event)
  const id = getRouterParam(event, 'id')!

  const bodyResult = BodySchema.safeParse(await readBody(event))
  if (!bodyResult.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid render-video request',
      data: { errors: bodyResult.error.issues.map((i) => i.message) } })
  }
  const formats = (bodyResult.data.formats?.length ? bodyResult.data.formats : [...ALL_FORMATS]) as [
    VideoFormatKey,
    ...VideoFormatKey[]
  ]

  const existing = await getProjectWithCurrentTimeline(id)
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Project not found' })
  if (existing.project.mediaType !== 'av') {
    throw createError({ statusCode: 400, statusMessage: 'render-video requires an AV project' })
  }
  if (!existing.project.currentTimelineId || !existing.timeline) {
    throw createError({ statusCode: 409, statusMessage: 'Project has no current timeline to render' })
  }

  // Collect all overlay clips from the timeline state.
  const timelineState = existing.timeline.state as any
  const overlayClips: any[] = []
  for (const track of (timelineState?.tracks ?? [])) {
    if (track.kind === 'overlay') {
      for (const clip of (track.clips ?? [])) {
        if (clip.type === 'overlay') overlayClips.push(clip)
      }
    }
  }

  // Snapshot + create the job row (same createRenderJob as audio — channels unused for
  // video but the row records who triggered it and acts as the durable anchor).
  const job = await createRenderJob({ projectId: id, requestedBy: user.id, channels: [] })

  // Resolve each overlay per requested output format: load banner layers, build HTML,
  // upload to R2. This avoids reusing portrait overlay HTML for square/landscape
  // exports when the clip does not pin a specific Banner Studio format.
  // Any error here is a user/config error → 400 (project or format not found).
  const resolvedOverlaysByFormat: Record<string, { clipId: string; htmlKey: string; timeline_start_sec: number; duration_sec: number }[]> = {}
  try {
    for (const format of formats) {
      const profile = videoFormatFor(format)
      const profileW = profile?.width ?? 1080
      const profileH = profile?.height ?? 1920
      const resolvedForFormat: { clipId: string; htmlKey: string; timeline_start_sec: number; duration_sec: number }[] = []

      for (const clip of overlayClips) {
        const fmtKey: string = clip.gsap_format_key ?? resolveOverlayFormatKey(profileW, profileH)
        const { layers } = await loadBannerLayers(clip.gsap_project_id, fmtKey)
        const baseUrl = process.env.NUXT_PUBLIC_APP_URL ?? ''
        const html = buildBannerHTML(fmtKey, layers, { baseUrl })
        const htmlKey = `media/${id}/${job.id}/${format}/overlay-${clip.id}.html`
        await uploadFile(Buffer.from(html, 'utf8'), htmlKey, 'text/html')
        resolvedForFormat.push({
          clipId: clip.id,
          htmlKey,
          timeline_start_sec: clip.timeline_start_sec,
          duration_sec: clip.duration_sec,
        })
      }

      if (resolvedForFormat.length > 0) {
        resolvedOverlaysByFormat[format] = resolvedForFormat
      }
    }
  } catch (e: any) {
    await markRenderJobFailed(job.id, `overlay resolution failed: ${e?.message ?? String(e)}`)
    throw createError({ statusCode: 400, statusMessage: `Overlay resolution failed: ${e?.message ?? String(e)}` })
  }

  try {
    await enqueueVideoRender(event, {
      jobId: job.id, projectId: id, timelineId: job.timelineId, formats,
      ...(Object.keys(resolvedOverlaysByFormat).length > 0 ? { resolvedOverlaysByFormat } : {})
    })
  } catch (e: any) {
    await markRenderJobFailed(job.id, `enqueue failed: ${e?.message ?? String(e)}`)
    throw createError({ statusCode: 502, statusMessage: 'Failed to enqueue video render' })
  }

  setResponseStatus(event, 202)
  return { job }
})
