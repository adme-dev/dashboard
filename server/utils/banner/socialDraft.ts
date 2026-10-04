import { createError, type H3Event } from 'h3'
import type { GodModeTransactionDb } from '~~/server/utils/godMode/transactionCoordinator'
import { requireSocialClientAccess } from '~~/server/utils/social/clientAccess'
import { videoAssetPublicUrl } from '~~/server/utils/video/assetLinks'
import { getAppUrl } from '~~/server/utils/appUrl'

export interface BannerSocialSuggestion { caption?: string, suggestedSchedule?: string }

export function parseBannerSocialSuggestion(value: unknown): BannerSocialSuggestion {
  if (value == null) return {}
  if (typeof value !== 'object' || Array.isArray(value)) throw createError({ statusCode: 400, statusMessage: 'Invalid social suggestion' })
  const input = value as Record<string, unknown>
  const result: BannerSocialSuggestion = {}
  for (const [key, limit] of [['caption', 5000], ['suggestedSchedule', 500]] as const) {
    if (input[key] === undefined) continue
    if (typeof input[key] !== 'string' || input[key].length > limit) throw createError({ statusCode: 400, statusMessage: `Invalid ${key}` })
    result[key] = input[key].trim()
  }
  return result
}

/** Serialize on the render so retries and double clicks always reuse its draft. */
export async function createBannerSocialDraft(event: H3Event, jobId: string, actorId: string, db: GodModeTransactionDb, suggestion: BannerSocialSuggestion = {}) {
  const { rows: [job] } = await db.query(`
    SELECT j.*, p.client_id, p.name FROM banner_render_jobs j
    JOIN banner_projects p ON p.id = j.project_id WHERE j.id = $1 FOR UPDATE OF j, p`, [jobId])
  if (!job) throw createError({ statusCode: 404, statusMessage: 'Banner render not found' })
  if (!job.client_id) throw createError({ statusCode: 409, statusMessage: 'Assign a client to this banner before creating a social draft.' })
  await requireSocialClientAccess(event, job.client_id)
  if (job.status !== 'done' || !job.r2_key || !job.r2_key.startsWith(`banner-videos/${job.project_id}/`) || !/^banner-videos\/[0-9a-f-]{36}\/[A-Za-z0-9][A-Za-z0-9._-]{0,191}\.mp4$/i.test(job.r2_key)) {
    throw createError({ statusCode: 409, statusMessage: 'Finish the MP4 export before creating a social draft.' })
  }
  const { rows: [existing] } = await db.query(`
    SELECT id, client_id FROM social_posts
    WHERE metadata->>'source' = 'banner_studio' AND metadata->>'renderJobId' = $1 LIMIT 1`, [jobId])
  if (existing) {
    if (existing.client_id !== job.client_id) throw createError({ statusCode: 409, statusMessage: 'This export already belongs to a different client. Create a new export.' })
    return { id: existing.id, postId: existing.id, clientId: job.client_id }
  }
  const bucket = event.context.cloudflare?.env?.MEDIA_BUCKET
  if (!bucket) throw createError({ statusCode: 503, statusMessage: 'Banner video storage is unavailable' })
  const object = await bucket.head(job.r2_key)
  if (!object?.size) throw createError({ statusCode: 409, statusMessage: 'The exported video is missing. Export the banner again.' })
  const assetId = crypto.randomUUID()
  const mediaUrl = await videoAssetPublicUrl(assetId, getAppUrl(event))
  const width = job.width * job.quality
  const height = job.height * job.quality
  const gcd = (a: number, b: number): number => b ? gcd(b, a % b) : a
  const divisor = gcd(width, height)
  const format = `${width / divisor}:${height / divisor}`
  await db.query(`INSERT INTO video_assets
    (id,client_id,created_by,title,source_project_id,source_job_id,r2_key,format,width,height)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
  [assetId, job.client_id, actorId, job.name, job.project_id, job.id, job.r2_key, format, width, height])
  const metadata = { source: 'banner_studio', projectId: job.project_id, renderJobId: job.id, assetId, formatKey: job.format_key, width, height, ...(suggestion.suggestedSchedule ? { bannerSuggestedSchedule: suggestion.suggestedSchedule } : {}) }
  const { rows: [post] } = await db.query(`INSERT INTO social_posts
    (client_id,created_by,content,media_urls,platforms,tags,status,metadata)
    VALUES ($1,$2,$5,$3,ARRAY['facebook'],ARRAY[]::text[],'draft',$4::jsonb) RETURNING id`,
  [job.client_id, actorId, [mediaUrl], JSON.stringify(metadata), suggestion.caption || ''])
  if (!post) throw new Error('Social draft was not created')
  // Fail closed: attribution and the draft commit together.
  await db.query(`INSERT INTO social_publishing_audit_events(client_id,post_id,actor_id,action,metadata)
    VALUES ($1,$2,$3,'post_created',$4::jsonb)`, [job.client_id, post.id, actorId, JSON.stringify(metadata)])
  return { id: post.id, postId: post.id, clientId: job.client_id }
}
