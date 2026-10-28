/**
 * Marketing department Page Studio website workflow over MCP. Reuses the native Page Studio
 * document store (revision-bound Dashboard drafts), checkpoint reader and version review service.
 * Every call re-resolves fresh MARKETING_MANAGEMENT + department grant, the explicit native
 * PAGE_STUDIO_VIEW/EDIT/APPROVE grant for the operation, the exact active mapped client and the
 * organisation's Page Studio tenant (never a tenant-wide or other-tenant site). DOMAINS and
 * SUBSCRIPTIONS are never used. Writes bind the exact input in the execution ledger; reviews bind
 * the exact version digest/checkpoint and live production release, and must be independent of the
 * version's author and submitter.
 *
 * Studio submission, candidate builds and publication use the native login-bound authority SQL with
 * the ORIGINAL agency login proven at OAuth consent and carried by the consumed MCP request
 * (getConsumedMcpPageStudioLogin). No proof means reconnect; a proof never bypasses the native
 * page_studio_login_sessions expiry/logout/sessions_invalidated_at rechecks. Provider-effect paths
 * commit the ledger claim first and hold any post-dispatch failure for reconciliation. Preview
 * returns only the private preview hostname, never a bearer session token. Sealed feature builds
 * (separate content-login publisher) are refused.
 */
import type { z } from 'zod'
import { queryRowsFresh, transaction } from '~~/server/utils/db'
// Static: a dynamic-import namespace call is not a Rollup-tracked call site (parameter erasure).
import { getConsumedMcpPageStudioLogin } from '../mcp/requestClaim'
import { requireMarketingDepartment } from './departmentAuthority'
import { resolveMarketingReadScope, requireScopedClient } from './readScope'
import { fail, ok, type ToolContext, type ToolResult } from '../toolContext'
import type { PageStudioLoginSession } from '~~/shared/pageStudio/controlTypes'
import {
  departmentWebsiteContracts, DEPARTMENT_WEBSITE_GRANTS, DEPARTMENT_WEBSITE_LOGIN_BOUND_NAMES, DEPARTMENT_WEBSITE_WRITE_NAMES,
  type DepartmentWebsiteToolName
} from './departmentWebsiteSchemas'
import {
  claimExecution, claimOutcome, finishExecution, refuse, refusalOf, sha256, validExecutionIdentity,
  type ExecutionIdentity, type LedgerDb
} from './departmentExecutionLedger'

type Args<N extends DepartmentWebsiteToolName> = z.infer<(typeof departmentWebsiteContracts)[N]>
const WRITES = new Set<string>(DEPARTMENT_WEBSITE_WRITE_NAMES)

export interface DepartmentWebsiteDeps {
  resolveTenant?: (ctx: ToolContext) => Promise<string | null>
  requireReviewer?: typeof import('./reviewAuthority').requireIndependentMarketingReviewer
  /** Current permission groups of the recorded approver; defaults to the fresh staff resolver. */
  reviewerGroups?: (ctx: ToolContext, reviewerId: string) => Promise<string[]>
  loginProof?: (ctx: ToolContext, tool: string) => Promise<PageStudioLoginSession | null> | PageStudioLoginSession | null
  /** Native Page Studio services; defaults load the real modules. Tests inject doubles. */
  native?: Partial<WebsiteNative>
}

interface WebsiteNative {
  mutateHistory: typeof import('~~/server/utils/pageStudio/draftHistory').mutatePageStudioHistory
  buildServices: typeof import('~~/server/utils/pageStudio/astroBuildHttp').resolveAstroBuildServices
  coordinateBuild: typeof import('~~/server/utils/pageStudio/astroBuildCoordinator').coordinateApprovedAstroBuild
  registerPreview: typeof import('~~/server/utils/pageStudio/astroCandidatePreview').registerAstroCandidatePreview
  buildPointer: typeof import('~~/server/utils/pageStudio/publishing').getPageStudioBuildPointer
  isFeatureBuild: typeof import('~~/server/utils/pageStudio/releaseFeatureHttp').hasSealedFeatureBuild
  deliveryWorker: typeof import('~~/server/utils/pageStudio/publishing').resolvePageStudioDeliveryWorker
  activate: typeof import('~~/server/utils/pageStudio/publishing').activatePageStudioRelease
  publishAuthority: typeof import('~~/server/utils/pageStudio/publishAuthority').withPageStudioPublishAuthority
}

