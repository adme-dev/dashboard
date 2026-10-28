import { createError, type H3Event } from 'h3'
import { z } from 'zod'
import { queryOneFresh, queryRowsFresh, transaction } from '~~/server/utils/db'
import type { ToolContext } from '../toolContext'
import { isMarketingManagementContext } from '~~/server/utils/marketingManagement'
import type { SocialPostReviewRow, SocialRevisionRow } from '~~/server/utils/socialPublishing/revisions'
import type { PublishTargetResult } from '~~/server/utils/socialPublishing'

import { departmentReviewContracts, type DepartmentReviewToolName } from './departmentReviewSchemas'

const uuid = z.string().uuid()

function deny(message: string): never {
  throw createError({ statusCode: 403, statusMessage: message })
}
function conflict(message: string): never {
  throw createError({ statusCode: 409, statusMessage: message })
}
async function clientAccess(ctx: ToolContext, clientId: string) {
  const { freshContextCoversClient } = await import('./reviewAuthority')
  if (!await freshContextCoversClient(ctx, clientId)) deny('Review outside current active client scope')
}

/** Browser authority is independent of OAuth. Existing role paths remain unchanged. */
export async function requireDepartmentBrowserReviewer(event: H3Event, roles: readonly string[]) {
  const auth = await import('~~/server/utils/auth')
  let user
  let legacyRoleAuthorized = false
  try {
    user = await auth.requireRole(event, roles)
    legacyRoleAuthorized = true
    if (!user.permissionGroups?.includes('MARKETING_MANAGEMENT')) return { user, departmentContext: null, legacyRoleAuthorized }
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode !== 403) throw error
    user = await auth.requireAuth(event)
  }
  const { resolveMcpStaffContext } = await import('../mcp/staffAuthority')
  const ctx = await resolveMcpStaffContext(event, user.id, [])
  if (!isMarketingManagementContext(ctx) || ctx.assistantReadOnly) deny('Marketing reviewer authority required')
  return { user, departmentContext: ctx, legacyRoleAuthorized }
}

/** Preserve legacy social reads; the dedicated path scopes every query to active peer revisions. */
export async function requireDepartmentBrowserReviewScope(event: H3Event, clientId?: string) {
  const { requireSocialClientScope } = await import('~~/server/utils/social/clientAccess')
  let user
  let legacyDenial: unknown
  try {
    user = await requireSocialClientScope(event, clientId)
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode !== 403) throw error
    legacyDenial = error
  }
  if (!legacyDenial && !user?.permissionGroups?.includes('MARKETING_MANAGEMENT')) return { user, departmentContext: null }
  const result = await requireDepartmentBrowserReviewer(event, [])
  if (!result.departmentContext) throw legacyDenial ?? createError({ statusCode: 403, statusMessage: 'Marketing reviewer authority required' })
  if (clientId) await clientAccess(result.departmentContext, uuid.parse(clientId))
  return result
}

/** Fresh scoped post for browser parity; only the delegated review workflow is widened. */
export async function getDepartmentBrowserSocialPost(ctx: ToolContext, postId: string, legacyRoleAuthorized = false) {
  // Adding the department group must not remove an independently held legacy role path.
  let post: SocialPostReviewRow | undefined
  if (legacyRoleAuthorized) {
    const candidate = await queryOneFresh<SocialPostReviewRow>('SELECT * FROM social_posts WHERE id=$1', [uuid.parse(postId)])
    if (candidate && candidate.review_policy !== 'delegated_marketing') {
      await clientAccess(ctx, candidate.client_id)
      const { requireSocialClientAccess } = await import('~~/server/utils/social/clientAccess')
      await requireSocialClientAccess(ctx.event, candidate.client_id)
      post = candidate
    }
  }
  post ??= (await loadSocialReview(ctx, postId)).post
  const { objectValue, toIsoOrNull } = await import('~~/server/utils/socialPublishing/revisions')
  return { ...post, metadata: objectValue(post.metadata), scheduled_at: toIsoOrNull(post.scheduled_at) }
}

