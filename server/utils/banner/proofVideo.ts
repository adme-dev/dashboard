import { createHash } from 'node:crypto'
import { createError, type H3Event } from 'h3'
import { queryOneFresh, queryRowsFresh } from '~~/server/utils/db'
import { requireWriteAccess } from '~~/server/utils/auth'
import { teamBannerPreviewAccess } from './teamPreview'
import { bannerShareVideoPlans, bannerProofSourceKey, bannerProofSourcePattern } from './shareVideo'
import { videoFormatFor } from '~~/server/utils/audio/videoProfiles'

type Plan = ReturnType<typeof bannerShareVideoPlans>[number]
type Candidate = { jobId: string, projectId: string, title: string, clientId: string, createdAt: string, variants: Record<string, string>, state: Record<string, unknown> }
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}'

/** Only a full-frame companion of this exact banner size is eligible. */
export function matchesProofArtwork(state: Record<string, unknown>, bannerId: string, plan: Plan): boolean {
  if (state.width !== plan.width || state.height !== plan.height || state.duration_sec !== plan.duration || !Array.isArray(state.tracks)) return false
  const visuals = state.tracks.filter(track => ['video', 'overlay', 'caption'].includes(track.kind) && track.clips?.length)
  if (visuals.length !== 1 || visuals[0].kind !== 'overlay' || visuals[0].muted || visuals[0].hidden || visuals[0].clips.length !== 1) return false
  const clip = visuals[0].clips[0]
  return clip.type === 'overlay' && clip.gsap_project_id === bannerId && clip.gsap_format_key === plan.key
    && clip.timeline_start_sec === 0 && clip.duration_sec === plan.duration && clip.placement == null && (clip.opacity ?? 1) === 1
}

async function sources(event: H3Event) {
  const share = await teamBannerPreviewAccess(event).load()
  const plans = bannerShareVideoPlans(share).filter(plan => plan.canAttachVideo)
  if (!share.project.clientId || !plans.length) return { share, items: [] }
  // Compare immutable render input with the current AV edit; a stale render is not offered.
  const rows = await queryRowsFresh<Candidate>(`SELECT j.id AS "jobId", p.id AS "projectId", p.title,
    p.client_id AS "clientId", j.created_at AS "createdAt", j.variants, t.state
    FROM media_render_jobs j JOIN media_projects p ON p.id = j.project_id
    JOIN media_timelines t ON t.id = j.timeline_id
    JOIN media_timelines draft ON draft.id = p.current_timeline_id
    WHERE p.client_id = $1 AND p.media_type = 'av' AND j.status = 'done' AND t.state = draft.state
    ORDER BY j.created_at DESC LIMIT 100`, [share.project.clientId])
  const items = rows.flatMap((row) => {
    if (row.clientId !== share.project.clientId) return []
    return plans.flatMap((plan) => {
      if (!matchesProofArtwork(row.state, share.project.id, plan)) return []
      return Object.entries(row.variants ?? {}).flatMap(([format, key]) => {
        const profile = videoFormatFor(format)
        const path = new RegExp(`^media/${row.projectId}/${row.jobId}/(?:${UUID}/)?${format}\\.mp4$`, 'i')
        if (!profile || profile.width !== plan.width || profile.height !== plan.height || !path.test(key)) return []
        return [{ ...row, plan, format, key, id: `${row.jobId}:${format}` }]
      })
    })
  })
  return { share, items }
}

export async function bannerProofVideoOptions(event: H3Event) {
  const { share, items } = await sources(event)
  const plans = bannerShareVideoPlans(share).filter(plan => plan.canAttachVideo)
  const jobs = plans.length ? await queryRowsFresh<{ id: string }>(`SELECT id FROM banner_render_jobs WHERE project_id = $1 AND status = 'done' AND id = ANY($2::uuid[]) AND source_r2_key ~ ('^banner-render-jobs/' || id::text || '/video-studio(-[a-f0-9]{16})?\\.json$')`, [share.project.id, plans.map(plan => plan.id)]) : []
  const options = items.map(item => ({ id: item.id, formatKey: item.plan.key, revision: item.plan.revision,
    title: item.title, createdAt: item.createdAt, duration: item.plan.duration,
    previewUrl: `/api/agency/audio/projects/${item.projectId}/renders/${item.jobId}/${item.format}` }))
  return { options, required: plans.length > 0, ready: plans.every(plan => jobs.some(job => job.id === plan.id)) }
}