async function native<K extends keyof WebsiteNative>(deps: DepartmentWebsiteDeps, name: K): Promise<WebsiteNative[K]> {
  if (deps.native?.[name]) return deps.native[name] as WebsiteNative[K]
  const loaders: { [P in keyof WebsiteNative]: () => Promise<WebsiteNative[P]> } = {
    mutateHistory: async () => (await import('~~/server/utils/pageStudio/draftHistory')).mutatePageStudioHistory,
    buildServices: async () => (await import('~~/server/utils/pageStudio/astroBuildHttp')).resolveAstroBuildServices,
    coordinateBuild: async () => (await import('~~/server/utils/pageStudio/astroBuildCoordinator')).coordinateApprovedAstroBuild,
    registerPreview: async () => (await import('~~/server/utils/pageStudio/astroCandidatePreview')).registerAstroCandidatePreview,
    buildPointer: async () => (await import('~~/server/utils/pageStudio/publishing')).getPageStudioBuildPointer,
    isFeatureBuild: async () => (await import('~~/server/utils/pageStudio/releaseFeatureHttp')).hasSealedFeatureBuild,
    deliveryWorker: async () => (await import('~~/server/utils/pageStudio/publishing')).resolvePageStudioDeliveryWorker,
    activate: async () => (await import('~~/server/utils/pageStudio/publishing')).activatePageStudioRelease,
    publishAuthority: async () => (await import('~~/server/utils/pageStudio/publishAuthority')).withPageStudioPublishAuthority
  }
  return loaders[name]() as Promise<WebsiteNative[K]>
}

/** Original agency login proven at OAuth consent for exactly this consumed MCP call. */
async function originalLogin(ctx: ToolContext, tool: string, deps: DepartmentWebsiteDeps): Promise<PageStudioLoginSession> {
  const proof = deps.loginProof
    ? await deps.loginProof(ctx, tool)
    : ctx.event ? getConsumedMcpPageStudioLogin(ctx.event, ctx.userId, tool) : null
  if (!proof || proof.role !== 'agency' || proof.userId !== ctx.userId || !(proof.expiresAt > new Date())) {
    refuse('Reconnect the XeroFlow MCP connector while signed in to authorise Page Studio publishing', 'reconnect_required')
  }
  return proof
}