async function loadSocialReview(ctx: ToolContext, postId: string) {
  const { assertMarketingCapabilityAtBoundary, requireIndependentMarketingReviewer } = await import('./reviewAuthority')
  const post = await queryOneFresh<SocialPostReviewRow>('SELECT * FROM social_posts WHERE id=$1', [uuid.parse(postId)])
  if (!post) throw createError({ statusCode: 404, statusMessage: 'Review post not found' })
  await clientAccess(ctx, post.client_id)
  if (post.review_policy !== 'delegated_marketing') conflict('Only delegated marketing revisions are supported')
  const revision = await queryOneFresh<SocialRevisionRow>(
    'SELECT * FROM social_post_revisions WHERE id=$1 AND post_id=$2 AND client_id=$3',
    [post.current_revision_id, post.id, post.client_id]
  )
  if (!revision || revision.post_id !== post.id || revision.client_id !== post.client_id || revision.review_policy !== 'delegated_marketing') {
    conflict('Current submitted revision required')
  }
  for (const requesterId of new Set([revision.requested_by, post.created_by].filter((id): id is string => !!id))) {
    await requireIndependentMarketingReviewer(ctx.event, { requesterId, clientId: post.client_id, reviewerId: ctx.userId })
  }
  await assertMarketingCapabilityAtBoundary(ctx.event, revision.requested_by, post.client_id, 'social_draft')
  return { post, revision }
}

