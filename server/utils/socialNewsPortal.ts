import { createError } from 'h3'
import { isUUID } from '~~/server/utils/ids'
import { classifySocialPublishingAccountHealth } from '~~/server/utils/socialPublishing/accountHealth'

type DbRow = Record<string, unknown>
type QueryResult = { rows?: DbRow[] }

export interface PortalSocialNewsDb {
  queryRows<T = DbRow>(sql: string, params?: unknown[]): Promise<T[]>
  transaction<T>(callback: (client: { query(sql: string, params?: unknown[]): Promise<QueryResult> }) => Promise<T>): Promise<T>
}

export type PortalSocialNewsAction = 'approve' | 'reject' | 'request_changes'

interface PortalSocialNewsListFilters {
  status?: string
  postId?: string
  limit?: number
}

interface PortalSocialNewsActionInput {
  clientId: string
  clientUserId: string
  postId: string
  action: PortalSocialNewsAction
  feedback: string | null
}

const CLIENT_APPROVAL_STATUSES = new Set(['pending', 'approved', 'rejected', 'revision_requested'])

function objectValue(value: unknown): DbRow {
  if (!value) return {}
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
    } catch {
      return {}
    }
  }
  return typeof value === 'object' && !Array.isArray(value) ? value as DbRow : {}
}

function arrayValue<T = unknown>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[]
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? parsed as T[] : []
    } catch {
      return []
    }
  }
  return []
}

function safeHttpUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value) return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null
  } catch {
    return null
  }
}

export async function listPortalSocialNewsDrafts(
  db: PortalSocialNewsDb,
  clientId: string,
  filters: PortalSocialNewsListFilters = {}
) {
  const conditions = [
    'p.client_id = $1',
    'p.metadata->>\'source\' = \'mcp_news\'',
    'p.approval_requested_at IS NOT NULL',
    'p.client_approval_status IS NOT NULL'
  ]
  const params: unknown[] = [clientId]

  if (filters.postId) {
    params.push(filters.postId)
    conditions.push(`p.id = $${params.length}`)
  }
  if (filters.status && filters.status !== 'all') {
    if (!CLIENT_APPROVAL_STATUSES.has(filters.status)) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid approval status' })
    }
    params.push(filters.status)
    conditions.push(`p.client_approval_status = $${params.length}`)
  }

  const limit = Math.min(Math.max(Number(filters.limit) || 50, 1), 100)
  params.push(limit)

  const rows = await db.queryRows<DbRow>(
    `SELECT
       p.id, p.content, p.media_urls, p.platforms, p.platform_overrides,
       p.scheduled_at, p.timezone, p.status AS internal_status,
       p.approval_requested_at, p.due_at,
       p.client_approval_status, p.client_approval_responded_at,
       p.client_approval_feedback, responder.name AS client_approval_responded_by,
       COALESCE(p.metadata->'newsAttribution'->>'title', n.title) AS source_title,
       COALESCE(p.metadata->'newsAttribution'->>'url', n.source_url) AS source_url,
       COALESCE(p.metadata->'newsAttribution'->>'author', n.author) AS source_author,
       COALESCE(p.metadata->'newsAttribution'->>'publishedAt', n.published_at::text) AS source_published_at,
       COALESCE((
         SELECT jsonb_agg(jsonb_build_object(
           'id', sa.id,
           'platform', sa.platform,
           'name', COALESCE(sa.account_name, INITCAP(sa.platform))
         ) ORDER BY sa.platform, sa.account_name)
           FROM social_accounts sa
          WHERE sa.client_id = p.client_id
            AND sa.id = ANY(COALESCE(p.account_ids, '{}'::uuid[]))
       ), '[]'::jsonb) AS target_accounts,
       package.name AS package_name, version.version AS package_version,
       COALESCE(assignment.commercial_scope_snapshot, version.commercial_scope, '{}'::jsonb) AS commercial_scope,
       COALESCE((
         SELECT jsonb_object_agg(platform_usage.platform, platform_usage.used)
           FROM (
             SELECT platform,
                    (SELECT COUNT(*)::int
                       FROM social_posts usage
                      WHERE usage.client_id = p.client_id
                        AND usage.status NOT IN ('cancelled')
                        AND platform = ANY(usage.platforms)
                        AND usage.metadata->>'socialPackageAssignmentId' = assignment.id::text) AS used
               FROM unnest(p.platforms) AS platform
           ) platform_usage
       ), '{}'::jsonb) AS package_usage,
       COALESCE(p.metadata->'packageUsageWarnings', '[]'::jsonb) AS package_warnings,
       COALESCE((
         SELECT jsonb_agg(jsonb_build_object(
           'action', audit.action,
           'createdAt', audit.created_at,
           'actorType', CASE WHEN audit.actor_id LIKE 'client:%' THEN 'client' ELSE 'agency' END
         ) ORDER BY audit.created_at)
           FROM social_publishing_audit_events audit
          WHERE audit.post_id = p.id AND audit.client_id = p.client_id
       ), '[]'::jsonb) AS audit_events
     FROM social_posts p
     LEFT JOIN social_news_items n ON n.id::text = p.metadata->>'newsItemId'
     LEFT JOIN client_users responder
       ON responder.id::text = NULLIF(p.client_approval_responded_by, '')
      AND responder.client_id = p.client_id
     LEFT JOIN social_content_package_assignments assignment
       ON assignment.id::text = p.metadata->>'socialPackageAssignmentId'
      AND assignment.client_id = p.client_id
     LEFT JOIN social_content_package_versions version ON version.id = assignment.package_version_id
     LEFT JOIN social_content_packages package ON package.id = version.package_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY CASE p.client_approval_status WHEN 'pending' THEN 0 ELSE 1 END,
              p.due_at ASC NULLS LAST, p.approval_requested_at DESC
     LIMIT $${params.length}`,
    params
  )

  const drafts = rows.map((row) => {
    const platforms = arrayValue<string>(row.platforms)
    const overrides = objectValue(row.platform_overrides)
    const commercialScope = objectValue(row.commercial_scope)
    return {
      id: row.id,
      content: row.content || '',
      mediaUrls: arrayValue<string>(row.media_urls),
      platformPreviews: platforms.map((platform) => {
        const override = objectValue(overrides[platform])
        return {
          platform,
          content: typeof override.content === 'string' ? override.content : row.content || '',
          mediaUrls: arrayValue<string>(override.mediaUrls).length
            ? arrayValue<string>(override.mediaUrls)
            : arrayValue<string>(row.media_urls),
          isAiRewrite: typeof override.content === 'string'
        }
      }),
      source: {
        title: row.source_title || 'News source',
        url: safeHttpUrl(row.source_url),
        author: row.source_author || null,
        publishedAt: row.source_published_at || null,
        attributionLocked: true
      },
      targetAccounts: arrayValue<{ id: string, platform: string, name: string }>(row.target_accounts),
      scheduledAt: row.scheduled_at || null,
      timezone: row.timezone,
      approval: {
        status: row.client_approval_status,
        requestedAt: row.approval_requested_at,
        dueAt: row.due_at || null,
        respondedAt: row.client_approval_responded_at || null,
        respondedBy: row.client_approval_responded_by || null,
        feedback: row.client_approval_feedback || null,
        internalStatus: row.internal_status
      },
      package: row.package_name
        ? {
            name: row.package_name,
            version: Number(row.package_version),
            includedPostVolumes: objectValue(commercialScope.includedPostVolumes),
            approvalSlaHours: Number.isFinite(Number(commercialScope.approvalSlaHours))
              ? Number(commercialScope.approvalSlaHours)
              : null,
            overagePolicy: commercialScope.overagePolicy || 'warn',
            usageByPlatform: objectValue(row.package_usage),
            warnings: arrayValue<string>(row.package_warnings)
          }
        : null,
      audit: arrayValue(row.audit_events)
    }
  })

  return {
    drafts,
    summary: {
      total: drafts.length,
      pending: drafts.filter(draft => draft.approval.status === 'pending').length,
      approved: drafts.filter(draft => draft.approval.status === 'approved').length,
      rejected: drafts.filter(draft => draft.approval.status === 'rejected').length,
      revisionRequested: drafts.filter(draft => draft.approval.status === 'revision_requested').length
    }
  }
}

