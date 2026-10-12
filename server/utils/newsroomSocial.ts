import { randomUUID } from 'node:crypto'
import { createError } from 'h3'
import { z } from 'zod'
import { queryOneFresh, transaction } from '~~/server/utils/db'
import { claimAndPublishSocialPost } from '~~/server/utils/socialPublishing/dispatch'
import { canonicalNewsUrl, planNewsSlots, type NewsPostingSlot } from '~~/server/utils/socialNewsAutopostPlan'
import { isNewsroomOwned, NEWSROOM_OWNER, signNewsroomPost, type NewsroomConfig, type NewsroomPost } from '~~/server/utils/newsroomSocialSource'

const identity = { postId: z.string().min(1).max(200), articleId: z.string().min(1).max(200) }
const date = z.string().max(60).refine(value => Number.isFinite(Date.parse(value)), 'Invalid timestamp')
const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('health') }).strict(),
  z.object({ action: z.literal('status'), ...identity }).strict(),
  z.object({ action: z.literal('cancel'), ...identity }).strict(),
  z.object({ action: z.literal('submit'), ...identity, articleUpdatedAt: date,
    body: z.string().trim().min(1).max(10000), link: z.string().refine(value => canonicalNewsUrl(value) === value, 'Canonical DriveAgent link required'),
    imageUrl: z.string().max(2000).nullable().optional().refine((value) => {
      if (!value) return true
      try {
        const url = new URL(value)
        return url.origin === 'https://driveagent.news' && !url.username && !url.password && /^\/api\/news\/(media|artwork)\/[a-zA-Z0-9-]+$/.test(url.pathname) && !url.search && !url.hash
      } catch { return false }
    }, 'DriveAgent image required'),
    mode: z.enum(['now', 'exact', 'next-slot']), scheduledAt: date.nullable().optional(), approvedBy: z.string().min(1).max(200)
  }).strict()
])
type Request = z.infer<typeof schema>
export function parseNewsroomRequest(input: unknown): Request {
  const result = schema.safeParse(input)
  if (!result.success || (result.data.action === 'submit' && result.data.mode === 'exact' && !result.data.scheduledAt)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid newsroom social request' })
  }
  return result.data
}
const conflict = (message: string): never => {
  throw createError({ statusCode: 409, statusMessage: message })
}
function result(post?: NewsroomPost | null) {
  const outcomes = Object.entries(post?.platform_results ?? {}).filter(([key]) => key === 'facebook' || key.startsWith('facebook:')).map(([, value]) => value)
  let status = post?.status ?? 'not_found'
  if (status === 'cancelled') status = 'rejected'
  if (status === 'partially_published' && outcomes.some(value => value.status === 'success')) status = 'published'
  return {
    id: post?.id ?? null, status,
    scheduledAt: post?.scheduled_at ? new Date(post.scheduled_at).toISOString() : null,
    publishedAt: post?.published_at ? new Date(post.published_at).toISOString() : null,
    url: outcomes.find(value => value.status === 'success' && value.url)?.url ?? null,
    error: typeof post?.metadata?.newsroomHold === 'string' ? post.metadata.newsroomHold : outcomes.find(value => value.error)?.error ?? null
  }
}

