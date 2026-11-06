import { createHash } from 'node:crypto'
import { createError, type H3Event } from 'h3'
import type { ArtboardState } from '~~/app/types/banner-studio'
import { resolveBannerFormat } from '~~/app/utils/banner-constants'
import { estimateBannerDuration } from '~~/app/utils/banner-render-runtime'
import { loadPublicBannerShare } from '~~/server/utils/banner/publicShare'
import { buildBannerHTML } from '~~/server/utils/banner/htmlBuilder'
import { enqueueBannerRender } from '~~/server/utils/banner/renderJob'
import { buildBannerRenderEnqueueDeps } from '~~/server/utils/banner/renderEnqueue'
import { canRetryBannerJob, RESERVE_BANNER_RETRY_SQL } from '~~/server/utils/banner/renderDispatch'
import { queryOneFresh } from '~~/server/utils/db'
import { enforceRateLimit } from '~~/server/utils/rateLimit'
import { deliverBannerVideo } from '~~/server/utils/banner/videoDelivery'

type Share = Awaited<ReturnType<typeof loadPublicBannerShare>>
type Job = { id: string, status: string, r2_key: string | null, updated_at: string }
const PROFILE = { version: 1, fps: 24, crf: 20, quality: 1 as const }
const ASSET_URL = /^https:\/\/app\.xeroflow\.io\/api\/public\/banner-assets\/v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`
  return JSON.stringify(value) ?? 'null'
}

/** Content-addressed across links; changing saved artwork or fonts creates a new job. */
export function bannerShareVideoPlans(share: Share) {
  const canvas: Record<string, ArtboardState> = typeof share.project.canvasData === 'string' ? JSON.parse(share.project.canvasData) : share.project.canvasData as Record<string, ArtboardState>
  return Object.entries(canvas || {}).map(([key, board]) => {
    const format = resolveBannerFormat(key)
    const duration = Math.max(board?.playback?.duration || 0, estimateBannerDuration(board?.layers || []))
    const revision = createHash('sha256').update(canonical({ project: share.project.id, key, board, fonts: [...share.fonts].sort((a, b) => a.url.localeCompare(b.url)), profile: PROFILE })).digest('hex')
    const id = `${revision.slice(0, 8)}-${revision.slice(8, 12)}-5${revision.slice(13, 16)}-a${revision.slice(17, 20)}-${revision.slice(20, 32)}`
    const unsupported = !format || !Array.isArray(board?.layers) || format.w > 2000 || format.h > 2000 || format.w % 2 !== 0 || format.h % 2 !== 0 || duration > 30 || !Number.isFinite(duration)
    return { key, board, revision, id, width: format?.w || 0, height: format?.h || 0, unsupported }
  })
}
type Plan = ReturnType<typeof bannerShareVideoPlans>[number]

async function readJob(projectId: string, plan: Plan) {
  return queryOneFresh<Job>(`SELECT id, status, r2_key, updated_at FROM banner_render_jobs
    WHERE id = $1 AND project_id = $2 AND format_key = $3 AND source_r2_key = $4`,
  [plan.id, projectId, plan.key, `banner-render-jobs/${plan.id}/source.html`])
}

export async function publicBannerShareVideos(share: Share, token: string) {
  const videos = await Promise.all(bannerShareVideoPlans(share).map(async (plan) => {
    const job = plan.unsupported ? null : await readJob(share.project.id, plan)
    return { formatKey: plan.key, revision: plan.revision, width: plan.width, height: plan.height,
      status: plan.unsupported ? 'unsupported' : job?.status || 'missing',
      canRetry: job ? canRetryBannerJob(job) : false,
      url: job?.status === 'done' ? `/api/public/banner-share/${token}/video?formatKey=${encodeURIComponent(plan.key)}&revision=${plan.revision}` : null }
  }))
  return { videos }
}

export async function bannerShareVideos(event: H3Event) {
  const share = await loadPublicBannerShare(event)
  return publicBannerShareVideos(share, getRouterParam(event, 'token')!)
}

export function buildBannerShareVideoHtml(share: Share, plan: Plan) {
  // Public visitors can only compile the saved artwork, never arbitrary HTML or URLs.
  for (const layer of plan.board.layers) {
    if (layer.src && !ASSET_URL.test(layer.src) && !/^data:(?:image|audio)\/[a-z0-9.+-]+;base64,/i.test(layer.src)) {
      throw createError({ statusCode: 422, statusMessage: 'This artwork contains media that must be imported into Banner Studio before sharing.' })
    }
  }
  if (share.fonts.some(font => !ASSET_URL.test(font.url))) throw createError({ statusCode: 422, statusMessage: 'Import the artwork fonts into Banner Studio before sharing.' })
  const html = buildBannerHTML(plan.key, plan.board.layers, {
    pausedAt: 0, playback: plan.board.playback, bgColor: plan.board.bgColor,
    baseUrl: 'https://app.xeroflow.io', customFonts: share.fonts.map(font => ({
      id: font.id, family: font.name, url: font.url,
      weight: Number(font.tags.find(tag => tag.startsWith('weight:'))?.slice(7) || 400),
      format: font.tags.find(tag => tag.startsWith('format:'))?.slice(7) || 'woff2'
    }))
  })
  if (new TextEncoder().encode(html).length > 2 * 1024 * 1024) throw createError({ statusCode: 413, statusMessage: 'Artwork is too large to prepare a preview.' })
  // Restrict browser subresources as well as the separately downloaded soundtrack.
  const csp = 'default-src \'none\'; script-src \'unsafe-inline\' https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.2/; style-src \'unsafe-inline\' https://fonts.googleapis.com/; img-src data: https://app.xeroflow.io/api/public/banner-assets/; media-src data: https://app.xeroflow.io/api/public/banner-assets/; font-src https://fonts.gstatic.com/ https://app.xeroflow.io/api/public/banner-assets/; base-uri \'none\'; form-action \'none\''
  return html.replace('<head>', `<head><meta http-equiv="Content-Security-Policy" content="${csp}">`)
}

export async function prepareBannerShareVideo(event: H3Event, formatKey: string, retry = false, token = getRouterParam(event, 'token')) {
  const share = await loadPublicBannerShare(event, token)
  const plan = bannerShareVideoPlans(share).find(plan => plan.key === formatKey)
  if (!plan) throw createError({ statusCode: 404, statusMessage: 'Artwork size not found' })
  if (plan.unsupported) throw createError({ statusCode: 422, statusMessage: 'Client video previews support even dimensions up to 2000 pixels and animations up to 30 seconds.' })
  const job = await readJob(share.project.id, plan)
  if (job && (!retry || !canRetryBannerJob(job))) return { status: job.status }
  await enforceRateLimit(event, { key: `banner-share-video:${share.project.id}`, limit: 10, windowSeconds: 600, failureMode: 'closed' })
  const deps = buildBannerRenderEnqueueDeps(event, { genId: () => plan.id, markDispatched: async () => {
    await loadPublicBannerShare(event, token)
  } })
  if (job) {
    const reserved = await queryOneFresh(RESERVE_BANNER_RETRY_SQL, [job.id])
    if (reserved) await deps.sendQueue({ jobId: job.id })
    return { status: 'queued' }
  }
  const html = buildBannerShareVideoHtml(share, plan)
  const owner = await queryOneFresh<{ created_by: string }>('SELECT created_by FROM banner_projects WHERE id = $1', [share.project.id])
  if (!owner?.created_by) throw createError({ statusCode: 503, statusMessage: 'Artwork owner is unavailable' })
  let inserted = false
  await enqueueBannerRender({ projectId: share.project.id, formats: [{ key: plan.key, html, width: plan.width, height: plan.height }], userId: owner.created_by, ...PROFILE }, {
    ...deps,
    insertJob: async (row) => {
      const winner = await queryOneFresh(`INSERT INTO banner_render_jobs (id, project_id, format_key, width, height, fps, crf, quality, source_r2_key, created_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (id) DO NOTHING RETURNING id`,
      [row.id, row.project_id, row.format_key, row.width, row.height, row.fps, row.crf, row.quality, row.source_r2_key, row.created_by])
      inserted = !!winner
    },
    sendQueue: async (message) => { if (inserted) await deps.sendQueue(message) }
  })
  return { status: 'queued' }
}

export async function warmBannerShareVideos(event: H3Event, token: string) {
  const share = await loadPublicBannerShare(event, token)
  // Enqueue only; compiling happens asynchronously in the existing render worker.
  let deferred = false
  for (const plan of bannerShareVideoPlans(share).filter(plan => !plan.unsupported).slice(0, 10)) {
    try {
      await prepareBannerShareVideo(event, plan.key, false, token)
    } catch {
      deferred = true
    }
  }
  if (deferred) throw createError({ statusCode: 503, statusMessage: 'Some preview sizes could not be prepared' })
}

export async function bannerShareVideo(event: H3Event) {
  const share = await loadPublicBannerShare(event)
  const { formatKey, revision } = getQuery(event)
  const plan = bannerShareVideoPlans(share).find(plan => plan.key === formatKey && plan.revision === revision)
  if (!plan || plan.unsupported) throw createError({ statusCode: 404, statusMessage: 'Preview revision not found' })
  const job = await readJob(share.project.id, plan)
  if (!job || job.status !== 'done' || !job.r2_key) throw createError({ statusCode: 404, statusMessage: 'Preview is not ready' })
  return deliverBannerVideo(event, job.r2_key, share.project.id, true)
}