export async function respondToPortalSocialNewsDraft(
  db: PortalSocialNewsDb,
  input: PortalSocialNewsActionInput
) {
  const feedback = typeof input.feedback === 'string' ? input.feedback.trim().slice(0, 4_000) : ''
  if ((input.action === 'reject' || input.action === 'request_changes') && !feedback) {
    throw createError({ statusCode: 400, statusMessage: 'Feedback is required for this action' })
  }

  const statusByAction = {
    approve: 'approved',
    reject: 'rejected',
    request_changes: 'revision_requested'
  } as const
  const status = statusByAction[input.action]
  if (!status) throw createError({ statusCode: 400, statusMessage: 'Invalid approval action' })

  return db.transaction(async (client) => {
    const ownedResult = await client.query(
      `SELECT p.id, p.client_id, p.status, p.approved_at, p.client_approval_status,
              p.account_ids, p.platforms, p.metadata
         FROM social_posts p
        WHERE p.id = $1 AND p.client_id = $2
          AND p.metadata->>'source' = 'mcp_news'
          AND p.approval_requested_at IS NOT NULL
        FOR UPDATE`,
      [input.postId, input.clientId]
    )
    const post = ownedResult.rows?.[0]
    if (!post) throw createError({ statusCode: 404, statusMessage: 'News draft not found' })
    if (post.status !== 'draft' || post.approved_at || post.client_approval_status !== 'pending') {
      throw createError({ statusCode: 409, statusMessage: 'News draft is no longer awaiting client approval' })
    }

    const metadata = objectValue(post.metadata)
    const newsItemId = typeof metadata.newsItemId === 'string' ? metadata.newsItemId : ''
    if (!isUUID(newsItemId)) {
      throw createError({ statusCode: 409, statusMessage: 'News draft provenance is invalid' })
    }

    const accountIds = arrayValue<string>(post.account_ids)
    const platforms = new Set(arrayValue<string>(post.platforms))
    if (!accountIds.length) {
      throw createError({ statusCode: 409, statusMessage: 'News draft has no publishing targets' })
    }
    const accountResult = await client.query(
      `SELECT id, platform, is_active, last_error, token_expires_at, metadata,
              (NULLIF(refresh_token, '') IS NOT NULL) AS has_refresh_token
         FROM social_accounts
        WHERE id = ANY($1::uuid[]) AND client_id = $2`,
      [accountIds, input.clientId]
    )
    const accounts = accountResult.rows || []
    const invalidAccount = accounts.some((account) => {
      if (typeof account.platform !== 'string' || !platforms.has(account.platform)) return true
      const health = classifySocialPublishingAccountHealth({
        platform: account.platform,
        isActive: account.is_active !== false,
        lastError: typeof account.last_error === 'string' ? account.last_error : null,
        tokenExpiresAt: typeof account.token_expires_at === 'string' ? account.token_expires_at : null,
        hasRefreshToken: Boolean(account.has_refresh_token),
        metadata: objectValue(account.metadata)
      })
      return health.requiresReconnect || health.health === 'disconnected'
    })
    if (accounts.length !== new Set(accountIds).size || invalidAccount) {
      throw createError({ statusCode: 409, statusMessage: 'News draft publishing targets are no longer valid' })
    }

    const assignmentId = typeof metadata.socialPackageAssignmentId === 'string'
      ? metadata.socialPackageAssignmentId
      : null
    if (assignmentId) {
      if (!isUUID(assignmentId)) {
        throw createError({ statusCode: 409, statusMessage: 'News draft package reference is invalid' })
      }
      const packageResult = await client.query(
        `SELECT id, commercial_scope_snapshot
           FROM social_content_package_assignments
          WHERE id = $1::uuid AND client_id = $2 AND status = 'active'
            AND starts_on <= CURRENT_DATE AND (ends_on IS NULL OR ends_on >= CURRENT_DATE)`,
        [assignmentId, input.clientId]
      )
      const assignment = packageResult.rows?.[0]
      if (!assignment) {
        throw createError({ statusCode: 409, statusMessage: 'News draft package is no longer active' })
      }
      const scope = objectValue(assignment.commercial_scope_snapshot)
      const included = objectValue(scope.includedPostVolumes)
      const policy = scope.overagePolicy || 'warn'
      if (input.action === 'approve' && (policy === 'block' || policy === 'quote-before-work')) {
        const usageResult = await client.query(
          `SELECT platform, COUNT(*)::int AS used
             FROM unnest($1::text[]) platform
             JOIN social_posts usage
               ON usage.client_id = $2
              AND usage.status NOT IN ('cancelled')
              AND platform = ANY(usage.platforms)
              AND usage.metadata->>'socialPackageAssignmentId' = $3
            GROUP BY platform`,
          [Array.from(platforms), input.clientId, assignmentId]
        )
        for (const usage of usageResult.rows || []) {
          const platform = String(usage.platform || '')
          const limit = Number(included[platform])
          if (Number.isFinite(limit) && Number(usage.used) > limit) {
            throw createError({
              statusCode: 409,
              statusMessage: policy === 'block'
                ? `Package volume limit reached for ${platform}`
                : `Package requires a quote before approval for ${platform}`
            })
          }
        }
      }
    }

    const updateResult = await client.query(
      `UPDATE social_posts
          SET client_approval_status = $1,
              client_approval_responded_by = $2,
              client_approval_responded_at = NOW(),
              client_approval_feedback = $3,
              updated_at = NOW()
        WHERE id = $4 AND client_id = $5 AND client_approval_status = 'pending'
        RETURNING id, client_approval_status`,
      [status, input.clientUserId, feedback || null, input.postId, input.clientId]
    )
    if (!updateResult.rows?.[0]) {
      throw createError({ statusCode: 409, statusMessage: 'News draft approval changed before this response' })
    }

    const actorId = `client:${input.clientUserId}`
    const auditMetadata = JSON.stringify({ source: 'client_portal', hasFeedback: Boolean(feedback), feedback: feedback || undefined })
    await client.query(
      `INSERT INTO social_publishing_audit_events
         (client_id, post_id, actor_id, action, metadata)
       VALUES ($1,$2,$3,$4,$5::jsonb)`,
      [input.clientId, input.postId, actorId, `client_approval_${status}`, auditMetadata]
    )
    await client.query(
      `INSERT INTO social_news_feedback_events
         (client_id, news_item_id, post_id, actor_id, event_type, metadata)
       VALUES ($1,$2::uuid,$3,$4,$5,$6::jsonb)`,
      [input.clientId, newsItemId, input.postId, actorId, status, auditMetadata]
    )
    await client.query(
      `INSERT INTO client_activity_log
         (client_user_id, client_id, action, entity_type, entity_id, details)
       VALUES ($1,$2,$3,'social_post',$4,$5::jsonb)`,
      [input.clientUserId, input.clientId, `social_news_approval_${status}`, input.postId, auditMetadata]
    )

    return { ok: true, status }
  })
}
