import { queryRowsFresh } from '~~/server/utils/db'
import { requireDepartmentBrowserReviewScope, getDepartmentBrowserSocialPost } from '~~/server/utils/ai/marketing/departmentReviewOperations'
import { resolveEffectiveSocialTargets } from '~~/server/utils/socialPublishing/effectivePayload'

interface ApprovalRow {
  id: string
  client_id: string
  created_by: string | null
  review_policy: string | null
  current_revision: Record<string, any> | null
  current_snapshot?: Record<string, any> | null
  [key: string]: unknown
}

interface DestinationAccountRow {
  id: string
  client_id: string
  platform: string
  platform_account_id: string
  account_name: string | null
  is_active: boolean | null
  linkedin_author_type: string | null
}

/**
 * GET /api/agency/social/publishing/approvals?clientId=
 * Posts awaiting approval (requested, not yet approved). clientId optional.
 *
 * Each row carries its current submitted revision (number, hash, exact targets, reviewed media identity,
 * expiry) and a `review` hint. A reviewer never sees their own delegated submissions — they cannot
 * decide them. The hint is advisory: approve/reject re-check fresh authority server-side.
 */
export default defineEventHandler(async (event) => {
  const clientId = getQuery(event).clientId as string | undefined
  const { user, departmentContext } = await requireDepartmentBrowserReviewScope(event, clientId)
  const params: any[] = [user?.id ?? null]
  let sql = `SELECT p.*,
                    (SELECT to_jsonb(r) - 'snapshot' || jsonb_build_object(
                              'targets', r.snapshot->'targets',
                              'media', r.snapshot->'media',
                              'schedule', r.snapshot->'schedule')
                       FROM social_post_revisions r
                      WHERE r.id = p.current_revision_id AND r.post_id = p.id AND r.client_id = p.client_id) AS current_revision,
                    (SELECT r.snapshot
                       FROM social_post_revisions r
                      WHERE r.id = p.current_revision_id AND r.post_id = p.id AND r.client_id = p.client_id) AS current_snapshot
               FROM social_posts p
              WHERE p.approval_requested_at IS NOT NULL AND p.approved_at IS NULL
                AND p.status NOT IN ('cancelled','published')
                AND NOT (p.review_policy = 'delegated_marketing' AND (
                  COALESCE(p.created_by = $1::text, FALSE) OR COALESCE(p.approval_requested_by = $1::text, FALSE)
                ))`
  if (departmentContext) {
    sql += ` AND p.review_policy='delegated_marketing'
      AND EXISTS (SELECT 1 FROM agency_clients c WHERE c.id=p.client_id AND c.is_active=TRUE)
      AND EXISTS (SELECT 1 FROM social_post_revisions r WHERE r.id=p.current_revision_id AND r.post_id=p.id AND r.client_id=p.client_id AND r.requested_by<>$1)`
    if (departmentContext.assistantScope?.clientAccessMode !== 'all_active') {
      params.push(departmentContext.assistantScope?.assignedClientIds ?? [])
      sql += ` AND p.client_id=ANY($${params.length}::uuid[])`
    }
  }
  if (clientId) {
    params.push(clientId)
    sql += ` AND p.client_id = $${params.length}`
  }
  sql += ` ORDER BY p.approval_requested_at ASC`
  let rows = await queryRowsFresh<ApprovalRow>(sql, params)
  if (departmentContext) {
    const authorized: ApprovalRow[] = []
    for (const row of rows) {
      try {
        await getDepartmentBrowserSocialPost(departmentContext, row.id)
        authorized.push(row)
      } catch (error) {
        if (![403, 404].includes((error as { statusCode: number }).statusCode)) throw error
      }
    }
    rows = authorized
  }
  // Advisory only; decisions re-resolve independent reviewer authority.
  const isAdmin = !!departmentContext || ['owner', 'admin'].includes(user?.role ?? '') || !!user?.permissionGroups?.includes('ADMIN')
  const destinations = await destinationAccounts(rows)

  return await Promise.all(rows.map(async ({ current_snapshot: snapshot, ...row }) => {
    const delegated = row.review_policy === 'delegated_marketing'
    const revision = row.current_revision
    const expired = revision?.expires_at ? Date.parse(String(revision.expires_at)) <= Date.now() : false
    const pending = revision?.review_status === 'pending'
    const blockedReason = !delegated
      ? null
      : !revision || !pending
          ? 'The submitted revision is no longer pending. Ask the requester to resubmit.'
          : expired
            ? 'This review request expired. Ask the requester to resubmit.'
            : !isAdmin
                ? 'Delegated marketing work requires an independent admin or marketing manager.'
                : null
    return {
      ...row,
      media_previews: delegated ? await previewMedia(event, row) : [],
      effective_targets: delegated && snapshot ? effectiveTargets(row, snapshot, destinations) : [],
      review: {
        policy: delegated ? 'delegated_marketing' : 'legacy',
        independentReviewRequired: delegated,
        revisionId: revision?.id ?? null,
        canDecide: !blockedReason,
        blockedReason
      }
    }
  }))
})