/** Deterministic native idempotency identity derived from the department execution key. */
const nativeKey = (key: string, purpose: string) => `mcp-dept:${purpose}:${sha256(key).slice(0, 48)}`
function requestUuid(key: string): string {
  const hex = sha256(`history:${key}`)
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${((parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16)}${hex.slice(17, 20)}-${hex.slice(20, 32)}`
}

const freshReader: LedgerDb = { query: async (sql, params) => ({ rows: await queryRowsFresh(sql, params as unknown[]) }) }
const env = (ctx: ToolContext) => (ctx.event?.context as { cloudflare?: { env?: Record<string, unknown> } } | undefined)?.cloudflare?.env

/** Same tenant resolution as the agency Page Studio routes, minus the browser tenant cookie. */
async function organisationTenant(ctx: ToolContext): Promise<string | null> {
  const { getOrgTenant } = await import('~~/server/utils/tokenStore')
  const tenant = (await getOrgTenant(ctx.event))?.tenantId
  if (tenant) return tenant
  const values = env(ctx)
  const staging = values?.PAGE_STUDIO_STAGING_TENANT_ID
  return values?.PAGE_STUDIO_RELEASE_ENVIRONMENT === 'staging' && values?.PAGE_STUDIO_CONTENT_ENVIRONMENT === 'staging'
    && typeof staging === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(staging)
    ? staging
    : null
}

async function authorize(ctx: ToolContext, name: DepartmentWebsiteToolName, clientId: string, deps: DepartmentWebsiteDeps) {
  const fresh = await requireMarketingDepartment(ctx, WRITES.has(name))
  if (!(fresh.permissionGroups ?? []).includes(DEPARTMENT_WEBSITE_GRANTS[name])) {
    refuse(`Page Studio ${DEPARTMENT_WEBSITE_GRANTS[name].replace('PAGE_STUDIO_', '')} permission required`, 'forbidden')
  }
  await requireScopedClient(await resolveMarketingReadScope(fresh), clientId)
  const tenantId = await (deps.resolveTenant ?? organisationTenant)(ctx)
  if (!tenantId) refuse('No Page Studio organisation is configured', 'unavailable')
  return { fresh, tenantId }
}

interface SiteRow {
  id: string
  name: string
  route: string | null
  status: string
  current_checkpoint_id: string | null
  current_version_id: string | null
  entitlement_status: string
  entitlement_effective: boolean
  pages_per_site_limit: number
}

const SITE_SQL = `SELECT site.id, site.name, site.route, site.status, site.current_checkpoint_id, site.current_version_id,
    entitlement.status AS entitlement_status, entitlement.pages_per_site_limit,
    (entitlement.effective_from <= NOW() AND (entitlement.effective_until IS NULL OR entitlement.effective_until > NOW())) AS entitlement_effective
  FROM page_studio_sites site
  JOIN agency_clients client ON client.id = site.client_id AND client.is_active = TRUE
  JOIN page_studio_entitlements entitlement ON entitlement.tenant_id = site.tenant_id
    AND entitlement.client_id = site.client_id AND entitlement.id = site.entitlement_id
  WHERE site.tenant_id = $1 AND site.client_id = $2 AND site.status <> 'archived'`

async function scopedSite(db: LedgerDb, tenantId: string, clientId: string, siteId: string, lock = ''): Promise<SiteRow> {
  const site = (await db.query(`${SITE_SQL} AND site.id = $3${lock}`, [tenantId, clientId, siteId])).rows[0] as SiteRow | undefined
  if (!site) refuse('Website not available for this client', 'not_found')
  return site
}

const editable = (site: SiteRow) => ['draft', 'active'].includes(site.status)
  && ['trial', 'active'].includes(site.entitlement_status) && site.entitlement_effective === true

async function pointers(tenantId: string, clientId: string, siteIds: string[]) {
  if (!siteIds.length) return []
  return queryRowsFresh<{ site_id: string, environment: string, normalized_hostname: string, active_release_id: string }>(`SELECT site_id, environment,
      normalized_hostname, active_release_id FROM page_studio_release_pointers
    WHERE tenant_id = $1 AND client_id = $2 AND site_id = ANY($3::uuid[]) ORDER BY site_id, environment, normalized_hostname`, [tenantId, clientId, siteIds])
}

/** Native errors carry a safe statusCode/message; map them to typed refusals. */
function nativeFailure(error: unknown): ToolResult | undefined {
  const native = error as { name?: string, statusCode?: number, message?: string }
  if (!['PageStudioDocumentError', 'PageStudioVersionError', 'PageStudioReleaseCheckpointError', 'PageStudioHistoryError', 'PageStudioPublishingError', 'PageStudioControlError'].includes(native?.name ?? '')) return undefined
  const code = native.statusCode === 404 ? 'not_found' : native.statusCode === 403 ? 'forbidden' : native.statusCode === 503 ? 'unavailable' : 'conflict'
  return fail(native.message ?? 'Website request refused', code)
}

// ---------------------------------------------------------------------------------------- reads

async function listWebsites(tenantId: string, args: Args<'marketing_list_websites'>) {
  const sites = (await freshReader.query(`${SITE_SQL} ORDER BY site.name, site.id LIMIT 100`, [tenantId, args.clientId])).rows as SiteRow[]
  const live = await pointers(tenantId, args.clientId, sites.map(site => site.id))
  return ok({
    clientId: args.clientId,
    items: sites.map(site => ({
      siteId: site.id, name: site.name, route: site.route, status: site.status,
      entitlement: { status: site.entitlement_status, effective: site.entitlement_effective === true, pagesPerSite: Number(site.pages_per_site_limit) },
      currentVersionId: site.current_version_id, currentCheckpointId: site.current_checkpoint_id,
      editorKind: site.current_checkpoint_id ? 'studio' : 'dashboard_document',
      releases: live.filter(pointer => pointer.site_id === site.id).map(pointer => ({ environment: pointer.environment, hostname: pointer.normalized_hostname, activeReleaseId: pointer.active_release_id }))
    })),
    complete: sites.length < 100,
    storedOnly: true
  })
}

async function getWebsite(tenantId: string, args: Args<'marketing_get_website'>) {
  const site = await scopedSite(freshReader, tenantId, args.clientId, args.siteId)
  const [versions, reviews, live] = await Promise.all([
    queryRowsFresh<{ id: string, status: string, digest: string, checkpoint_id: string }>(`SELECT id, status, digest, checkpoint_id, summary, author_id, author_role,
        created_at, submitted_at FROM page_studio_versions
      WHERE tenant_id = $1 AND client_id = $2 AND site_id = $3 ORDER BY created_at DESC, id DESC LIMIT 20`, [tenantId, args.clientId, args.siteId]),
    queryRowsFresh(`SELECT id, version_id, version_digest, reviewer_id, decision, comment, decided_at FROM page_studio_reviews
      WHERE tenant_id = $1 AND client_id = $2 AND site_id = $3 ORDER BY decided_at DESC, id DESC LIMIT 20`, [tenantId, args.clientId, args.siteId]),
    pointers(tenantId, args.clientId, [args.siteId])
  ])
  const production = live.filter(pointer => pointer.environment === 'production')
  const current = versions.find(version => version.id === site.current_version_id)
  const comparable = current?.status === 'in_review' && current.checkpoint_id === site.current_checkpoint_id
  return ok({
    clientId: args.clientId,
    site: {
      siteId: site.id, name: site.name, route: site.route, status: site.status, editable: editable(site),
      editorKind: site.current_checkpoint_id ? 'studio' : 'dashboard_document',
      currentVersionId: site.current_version_id, currentCheckpointId: site.current_checkpoint_id,
      entitlement: { status: site.entitlement_status, effective: site.entitlement_effective === true, pagesPerSite: Number(site.pages_per_site_limit) }
    },
    versions,
    reviews,
    releases: live.map(pointer => ({ environment: pointer.environment, hostname: pointer.normalized_hostname, activeReleaseId: pointer.active_release_id })),
    reviewComparison: comparable
      ? { versionId: current.id, digest: current.digest, checkpointId: current.checkpoint_id, releaseId: production[0]?.active_release_id ?? null, hostname: production[0]?.normalized_hostname ?? null }
      : null,
    reviewRule: 'Approval or rejection must come from an independent marketing manager or admin with Page Studio APPROVE who neither authored nor submitted the version.',
    loginBoundOperations: [...DEPARTMENT_WEBSITE_LOGIN_BOUND_NAMES],
    unsupportedOverMcp: ['studio_draft_editing', 'feature_build_publication', 'rollback', 'domains', 'subscriptions']
  })
}

async function getDraft(ctx: ToolContext, tenantId: string, args: Args<'marketing_get_website_draft'>) {
  const site = await scopedSite(freshReader, tenantId, args.clientId, args.siteId)
  const [{ getPageStudioDocument }, { formCatalogue }] = await Promise.all([
    import('~~/server/utils/pageStudio/documents'), import('~~/shared/pageStudio/formCatalogue')
  ])
  const state = await getPageStudioDocument(tenantId, args.siteId, env(ctx)?.PAGE_STUDIO_CHECKPOINTS as never)
  const studio = state.studio
  return ok({
    clientId: args.clientId,
    siteId: args.siteId,
    revision: state.revision,
    editable: editable(site) && !studio,
    editorKind: studio ? 'studio' : 'dashboard_document',
    pageLimit: state.pageLimit,
    document: state.document,
    studio: studio ? { checkpointId: studio.checkpointId, pages: studio.pages } : undefined,
    // Reusable form identity: shared definitions keep one definitionId across placements.
    forms: studio
      ? formCatalogue(studio.pages, studio.formLibrary).map(entry => ({
          key: entry.key, definitionId: entry.definitionId ?? null,
          placements: entry.placements.map(placement => ({ pageId: placement.pageId, formId: placement.formId, route: placement.route }))
        }))
      : [],
    note: studio ? 'This website is edited in Studio; Studio drafts are saved through the Studio editor. Submit the saved draft with marketing_submit_website_version.' : undefined
  })
}

// ------------------------------------------------------------------------------------ mutations

async function saveDraft(db: LedgerDb, ctx: ToolContext, tenantId: string, args: Args<'marketing_save_website_draft'>) {
  const site = await scopedSite(db, tenantId, args.clientId, args.siteId, ' FOR NO KEY UPDATE OF site')
  if (!editable(site)) refuse('This website is not editable under its current status or entitlement', 'forbidden')
  if (site.current_checkpoint_id) refuse('This website is edited in Studio; save it through the Studio editor', 'conflict')
  const { savePageStudioDocument } = await import('~~/server/utils/pageStudio/documents')
  const saved = await savePageStudioDocument(db as never, {
    actorId: ctx.userId, document: args.document, expectedRevision: args.expectedRevision, siteId: args.siteId, tenantId
  })
  return { siteId: args.siteId, clientId: args.clientId, previousRevision: args.expectedRevision, revision: saved.revision, published: false }
}

interface VersionParticipants {
  status: string
  digest: string
  authorId: string
  /** Version author, the author of its checkpoint content and every submitter (lower-cased). */
  ids: Set<string>
}

async function versionParticipants(db: LedgerDb, tenantId: string, clientId: string, siteId: string, versionId: string): Promise<VersionParticipants> {
  const version = (await db.query(`SELECT version.status, version.digest, version.author_id, checkpoint.author_id AS checkpoint_author_id
    FROM page_studio_versions version
    LEFT JOIN page_studio_checkpoints checkpoint ON checkpoint.tenant_id = version.tenant_id AND checkpoint.client_id = version.client_id
      AND checkpoint.site_id = version.site_id AND checkpoint.id = version.checkpoint_id
    WHERE version.tenant_id = $1 AND version.client_id = $2 AND version.site_id = $3 AND version.id = $4`, [tenantId, clientId, siteId, versionId])).rows[0] as
    { status: string, digest: string, author_id: string, checkpoint_author_id: string | null } | undefined
  if (!version) refuse('Website version not available', 'not_found')
  const submitters = (await db.query(`SELECT DISTINCT actor_id FROM page_studio_audit_events
    WHERE tenant_id = $1 AND client_id = $2 AND site_id = $3 AND resource_type = 'version' AND resource_id = $4
      AND action = 'version.submitted'`, [tenantId, clientId, siteId, versionId])).rows as Array<{ actor_id: string | null }>
  const ids = new Set([version.author_id, version.checkpoint_author_id, ...submitters.map(row => row.actor_id)]
    .filter((id): id is string => typeof id === 'string' && id.length > 0).map(id => id.toLowerCase()))
  return { status: version.status, digest: version.digest, authorId: version.author_id, ids }
}

async function reviewVersion(db: LedgerDb, ctx: ToolContext, tenantId: string, args: Args<'marketing_review_website_version'>, deps: DepartmentWebsiteDeps) {
  await scopedSite(db, tenantId, args.clientId, args.siteId)
  const version = await versionParticipants(db, tenantId, args.clientId, args.siteId, args.versionId)
  if (version.ids.has(ctx.userId.toLowerCase())) {
    refuse('Authors and submitters cannot review their own website version', 'forbidden')
  }
  const requireReviewer = deps.requireReviewer ?? (await import('./reviewAuthority')).requireIndependentMarketingReviewer
  await requireReviewer(ctx.event, { requesterId: version.authorId, clientId: args.clientId, reviewerId: ctx.userId })
  const { reviewPageStudioVersion } = await import('~~/server/utils/pageStudio/versions')
  const review = await reviewPageStudioVersion({
    tenantId, clientId: args.clientId, siteId: args.siteId, versionId: args.versionId, reviewerId: ctx.userId,
    decision: args.decision, comment: args.comment,
    // The schema requires both keys (nullable, never absent); normalise for non-strict inference.
    expectedComparison: {
      digest: args.expectedComparison.digest, checkpointId: args.expectedComparison.checkpointId,
      releaseId: args.expectedComparison.releaseId ?? null, hostname: args.expectedComparison.hostname ?? null
    }
  }, { runTransaction: work => work(db as never) })
  return { siteId: args.siteId, versionId: args.versionId, reviewId: review.id, decision: review.decision, versionDigest: review.versionDigest, published: false }
}

async function submitVersion(db: LedgerDb, ctx: ToolContext, fresh: ToolContext, tenantId: string, args: Args<'marketing_submit_website_version'>, key: string, deps: DepartmentWebsiteDeps) {
  const login = await originalLogin(fresh, 'marketing_submit_website_version', deps)
  const site = await scopedSite(db, tenantId, args.clientId, args.siteId)
  if (site.current_checkpoint_id !== args.expectedCheckpointId) refuse('The saved draft changed; reload before submitting', 'conflict')
  const mutate = await native(deps, 'mutateHistory')
  const receipt = await mutate({
    actor: { role: 'agency', actorId: fresh.userId, tenantId, canEdit: true },
    siteId: args.siteId,
    event: ctx.event,
    env: env(ctx) ?? {},
    login,
    body: { action: 'name', name: args.name, expectedCheckpointId: args.expectedCheckpointId, requestId: requestUuid(key), submitForReview: true }
  }, { runTransaction: work => work(db as never) })
  if (!receipt.versionId) refuse('The draft was not registered as a version', 'unavailable')
  return { siteId: args.siteId, versionId: receipt.versionId, checkpointId: receipt.checkpointId, status: 'in_review', published: false }
}

type ProviderOutcome = { state: 'succeeded' | 'failed' | 'ambiguous', result: Record<string, unknown> }

async function defaultReviewerGroups(ctx: ToolContext, reviewerId: string): Promise<string[]> {
  const { resolveMcpStaffContext } = await import('../mcp/staffAuthority')
  return (await resolveMcpStaffContext(ctx.event, reviewerId, [])).permissionGroups ?? []
}

/**
 * The exact version is approved, its latest decision is an approval of this digest, and that
 * approver is independent of every author/submitter and is still a current eligible reviewer
 * (independent marketing reviewer for the client, holding PAGE_STUDIO_APPROVE). Native review does
 * not itself forbid self-approval, so browser approvals are re-qualified here.
 */
async function requireIndependentApproval(db: LedgerDb, ctx: ToolContext, tenantId: string, args: { clientId: string, siteId: string, versionId: string, expectedVersionDigest: string }, deps: DepartmentWebsiteDeps) {
  const version = await versionParticipants(db, tenantId, args.clientId, args.siteId, args.versionId)
  if (version.digest !== args.expectedVersionDigest) refuse('The version changed since it was reviewed; reload before acting', 'conflict')
  if (version.status !== 'approved') refuse('Only an approved version can be built or published', 'conflict')
  const latest = (await db.query(`SELECT reviewer_id, decision, version_digest FROM page_studio_reviews
    WHERE tenant_id = $1 AND client_id = $2 AND site_id = $3 AND version_id = $4
    ORDER BY decided_at DESC, id DESC LIMIT 1`, [tenantId, args.clientId, args.siteId, args.versionId])).rows[0] as { reviewer_id: string, decision: string, version_digest: string } | undefined
  if (!latest || latest.decision !== 'approved' || latest.version_digest !== args.expectedVersionDigest
    || version.ids.has(String(latest.reviewer_id).toLowerCase())) {
    refuse('No independent approval is recorded for this exact version', 'forbidden')
  }
  const requireReviewer = deps.requireReviewer ?? (await import('./reviewAuthority')).requireIndependentMarketingReviewer
  await requireReviewer(ctx.event, { requesterId: version.authorId, clientId: args.clientId, reviewerId: latest.reviewer_id })
  if (!(await (deps.reviewerGroups ?? defaultReviewerGroups)(ctx, latest.reviewer_id)).includes('PAGE_STUDIO_APPROVE')) {
    refuse('The approving reviewer no longer holds Page Studio APPROVE', 'forbidden')
  }
}

/** Claim (and pre-checks) commit before any Worker effect; post-dispatch failures are held. */
async function providerOperation(
  name: DepartmentWebsiteToolName, args: { clientId: string, siteId: string, versionId: string, expectedVersionDigest: string },
  ctx: ToolContext, key: string, digest: string, deps: DepartmentWebsiteDeps,
  effect: (input: { fresh: ToolContext, tenantId: string, login: PageStudioLoginSession, markDispatched: () => void }) => Promise<Record<string, unknown>>
): Promise<ToolResult> {
  const { fresh, tenantId } = await authorize(ctx, name, args.clientId, deps)
  const login = await originalLogin(fresh, name, deps)
  const identity: ExecutionIdentity = { actorId: fresh.userId, key, digest, tool: name, clientId: args.clientId, inputHash: sha256({ name, args }), executor: 'external-provider' }
  const claimed = await transaction(async (pool) => {
    const db = pool as unknown as LedgerDb
    const claim = await claimExecution(db, identity)
    if (claim.kind !== 'fresh') return claimOutcome(claim)
    await scopedSite(db, tenantId, args.clientId, args.siteId)
    await requireIndependentApproval(db, fresh, tenantId, args, deps)
    return null
  })
  if (claimed) return claimed
  let dispatched = false
  const close = async ({ state, result }: ProviderOutcome) => transaction(async pool => finishExecution(pool as unknown as LedgerDb, identity, result, state))
  try {
    // Revocation, grant and the approver's eligibility are re-checked immediately before any Worker effect.
    const current = await authorize(fresh, name, args.clientId, deps)
    await scopedSite(freshReader, current.tenantId, args.clientId, args.siteId)
    await requireIndependentApproval(freshReader, current.fresh, current.tenantId, args, deps)
    const markDispatched = () => {
      dispatched = true
    }
    const result = await effect({ fresh: current.fresh, tenantId: current.tenantId, login, markDispatched })
    try {
      await close({ state: 'succeeded', result })
    } catch {
      return ok({ ...result, ledgerRecorded: false, note: 'Completed, but the execution record could not be finalised; do not retry.' })
    }
    return ok(result)
  } catch (error) {
    if (dispatched) {
      await close({ state: 'ambiguous', result: { siteId: args.siteId, versionId: args.versionId, reconciliationRequired: true } }).catch(() => undefined)
      return fail('Website outcome requires reconciliation; check marketing_get_website releases before any retry', 'reconciliation_required')
    }
    const refusal = refusalOf(error) ?? nativeFailure(error)
    const message = refusal ? (refusal as { error: string }).error : (error as { statusMessage?: string })?.statusMessage ?? 'Website operation could not start'
    await close({ state: 'failed', result: { siteId: args.siteId, versionId: args.versionId, error: message.slice(0, 300) } }).catch(() => undefined)
    const status = (error as { statusCode?: number })?.statusCode
    return refusal ?? fail(message, status === 403 ? 'forbidden' : status === 404 ? 'not_found' : status === 503 ? 'unavailable' : 'conflict')
  }
}

function buildCandidate(args: Args<'marketing_build_website_candidate'>, ctx: ToolContext, key: string, digest: string, deps: DepartmentWebsiteDeps) {
  return providerOperation('marketing_build_website_candidate', args, ctx, key, digest, deps, async ({ fresh, tenantId, login, markDispatched }) => {
    const { PageStudioHostnameSchema } = await import('~~/server/utils/pageStudio/delivery')
    const previewHost = PageStudioHostnameSchema.safeParse(env(ctx)?.PAGE_STUDIO_RELEASE_PREVIEW_HOSTNAME)
    if (!previewHost.success || previewHost.data.length > 196) refuse('Approved website preview is not configured', 'unavailable')
    const { environment, services } = (await native(deps, 'buildServices'))(ctx.event)
    if (args.environment !== environment) refuse('The requested environment does not match the configured compiler', 'conflict')
    const scope = { tenantId, clientId: args.clientId, siteId: args.siteId }
    const principal = { actorId: fresh.userId, tenantId, login }
    markDispatched()
    const build = await (await native(deps, 'coordinateBuild'))({ scope, versionId: args.versionId, environment, idempotencyKey: nativeKey(key, 'build') }, principal, services, { recoverCandidate: true })
    const preview = await (await native(deps, 'registerPreview'))({ scope, versionId: args.versionId, environment, buildId: build.buildId, previewHostname: previewHost.data },
      principal, { verifyBuild: pointer => services.verifyBuild(pointer) })
    // The private preview host needs a short-lived signed session; never return a bearer credential over MCP.
    return { siteId: args.siteId, versionId: args.versionId, buildId: build.buildId, environment, previewHostname: preview.hostname, previewSession: 'open_in_page_studio', published: false }
  })
}

function publishVersion(args: Args<'marketing_publish_website_version'>, ctx: ToolContext, key: string, digest: string, deps: DepartmentWebsiteDeps) {
  return providerOperation('marketing_publish_website_version', args, ctx, key, digest, deps, async ({ fresh, tenantId, login, markDispatched }) => {
    const scope = { tenantId, clientId: args.clientId, siteId: args.siteId }
    const build = await (await native(deps, 'buildPointer'))(scope, args.buildId)
    const identity = build?.astro?.context.identity
    if (!build || !identity || identity.environment !== args.environment || identity.source.kind !== 'approved-version'
      || identity.source.versionId !== args.versionId || !identity.source.checkpoint || build.versionDigest !== args.expectedVersionDigest) {
      refuse('The reviewed build does not match this website version and environment', 'conflict')
    }
    if (await (await native(deps, 'isFeatureBuild'))(scope, args.buildId)) refuse('Feature builds publish through the Studio editor', 'conflict')
    const worker = (await native(deps, 'deliveryWorker'))(ctx.event, args.environment)
    await worker.verifyBuild(build)
    const publishAuthority = await native(deps, 'publishAuthority')
    const principal = { actorId: fresh.userId, tenantId, login }
    markDispatched()
    const release = await (await native(deps, 'activate'))({
      actorId: fresh.userId, buildId: args.buildId, environment: args.environment, expectedActiveReleaseId: args.expectedActiveReleaseId,
      hostname: args.hostname, idempotencyKey: nativeKey(key, 'release'), scope
    }, { runTransaction: work => publishAuthority(scope, principal, work) })
    return { siteId: args.siteId, versionId: args.versionId, buildId: args.buildId, environment: args.environment, hostname: args.hostname, releaseId: release.releaseId, status: 'published' }
  })
}

async function localMutation(name: DepartmentWebsiteToolName, args: { clientId: string }, ctx: ToolContext, key: string, digest: string, deps: DepartmentWebsiteDeps) {
  const { fresh, tenantId } = await authorize(ctx, name, args.clientId, deps)
  const identity: ExecutionIdentity = { actorId: fresh.userId, key, digest, tool: name, clientId: args.clientId, inputHash: sha256({ name, args }), executor: 'local-transactional' }
  return transaction(async (pool) => {
    const db = pool as unknown as LedgerDb
    const claim = await claimExecution(db, identity)
    if (claim.kind !== 'fresh') return claimOutcome(claim)
    const result = name === 'marketing_save_website_draft'
      ? await saveDraft(db, fresh, tenantId, args as Args<'marketing_save_website_draft'>)
      : name === 'marketing_submit_website_version'
        ? await submitVersion(db, ctx, fresh, tenantId, args as Args<'marketing_submit_website_version'>, key, deps)
        : await reviewVersion(db, fresh, tenantId, args as Args<'marketing_review_website_version'>, deps)
    await finishExecution(db, identity, result)
    return ok({ ...result, committed: true })
  })
}

export async function runDepartmentWebsiteOperation(
  name: string, raw: unknown, ctx: ToolContext, key?: string, digest?: string, deps: DepartmentWebsiteDeps = {}
): Promise<ToolResult> {
  const contract = departmentWebsiteContracts[name as DepartmentWebsiteToolName]
  if (!contract) return fail('Unknown department website operation', 'not_found')
  const parsed = contract.safeParse(raw)
  if (!parsed.success) return fail('Invalid department website arguments', 'bad_args')
  const args = parsed.data as { clientId: string }
  const tool = name as DepartmentWebsiteToolName
  try {
    if (WRITES.has(name)) {
      if (!validExecutionIdentity(key, digest)) return fail('Verified logical request identity required', 'coordinator_required')
      if (tool === 'marketing_build_website_candidate') return await buildCandidate(args as Args<typeof tool>, ctx, key, digest!, deps)
      if (tool === 'marketing_publish_website_version') return await publishVersion(args as Args<typeof tool>, ctx, key, digest!, deps)
      return await localMutation(tool, args, ctx, key, digest!, deps)
    }
    const { tenantId } = await authorize(ctx, tool, args.clientId, deps)
    if (tool === 'marketing_list_websites') return await listWebsites(tenantId, args as Args<typeof tool>)
    if (tool === 'marketing_get_website') return await getWebsite(tenantId, args as Args<typeof tool>)
    return await getDraft(ctx, tenantId, args as Args<'marketing_get_website_draft'>)
  } catch (error) {
    const refusal = refusalOf(error) ?? nativeFailure(error)
    if (refusal) return refusal
    const status = (error as { statusCode?: number })?.statusCode
    if (status === 403) return fail('Not permitted for this marketing website request', 'forbidden')
    if (status === 404) return fail('Client not available', 'not_found')
    return fail('Department website operation unavailable', 'unavailable')
  }
}