export async function handleNewsroomSocial(raw: unknown, config: NewsroomConfig, now = new Date()) {
  const request = parseNewsroomRequest(raw)
  if (request.action === 'health') {
    const account = await queryOneFresh('SELECT id FROM social_accounts WHERE id=$1 AND client_id=$2 AND platform=\'facebook\' AND is_active=TRUE', [config.accountId, config.clientId])
    if (!account) throw createError({ statusCode: 503, statusMessage: 'Newsroom Facebook account unavailable' })
    return { ok: true as const }
  }
  const handoff = await transaction(async (db) => {
    // Shared with the existing automatic-news producer; serialize identity and capacity decisions.
    await db.query('SELECT pg_advisory_xact_lock(hashtextextended(\'news-autopost:\' || $1::text, 0))', [config.clientId])
    const rows = (await db.query(`SELECT * FROM social_posts WHERE client_id=$1 AND (
      metadata->>'articleId'=$2 OR metadata->>'newsroomPostId'=$3
      OR metadata->>'newsroomHandoffArticleId'=$2 OR metadata->>'newsroomHandoffPostId'=$3
      OR ($4::text IS NOT NULL AND regexp_replace(split_part(split_part(link_url,'?',1),'#',1), '/$', '')=$4)
    ) AND ('facebook'=ANY(platforms) OR created_by=$5) FOR UPDATE`,
    [config.clientId, request.articleId, request.postId, request.action === 'submit' ? request.link : null, NEWSROOM_OWNER])).rows as NewsroomPost[]
    const owned = rows.filter(isNewsroomOwned)
    if (owned.some(row => row.metadata?.articleId !== request.articleId)) conflict('Newsroom post identity conflict')
    // Published legacy content wins over editable duplicates; never dispatch another copy.
    const live = rows.find(row => ['published', 'partially_published'].includes(row.status ?? '') || row.published_at)
    const existing = live ?? owned[0] ?? rows[0]
    if (request.action === 'status') return { row: existing, dispatch: false }
    if (request.action === 'cancel') {
      if (!existing) conflict('Handoff not found; cancellation cannot be confirmed')
      if (!isNewsroomOwned(existing) || existing.metadata?.newsroomPostId !== request.postId) conflict('Post is not owned by this newsroom approval')
      if (existing.status === 'cancelled') return { row: existing, dispatch: false }
      if (live || existing.status === 'publishing' || (existing.publish_attempts ?? 0) > 0) conflict('Post may have reached Facebook; cancellation cannot be confirmed')
      const cancelled = (await db.query(`UPDATE social_posts SET status='cancelled', scheduled_at=NULL, updated_at=NOW()
        WHERE id=$1 AND client_id=$2 AND created_by=$3 AND status IN ('draft','approved','scheduled','failed')
        AND published_at IS NULL AND publish_attempts=0 RETURNING *`, [existing.id, config.clientId, NEWSROOM_OWNER])).rows[0]
      if (!cancelled) conflict('Post could not be cancelled')
      return { row: cancelled as NewsroomPost, dispatch: false }
    }
    if (live) {
      if (live.status !== 'published' && result(live).status !== 'published') conflict('Existing publication needs Facebook delivery reconciliation')
      if (!isNewsroomOwned(live)) {
        await db.query(`UPDATE social_posts SET metadata=metadata || jsonb_build_object('newsroomHandoffArticleId',$3::text,'newsroomHandoffPostId',$4::text)
          WHERE id=$1 AND client_id=$2 RETURNING *`, [live.id, config.clientId, request.articleId, request.postId])
      }
      return { row: live, dispatch: false }
    }
    if (rows.some(row => !isNewsroomOwned(row))) conflict('Existing XeroFlow article draft requires reconciliation before newsroom approval')
    if (owned.length > 1) conflict('Duplicate newsroom identity requires reconciliation')
    if (existing?.status === 'cancelled') conflict('This article handoff was cancelled and cannot be submitted again')
    if (existing) {
      if (existing.metadata?.newsroomPostId !== request.postId || existing.content !== request.body
        || existing.link_url !== request.link || JSON.stringify(existing.media_urls ?? []) !== JSON.stringify(request.imageUrl ? [request.imageUrl] : [])
        || existing.metadata?.articleUpdatedAt !== request.articleUpdatedAt || existing.metadata?.mode !== request.mode
        || (request.mode === 'exact' && new Date(existing.scheduled_at!).getTime() !== Date.parse(request.scheduledAt!))) conflict('Existing handoff differs; existing approved handoffs cannot be replaced')
      return { row: existing, dispatch: false }
    }
    const account = (await db.query(`SELECT id FROM social_accounts WHERE id=$1 AND client_id=$2 AND platform='facebook' AND is_active=TRUE`, [config.accountId, config.clientId])).rows[0]
    if (!account) throw createError({ statusCode: 503, statusMessage: 'Newsroom Facebook account unavailable' })
    let scheduledAt: string | null = request.mode === 'now' ? now.toISOString() : null
    let timezone = 'Australia/Melbourne'
    if (request.mode === 'exact') {
      if (Date.parse(request.scheduledAt!) <= now.getTime()) conflict('Schedule must be in the future')
      scheduledAt = new Date(request.scheduledAt!).toISOString()
    }
    if (request.mode !== 'now') {
      const slots = (await db.query('SELECT * FROM social_slot_schedules WHERE client_id=$1 AND enabled=TRUE', [config.clientId])).rows as NewsPostingSlot[]
      const occupied = (await db.query(`SELECT scheduled_at FROM social_posts WHERE client_id=$1 AND scheduled_at > $2
        AND status NOT IN ('cancelled') AND ('facebook'=ANY(platforms))`, [config.clientId, now.toISOString()])).rows
      const eligibleSlots = slots.filter(slot => !slot.metadata?.contentKind || ['general', 'news'].includes(String(slot.metadata.contentKind)))
        .map(slot => ({ ...slot, metadata: { ...slot.metadata, contentKind: 'news' } }))
      const available = planNewsSlots(eligibleSlots, occupied, now, 30)
      if (request.mode === 'next-slot') {
        if (!available[0]) conflict('No free saved Facebook slot in the next 30 days')
        scheduledAt = available[0].at
        timezone = available[0].timezone
      } else if (occupied.some(row => new Date(row.scheduled_at).getTime() === Date.parse(scheduledAt!)) && !available.some(slot => slot.at === scheduledAt)) {
        conflict('Requested time is already occupied')
      }
    }
    const row: NewsroomPost = {
      id: randomUUID(), client_id: config.clientId, created_by: NEWSROOM_OWNER,
      content: request.body, link_url: request.link, media_urls: request.imageUrl ? [request.imageUrl] : [],
      platforms: ['facebook'], account_ids: [config.accountId], publish_targets: [{ platform: 'facebook', accountId: config.accountId }],
      platform_overrides: {}, first_comment: null, scheduled_at: scheduledAt, status: 'scheduled',
      metadata: { source: NEWSROOM_OWNER, newsroomPostId: request.postId, articleId: request.articleId,
        articleUpdatedAt: request.articleUpdatedAt, mode: request.mode, approvedBy: request.approvedBy }
    }
    row.metadata!.signature = signNewsroomPost(row, config.secret)
    // jsonb_populate_record keeps the signed values and inserted values identical.
    const saved = (await db.query(`INSERT INTO social_posts(id,client_id,created_by,content,link_url,media_urls,platforms,account_ids,publish_targets,platform_overrides,first_comment,scheduled_at,status,metadata,approved_by,approved_at,timezone)
      SELECT p.id,p.client_id,p.created_by,p.content,p.link_url,p.media_urls,p.platforms,p.account_ids,p.publish_targets,p.platform_overrides,p.first_comment,p.scheduled_at,p.status,p.metadata,$2,NOW(),$3
      FROM jsonb_populate_record(NULL::social_posts,$1::jsonb) p
      RETURNING *`, [JSON.stringify(row), request.approvedBy, timezone])).rows[0]
    if (!saved) conflict('Post changed while approving')
    return { row: saved as NewsroomPost, dispatch: request.mode === 'now' }
  })
  if (handoff.dispatch && handoff.row) {
    await claimAndPublishSocialPost({ postId: handoff.row.id, clientId: config.clientId, claimStatuses: ['scheduled'], scheduledAt: new Date(handoff.row.scheduled_at!).toISOString(), source: 'manual' })
    const current = await queryOneFresh<NewsroomPost>('SELECT * FROM social_posts WHERE id=$1 AND client_id=$2', [handoff.row.id, config.clientId])
    // A missing/failed read after dispatch is uncertain, never a license to send again.
    if (!current) throw createError({ statusCode: 503, statusMessage: 'Delivery status unavailable; reconcile this handoff' })
    return result(current)
  }
  return result(handoff.row)
}