/**
 * Display identity of every reviewed destination, read uncached and only for accounts that belong to the
 * row's own client. Names and public platform ids only — never tokens or other credential columns.
 */
async function destinationAccounts(rows: ApprovalRow[]): Promise<Map<string, DestinationAccountRow>> {
  const accountIds = new Set<string>()
  const clientIds = new Set<string>()
  for (const row of rows) {
    const targets = Array.isArray(row.current_revision?.targets) ? row.current_revision!.targets : []
    for (const target of targets) if (typeof target?.accountId === 'string') accountIds.add(target.accountId)
    clientIds.add(row.client_id)
  }
  if (!accountIds.size) return new Map()
  const accounts = await queryRowsFresh<DestinationAccountRow>(
    `SELECT id, client_id, platform, platform_account_id, account_name, is_active,
            metadata->>'linkedinAuthorType' AS linkedin_author_type
       FROM social_accounts
      WHERE id = ANY($1::uuid[]) AND client_id = ANY($2::uuid[])`,
    [[...accountIds], [...clientIds]]
  )
  return new Map(accounts.map(account => [`${account.client_id}:${account.id}`, account]))
}

/**
 * The exact per-destination payload the reviewer authorizes: account identity, publishing mode, the
 * effective options (target options over platform-override options) and the delivered copy, resolved by
 * the same helper submission validation and dispatch use.
 */
function effectiveTargets(row: ApprovalRow, snapshot: Record<string, any>, destinations: Map<string, DestinationAccountRow>) {
  const media = Array.isArray(snapshot.media) ? snapshot.media : []
  return resolveEffectiveSocialTargets({
    postId: row.id,
    content: snapshot.content,
    linkUrl: snapshot.linkUrl,
    hashtags: snapshot.hashtags,
    firstComment: snapshot.firstComment,
    targets: snapshot.targets,
    platformOverrides: snapshot.platformOverrides
  }, media).map((target) => {
    const account = destinations.get(`${row.client_id}:${target.accountId}`)
    const sameDestination = account && account.platform === target.platform
    return {
      key: target.key,
      platform: target.platform,
      accountId: target.accountId,
      account: sameDestination
        ? {
            name: account.account_name,
            platformAccountId: account.platform_account_id,
            connected: account.is_active !== false,
            ...(target.platform === 'linkedin'
              ? { authorType: account.linkedin_author_type === 'person' ? 'person' : 'organization' }
              : {})
          }
        : null,
      mode: target.mode,
      content: target.content,
      link: target.link,
      hashtags: target.hashtags,
      firstComment: target.firstComment,
      options: target.options,
      notes: target.notes
    }
  })
}

/** Short-lived, content-pinned previews of exactly the reviewed media (never stored, never logged). */
async function previewMedia(event: Parameters<typeof getQuery>[0], row: ApprovalRow) {
  const media = Array.isArray(row.current_revision?.media) ? row.current_revision!.media : []
  if (!media.length) return []
  try {
    const { socialMediaDeliveryUrl } = await import('~~/server/utils/socialPublishing/mediaAssets')
    return await Promise.all(media.map(async (identity: any) => ({
      kind: identity.kind,
      id: identity.id,
      mediaType: identity.mediaType,
      url: await socialMediaDeliveryUrl(event, row.client_id, identity, 15 * 60)
    })))
  } catch {
    return media.map((identity: any) => ({ kind: identity.kind, id: identity.id, mediaType: identity.mediaType, url: null }))
  }
}