type ObjectInfo = { size: number, httpEtag: string, httpMetadata?: { contentType?: string }, body?: ReadableStream }
type ProofBucket = { head: (key: string) => Promise<ObjectInfo | null>, get: (key: string) => Promise<ObjectInfo | null>, put: (key: string, body: ReadableStream | Uint8Array, options: { httpMetadata: { contentType: string } }) => Promise<unknown> }

export async function attachBannerProofVideo(event: H3Event, input: { id: string, revision: string }) {
  const actor = await requireWriteAccess(event)
  const { share, items } = await sources(event)
  const item = items.find(item => item.id === input.id && item.plan.revision === input.revision)
  if (!item) throw createError({ statusCode: 409, statusMessage: 'The artwork or rendered video changed. Reload and choose a current render.' })
  const bucket = event.context.cloudflare?.env?.MEDIA_BUCKET as unknown as ProofBucket | undefined
  if (!bucket?.head || !bucket.get || !bucket.put) throw createError({ statusCode: 503, statusMessage: 'Video storage unavailable' })
  const source = await bucket.head(item.key)
  if (!source || !Number.isSafeInteger(source.size) || source.size <= 0 || source.size > 128 * 1024 * 1024
    || source.httpMetadata?.contentType !== 'video/mp4' || !source.httpEtag) throw createError({ statusCode: 422, statusMessage: 'The rendered MP4 is unavailable or too large.' })
  const object = await bucket.get(item.key)
  if (!object?.body || object.size !== source.size || object.httpEtag !== source.httpEtag) throw createError({ statusCode: 409, statusMessage: 'Rendered video changed. Try again.' })
  const fingerprint = createHash('sha256').update(item.key + source.httpEtag).digest('hex').slice(0, 16)
  const key = `banner-videos/${share.project.id}/${item.plan.id}-studio-${fingerprint}.mp4`
  await bucket.put(key, object.body, { httpMetadata: { contentType: 'video/mp4' } })
  const stored = await bucket.head(key)
  if (!stored || stored.size !== source.size) throw createError({ statusCode: 503, statusMessage: 'Proof video could not be verified' })
  // Re-authorize and pin the current saved content immediately before publication.
  const refreshed = await sources(event)
  const current = refreshed.share
  if (!refreshed.items.some(source => source.id === item.id && source.key === item.key && source.plan.revision === item.plan.revision) || current.project.clientId !== share.project.clientId || !bannerShareVideoPlans(current).some(plan => plan.revision === item.plan.revision)) {
    throw createError({ statusCode: 409, statusMessage: 'Artwork changed. Reload before selecting a proof video.' })
  }
  const manifest = new TextEncoder().encode(JSON.stringify({ version: 1, bannerId: share.project.id, revision: item.plan.revision,
    mediaProjectId: item.projectId, jobId: item.jobId, format: item.format, sourceKey: item.key, etag: source.httpEtag, size: source.size, attachedBy: actor.id, attachedAt: new Date().toISOString() }))
  const marker = bannerProofSourceKey(item.plan.id, fingerprint)
  await bucket.put(marker, manifest, { httpMetadata: { contentType: 'application/json' } })
  const owner = await queryOneFresh<{ created_by: string }>('SELECT created_by FROM banner_projects WHERE id = $1', [share.project.id])
  if (!owner) throw createError({ statusCode: 404, statusMessage: 'Artwork unavailable' })
  const row = await queryOneFresh(`INSERT INTO banner_render_jobs
    (id, project_id, format_key, width, height, fps, crf, quality, source_r2_key, created_by, status, r2_key)
    VALUES ($1,$2,$3,$4,$5,30,20,1,$6,$7,'done',$8)
    ON CONFLICT (id) DO UPDATE SET r2_key = EXCLUDED.r2_key, status = 'done', updated_at = now()
    WHERE banner_render_jobs.project_id = EXCLUDED.project_id AND banner_render_jobs.source_r2_key ~ $9
    RETURNING id`, [item.plan.id, share.project.id, item.plan.key, item.plan.width, item.plan.height, marker, owner.created_by, key, bannerProofSourcePattern(item.plan.id)])
  if (!row) throw createError({ statusCode: 409, statusMessage: 'Another proof is being prepared. Reload and try again.' })
  return { formatKey: item.plan.key, revision: item.plan.revision }
}