type TargetOutcome = PublishTargetResult & { initialReceipt?: PublishTargetResult }
function safeOutcomeText(value: unknown, max = 160): string | null {
  return typeof value === 'string'
    && !/https?:\/\/|token[=:]|secret|bearer\s|access_token/i.test(value)
    ? value.slice(0, max)
    : null
}
function safeOutcomeIso(value: unknown): string | null {
  if (typeof value !== 'string' && !(value instanceof Date)) return null
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date.toISOString() : null
}
type SanitizedTargetOutcome = {
  status: string
  platform: string | null
  accountId: string | null
  platformAccountId: string | null
  platformPostId: string | null
  providerStatus: string | null
  providerReceipt: { code: string | null, logId: string | null } | null
  publicPostIds: string[]
  nextPollAt: string | null
  firstComment: { status: string, platformPostId: string | null } | null
  initialReceipt: SanitizedTargetOutcome | null
}
function safeTargetFields(result: TargetOutcome): SanitizedTargetOutcome {
  return {
    status: safeOutcomeText(result.status, 40) ?? 'unknown',
    platform: safeOutcomeText(result.platform, 40),
    accountId: safeOutcomeText(result.accountId),
    platformAccountId: safeOutcomeText(result.platformAccountId),
    platformPostId: safeOutcomeText(result.platformPostId),
    providerStatus: safeOutcomeText(result.providerStatus),
    providerReceipt: result.providerReceipt
      ? {
          code: safeOutcomeText(result.providerReceipt.code),
          logId: safeOutcomeText(result.providerReceipt.logId)
        }
      : null,
    publicPostIds: Array.isArray(result.publicPostIds)
      ? result.publicPostIds.slice(0, 20).map(id => safeOutcomeText(id)).filter((id): id is string => !!id)
      : [],
    nextPollAt: safeOutcomeIso(result.nextPollAt),
    firstComment: result.firstComment
      ? {
          status: safeOutcomeText(result.firstComment.status, 40) ?? 'unknown',
          platformPostId: safeOutcomeText(result.firstComment.platformPostId)
        }
      : null,
    initialReceipt: result.initialReceipt
      ? safeTargetFields({ ...result.initialReceipt, initialReceipt: undefined })
      : null
  }
}
function socialOutcomeEvidence(
  post: SocialPostReviewRow,
  revision: SocialRevisionRow,
  platformResults?: Record<string, PublishTargetResult>,
  currentStatus = post.status
) {
  const results = platformResults
    ?? (post as SocialPostReviewRow & { platform_results?: Record<string, PublishTargetResult> }).platform_results
    ?? {}
  const entries = Object.entries(results)
  const targets = entries.slice(0, 100).map(([key, result]) => ({
    key: safeOutcomeText(key) ?? 'unknown',
    ...safeTargetFields(result)
  }))
  const unresolved = ['accepted', 'unknown', 'queued', 'publishing']
  return {
    currentStatus,
    initialOutcome: safeOutcomeText(revision.dispatch_outcome, 40),
    reconciliationRequired: unresolved.includes(currentStatus)
      || targets.some(target => unresolved.includes(target.status) || unresolved.includes(target.firstComment?.status ?? '')),
    targets,
    targetsTruncated: entries.length > targets.length
  }
}
async function socialView(post: SocialPostReviewRow, revision: SocialRevisionRow) {
  const [{ socialRevisionView }, { resolveEffectiveSocialTargets }] = await Promise.all([
    import('~~/server/utils/socialPublishing/revisions'), import('~~/server/utils/socialPublishing/effectivePayload')
  ])
  return {
    postId: post.id, clientId: post.client_id, status: post.status,
    currentRevisionId: post.current_revision_id, approvedRevisionId: post.approved_revision_id,
    revision: socialRevisionView(revision), content: revision.snapshot.content,
    effectiveTargets: resolveEffectiveSocialTargets(revision.snapshot, revision.snapshot.media ?? [])
      .map(({ key, platform, accountId, mode, content, link, hashtags, firstComment, options, notes }) =>
        ({ key, platform, accountId, mode, content, link, hashtags, firstComment, options, notes })),
    outcome: socialOutcomeEvidence(post, revision)
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Closed tool-name dispatch consumes its corresponding strict Zod schema below.
async function socialOperation(name: DepartmentReviewToolName, input: any, ctx: ToolContext) {
  const { requireIndependentMarketingReviewer } = await import('./reviewAuthority')
  if (name === 'marketing_list_social_reviews') {
    const rows = await queryRowsFresh<{ id: string }>(
      `SELECT p.id FROM social_posts p JOIN agency_clients c ON c.id=p.client_id AND c.is_active=TRUE
       JOIN social_post_revisions r ON r.id=p.current_revision_id AND r.post_id=p.id AND r.client_id=p.client_id
       WHERE p.review_policy='delegated_marketing' AND p.created_by IS DISTINCT FROM $1
         AND r.requested_by<>$1 AND ($2::uuid IS NULL OR p.client_id=$2)
         AND ($3::uuid[] IS NULL OR p.client_id=ANY($3))
       ORDER BY r.requested_at DESC,p.id LIMIT 100`,
      [ctx.userId, input.clientId ?? ctx.clientScope ?? null,
        ctx.assistantScope?.clientAccessMode === 'all_active' ? null : (ctx.assistantScope?.assignedClientIds ?? [])]
    )
    const items = []
    for (const row of rows) {
      try {
        const { post, revision } = await loadSocialReview(ctx, row.id)
        items.push(await socialView(post, revision))
      } catch (error) {
        if (![403, 404].includes((error as { statusCode: number }).statusCode)) throw error
      }
    }
    return { items, limit: 100, truncated: rows.length === 100 }
  }
  const { post, revision } = await loadSocialReview(ctx, input.postId)
  if (name === 'marketing_get_social_review') return socialView(post, revision)
  if (revision.id !== input.revisionId || post.current_revision_id !== input.revisionId || revision.content_hash !== input.expectedContentHash) {
    conflict('Exact current revision and content hash required')
  }
  if (name === 'marketing_review_social_revision') {
    const { reviewSocialPostRevision } = await import('~~/server/utils/socialPublishing/revisions')
    const reviewed = await transaction(db => reviewSocialPostRevision(db, {
      event: ctx.event, postId: post.id, revisionId: revision.id,
      reviewerId: ctx.userId, decision: input.decision, reason: input.reason
    }))
    const { recordSocialPublishingAudit } = await import('~~/server/utils/socialPublishing/audit')
    await recordSocialPublishingAudit({ clientId: post.client_id, postId: post.id, actorId: ctx.userId,
      action: input.decision === 'approved' ? 'post_approved' : 'post_rejected', metadata: { revisionId: revision.id } })
    if (reviewed.post.status === 'scheduled' && reviewed.post.scheduled_at) {
      const { startSocialPublishingWorkflow } = await import('~~/server/utils/agencyWorkflows/client')
      await startSocialPublishingWorkflow(ctx.event, { postId: post.id, clientId: post.client_id,
        scheduledAt: reviewed.post.scheduled_at, trigger: 'schedule', requestedBy: ctx.userId, revisionId: revision.id })
    }
    return { postId: post.id, revisionId: revision.id, status: reviewed.post.status, decision: input.decision }
  }
  if (name !== 'marketing_execute_social_revision') throw createError({ statusCode: 404, statusMessage: 'Unknown review operation' })
  if (post.status !== 'approved' || post.approved_revision_id !== revision.id || revision.review_status !== 'approved'
    || !revision.reviewed_by || post.approved_by !== revision.reviewed_by || revision.dispatch_claimed_at
    || Date.parse(revision.expires_at) <= Date.now()) conflict('Exact unclaimed approved revision required; inspect existing outcome')
  await requireIndependentMarketingReviewer(ctx.event, {
    requesterId: revision.requested_by, clientId: post.client_id, reviewerId: revision.reviewed_by
  })
  const { claimAndPublishSocialPost } = await import('~~/server/utils/socialPublishing/dispatch')
  // Durable revision claim and provider receipts own retries/unknown outcomes. No generic retry.
  const result = await claimAndPublishSocialPost({ event: ctx.event, postId: post.id, clientId: post.client_id,
    revisionId: revision.id, claimStatuses: ['approved'], source: 'manual', actorId: ctx.userId, auditAction: 'post_published' })
  return { postId: post.id, revisionId: revision.id, status: result.status ?? result.currentStatus ?? null,
    skipped: result.skipped ?? false, reason: safeOutcomeText(result.reason),
    outcome: socialOutcomeEvidence(post, revision, result.platformResults ?? undefined,
      result.status ?? result.currentStatus ?? post.status) }
}

export async function runDepartmentReviewOperation(name: DepartmentReviewToolName, raw: unknown, incoming: ToolContext) {
  const contract = departmentReviewContracts[name]
  if (!contract) throw createError({ statusCode: 404, statusMessage: 'Unknown review operation' })
  const { requireMarketingDepartment } = await import('./departmentAuthority')
  const ctx = await requireMarketingDepartment(incoming, contract.mutates)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- The selected strict schema validates the closed dispatch variant before use.
  const input = contract.schema.parse(raw) as any
  if (input.clientId) await clientAccess(ctx, input.clientId)
  if (name.includes('_google_ads_')) {
    const service = await import('~~/server/utils/googleAds/staffReview')
    if (name === 'marketing_list_google_ads_reviews') return service.listGoogleAdsReviewPlans(ctx.event, ctx.userId, input.clientId ?? ctx.clientScope)
    const plan = await service.getGoogleAdsReviewPlan(ctx.event, ctx.userId, input.actionPlanId)
    await clientAccess(ctx, plan.clientId)
    if (name === 'marketing_get_google_ads_review') return plan
    if (name === 'marketing_review_google_ads_plan') return service.reviewGoogleAdsPlan(ctx.event, ctx.userId, input)
    const { resolveMcpRuntimeConfig } = await import('../mcp/runtimeConfig')
    if (!resolveMcpRuntimeConfig(ctx.event).suiteFlags.googleAdsWrite) throw createError({ statusCode: 403, statusMessage: 'Google Ads writes disabled' })
    return service.executeReviewedGoogleAdsPlan(ctx.event, ctx.userId, input)
  }
  if (name.includes('_gtm_')) {
    const service = await import('~~/server/utils/tracking/gtmProposals')
    if (name === 'marketing_list_gtm_reviews') return service.listGtmReviewProposals({ ...ctx, clientScope: input.clientId ?? ctx.clientScope })
    if (name === 'marketing_get_gtm_review') return service.getGtmReviewProposal(ctx, input.proposalId)
    if (name === 'marketing_review_gtm_proposal') return service.reviewGtmChangeProposal(ctx, input)
    return service.executeApprovedGtmProposal(ctx, input)
  }
  return socialOperation(name, input, ctx)
}
