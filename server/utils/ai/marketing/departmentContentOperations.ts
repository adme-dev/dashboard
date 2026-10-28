/**
 * Marketing department Search Authority content workflow over MCP. Reuses the governed content
 * repository (append-only versions, source interviews, claims, decisions, audit) and the shared
 * publication service. Every call re-resolves fresh MARKETING_MANAGEMENT + department grant, the
 * active client and the client's Search Authority entitlement. Mutations bind the exact input in the
 * execution ledger; submit/review/publish additionally bind the exact current version and its
 * content hash. Review requires an independent marketing reviewer (never the author or submitter).
 */
import type { z } from 'zod'
import { queryRowsFresh, transaction } from '~~/server/utils/db'
import {
  approveContentVersion, createContentAsset, createContentVersion, rejectContentVersion, submitContentVersion
} from '~~/server/utils/searchAuthority/contentRepository'
import { requireMarketingDepartment } from './departmentAuthority'
import { resolveMarketingReadScope, requireScopedClient } from './readScope'
import { fail, ok, type ToolContext, type ToolResult } from '../toolContext'
import { departmentContentContracts, DEPARTMENT_CONTENT_WRITE_NAMES, type DepartmentContentToolName } from './departmentContentSchemas'
import {
  claimExecution, claimOutcome, finishExecution, refuse, refusalOf, sha256, validExecutionIdentity,
  type ExecutionIdentity, type LedgerDb
} from './departmentExecutionLedger'

type Args<N extends DepartmentContentToolName> = z.infer<(typeof departmentContentContracts)[N]>
const WRITES = new Set<string>(DEPARTMENT_CONTENT_WRITE_NAMES)

export interface DepartmentContentDeps {
  isEntitled?: (clientId: string) => Promise<boolean>
  publish?: typeof import('~~/server/utils/searchAuthority/contentPublication').publishSearchAuthorityContent
  requireReviewer?: typeof import('./reviewAuthority').requireIndependentMarketingReviewer
  now?: () => Date
}

const freshReader: LedgerDb = { query: async (sql, params) => ({ rows: await queryRowsFresh(sql, params as unknown[]) }) }

async function entitled(clientId: string, deps: DepartmentContentDeps): Promise<boolean> {
  if (deps.isEntitled) return deps.isEntitled(clientId)
  const { isSearchAuthorityEnabled } = await import('~~/server/utils/searchAuthority/feature')
  const { queryOneFresh } = await import('~~/server/utils/db')
  return isSearchAuthorityEnabled(clientId, {
    queryEntitlement: (id, featureKey) => queryOneFresh(`SELECT status, starts_at, expires_at FROM client_feature_entitlements
      WHERE client_id = $1 AND feature_key = $2 LIMIT 1`, [id, featureKey])
  })
}

async function authorize(ctx: ToolContext, clientId: string, write: boolean, deps: DepartmentContentDeps): Promise<ToolContext> {
  const fresh = await requireMarketingDepartment(ctx, write)
  await requireScopedClient(await resolveMarketingReadScope(fresh), clientId)
  if (!await entitled(clientId, deps)) refuse('Search Authority is not enabled for this client', 'not_entitled')
  return fresh
}

// ----------------------------------------------------------------------------- version identity

interface VersionRow {
  id: string
  asset_id: string
  version_number: number
  body_markdown: string
  excerpt: string
  disclaimer: string
  schema_type: string
  source_interview_ids: string[]
  source_version_id: string | null
  created_by: string
  created_at: unknown
}
interface ClaimRow { version_id: string, claim: string, source_type: string, source_reference: string, expires_at: string | null }

/** Hash of exactly what a reviewer approves and the renderer publishes (body, metadata, sources, claims). */
export function contentHashOf(version: VersionRow, claims: ClaimRow[]): string {
  return sha256({
    bodyMarkdown: version.body_markdown,
    excerpt: version.excerpt,
    disclaimer: version.disclaimer ?? '',
    schemaType: version.schema_type,
    sourceInterviewIds: [...(version.source_interview_ids ?? [])].map(String).sort(),
    sourceVersionId: version.source_version_id ?? null,
    claims: claims.filter(c => c.version_id === version.id)
      .map(c => ({ claim: c.claim, sourceType: c.source_type, sourceReference: c.source_reference, expiresAt: c.expires_at ?? null }))
      .sort((a, b) => canonicalSort(a, b))
  })
}
const canonicalSort = (a: Record<string, unknown>, b: Record<string, unknown>) => JSON.stringify(a).localeCompare(JSON.stringify(b))

const VERSION_COLUMNS = `version.id, version.asset_id, version.version_number, version.body_markdown, version.excerpt,
  version.disclaimer, version.schema_type, version.source_interview_ids::text[] AS source_interview_ids,
  version.source_version_id, version.created_by, version.created_at`
const CLAIM_SQL = `SELECT claim.version_id, claim.claim, claim.source_type, claim.source_reference,
    to_char(claim.expires_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS expires_at
  FROM search_authority_version_claims claim WHERE claim.client_id = $1 AND claim.version_id = ANY($2::uuid[])
  ORDER BY claim.created_at, claim.id`

interface AssetRow { id: string, status: string, current_version_id: string | null, created_by: string, site_id: string, slug: string, title: string }

async function lockAsset(db: LedgerDb, clientId: string, assetId: string): Promise<AssetRow> {
  const asset = (await db.query(`SELECT asset.id, asset.status, asset.current_version_id, asset.created_by, asset.site_id, asset.slug, asset.title
    FROM search_authority_content_assets asset JOIN agency_clients c ON c.id = asset.client_id AND c.is_active = TRUE
    WHERE asset.id = $1 AND asset.client_id = $2 FOR UPDATE OF asset`, [assetId, clientId])).rows[0] as AssetRow | undefined
  if (!asset) refuse('Content asset not available for this client', 'not_found')
  return asset
}

/** Locks the asset and proves the caller is acting on its exact current version and content. */
async function exactCurrentVersion(db: LedgerDb, args: { clientId: string, assetId: string, versionId: string, expectedContentHash: string }) {
  const asset = await lockAsset(db, args.clientId, args.assetId)
  if (asset.current_version_id !== args.versionId) refuse('This is not the asset\'s current version; reload before acting', 'conflict')
  const version = (await db.query(`SELECT ${VERSION_COLUMNS} FROM search_authority_content_versions version
    WHERE version.id = $1 AND version.asset_id = $2 AND version.client_id = $3`, [args.versionId, args.assetId, args.clientId])).rows[0] as VersionRow | undefined
  if (!version) refuse('Content version not available', 'not_found')
  const claims = (await db.query(CLAIM_SQL, [args.clientId, [version.id]])).rows as ClaimRow[]
  if (contentHashOf(version, claims) !== args.expectedContentHash) refuse('Content does not match the hash you reviewed; reload before acting', 'conflict')
  return { asset, version }
}

async function lastSubmitter(db: LedgerDb, clientId: string, assetId: string, versionId: string): Promise<string | null> {
  const row = (await db.query(`SELECT actor_id FROM search_authority_content_audit_events
    WHERE client_id = $1 AND asset_id = $2 AND version_id = $3 AND event_type = 'version.submitted'
    ORDER BY created_at DESC, id DESC LIMIT 1`, [clientId, assetId, versionId])).rows[0]
  return row?.actor_id ?? null
}

// ---------------------------------------------------------------------------------------- reads

async function listAssets(args: Args<'marketing_list_content_assets'>) {
  const params: unknown[] = [args.clientId]
  const where = ['asset.client_id = $1']
  if (args.status) {
    params.push(args.status)
    where.push(`asset.status = $${params.length}`)
  }
  if (args.afterId) {
    params.push(args.afterId)
    where.push(`asset.id > $${params.length}::uuid`)
  }
  params.push(args.limit + 1)
  const rows = await queryRowsFresh<{ id: string }>(`SELECT asset.id, asset.site_id, asset.slug, asset.title, asset.topic, asset.status,
      asset.current_version_id, asset.opportunity_id, asset.task_id, asset.updated_at,
      pub.status AS latest_publication_status, pub.public_url AS latest_public_url, pub.published_at AS latest_published_at
    FROM search_authority_content_assets asset
    JOIN agency_clients c ON c.id = asset.client_id AND c.is_active = TRUE
    LEFT JOIN LATERAL (SELECT p.status, p.public_url, p.published_at FROM search_authority_publications p
      WHERE p.client_id = asset.client_id AND p.asset_id = asset.id ORDER BY p.created_at DESC, p.id DESC LIMIT 1) pub ON TRUE
    WHERE ${where.join(' AND ')} ORDER BY asset.id LIMIT $${params.length}`, params)
  const items = rows.slice(0, args.limit)
  return ok({ clientId: args.clientId, items, nextCursor: rows.length > args.limit ? items.at(-1)!.id : null, complete: rows.length <= args.limit, storedOnly: true })
}

async function getAsset(args: Args<'marketing_get_content_asset'>) {
  const asset = (await freshReader.query(`SELECT asset.id, asset.site_id, asset.slug, asset.title, asset.topic, asset.status,
      asset.current_version_id, asset.opportunity_id, asset.task_id, asset.created_by, asset.updated_at,
      site.canonical_hostname, site.content_hostname
    FROM search_authority_content_assets asset
    JOIN agency_clients c ON c.id = asset.client_id AND c.is_active = TRUE
    JOIN search_authority_sites site ON site.client_id = asset.client_id AND site.id = asset.site_id
    WHERE asset.id = $1 AND asset.client_id = $2`, [args.assetId, args.clientId])).rows[0]
  if (!asset) return fail('Content asset not available for this client', 'not_found')
  const versions = (await freshReader.query(`SELECT ${VERSION_COLUMNS} FROM search_authority_content_versions version
    WHERE version.client_id = $1 AND version.asset_id = $2 ORDER BY version.version_number DESC LIMIT 50`, [args.clientId, args.assetId])).rows as VersionRow[]
  const claims = versions.length ? (await freshReader.query(CLAIM_SQL, [args.clientId, versions.map(v => v.id)])).rows as ClaimRow[] : []
  const [interviews, decisions, publications] = await Promise.all([
    queryRowsFresh(`SELECT id, interviewee_name, interviewee_role, occurred_at, LEFT(source_summary, 2000) AS source_summary,
        consent_confirmed, recorded_by FROM search_authority_source_interviews
      WHERE client_id = $1 AND asset_id = $2 ORDER BY occurred_at DESC LIMIT 50`, [args.clientId, args.assetId]),
    queryRowsFresh(`SELECT version_id, decision, rationale, decided_by, actor_type, decided_at FROM search_authority_approval_decisions
      WHERE client_id = $1 AND asset_id = $2 ORDER BY decided_at DESC LIMIT 50`, [args.clientId, args.assetId]),
    queryRowsFresh(`SELECT id, version_id, status, public_url, published_at FROM search_authority_publications
      WHERE client_id = $1 AND asset_id = $2 ORDER BY created_at DESC LIMIT 20`, [args.clientId, args.assetId])
  ])
  return ok({
    clientId: args.clientId,
    asset,
    versions: versions.map(version => ({
      versionId: version.id,
      versionNumber: Number(version.version_number),
      contentHash: contentHashOf(version, claims),
      isCurrent: version.id === asset.current_version_id,
      createdBy: version.created_by,
      createdAt: version.created_at,
      schemaType: version.schema_type,
      excerpt: version.excerpt,
      disclaimer: version.disclaimer,
      sourceInterviewIds: version.source_interview_ids,
      // Full body only for the current version to keep the response bounded.
      bodyMarkdown: version.id === asset.current_version_id ? version.body_markdown : undefined,
      claims: claims.filter(c => c.version_id === version.id)
    })),
    interviews,
    decisions,
    publications,
    reviewRule: 'Approval or rejection must come from an independent marketing manager or admin who neither authored nor submitted the version.'
  })
}

// ------------------------------------------------------------------------------------ mutations

async function createAsset(db: LedgerDb, ctx: ToolContext, args: Args<'marketing_create_content_asset'>, now: Date) {
  if (new Date(args.interview.occurredAt).getTime() > now.getTime()) refuse('The source interview must already have taken place', 'bad_args')
  const site = (await db.query(`SELECT id FROM search_authority_sites WHERE id = $1 AND client_id = $2`, [args.siteId, args.clientId])).rows[0]
  if (!site) refuse('Search Authority site not available for this client', 'not_found')
  if (args.opportunityId) {
    const opportunity = (await db.query(`SELECT id FROM search_authority_opportunities WHERE id = $1 AND client_id = $2`, [args.opportunityId, args.clientId])).rows[0]
    if (!opportunity) refuse('Opportunity not available for this client', 'not_found')
  }
  if (args.taskId) {
    const task = (await db.query(`SELECT t.id FROM tasks t JOIN projects p ON p.id = t.project_id WHERE t.id = $1 AND p.client_id = $2`, [args.taskId, args.clientId])).rows[0]
    if (!task) refuse('Task not available for this client', 'not_found')
  }
  const duplicate = (await db.query(`SELECT id FROM search_authority_content_assets WHERE site_id = $1 AND slug = $2`, [args.siteId, args.slug])).rows[0]
  if (duplicate) refuse('A guide with this slug already exists on the site', 'conflict')
  const { acknowledgement: _ack, ...input } = args
  const created = await createContentAsset(db, { ...input, actorId: ctx.userId })
  return { assetId: created.id, status: created.status, interviewId: created.interviewId, clientId: args.clientId }
}

async function createVersion(db: LedgerDb, ctx: ToolContext, args: Args<'marketing_create_content_version'>, now: Date) {
  const asset = await lockAsset(db, args.clientId, args.assetId)
  if ((asset.current_version_id ?? null) !== args.expectedCurrentVersionId) refuse('The asset changed since it was read; reload before drafting', 'conflict')
  if (asset.status === 'archived') refuse('Archived content cannot be edited', 'conflict')
  const sources = new Set(args.sourceInterviewIds)
  const recorded = (await db.query(`SELECT COUNT(*)::int AS n FROM search_authority_source_interviews
    WHERE client_id = $1 AND asset_id = $2 AND id = ANY($3::uuid[]) AND consent_confirmed = TRUE`, [args.clientId, args.assetId, [...sources]])).rows[0]
  if (Number(recorded?.n ?? 0) !== sources.size) refuse('Every source must be a consented interview recorded on this guide', 'bad_args')
  if (args.aiMetadata && args.aiMetadata.sourceIds.some(id => !sources.has(id))) refuse('AI metadata may only cite this version\'s source interviews', 'bad_args')
  if (args.claims.some(claim => claim.expiresAt && new Date(claim.expiresAt).getTime() <= now.getTime())) refuse('A claim\'s evidence has already expired', 'bad_args')
  const { acknowledgement: _ack, expectedCurrentVersionId: _expected, ...input } = args
  const created = await createContentVersion(db, { ...input, actorId: ctx.userId })
  const version = (await db.query(`SELECT ${VERSION_COLUMNS} FROM search_authority_content_versions version WHERE version.id = $1 AND version.client_id = $2`,
    [created.id, args.clientId])).rows[0] as VersionRow
  const claims = (await db.query(CLAIM_SQL, [args.clientId, [created.id]])).rows as ClaimRow[]
  return { assetId: args.assetId, versionId: created.id, versionNumber: created.versionNumber, contentHash: contentHashOf(version, claims), status: 'draft' }
}

async function submitVersion(db: LedgerDb, ctx: ToolContext, args: Args<'marketing_submit_content_version'>) {
  const { asset } = await exactCurrentVersion(db, args)
  if (!['draft', 'rejected'].includes(asset.status)) refuse('Only a draft or rejected current version can be submitted', 'conflict')
  await submitContentVersion(db, { clientId: args.clientId, assetId: args.assetId, versionId: args.versionId, actorId: ctx.userId })
  return { assetId: args.assetId, versionId: args.versionId, contentHash: args.expectedContentHash, status: 'in_review' }
}

async function reviewVersion(db: LedgerDb, ctx: ToolContext, args: Args<'marketing_review_content_version'>, deps: DepartmentContentDeps) {
  const { asset, version } = await exactCurrentVersion(db, args)
  if (asset.status !== 'in_review') refuse('Only a submitted current version can be reviewed', 'conflict')
  const submitter = await lastSubmitter(db, args.clientId, args.assetId, args.versionId)
  if (version.created_by === ctx.userId || submitter === ctx.userId) refuse('Authors and submitters cannot review their own content version', 'forbidden')
  const requireReviewer = deps.requireReviewer ?? (await import('./reviewAuthority')).requireIndependentMarketingReviewer
  await requireReviewer(ctx.event, { requesterId: version.created_by, clientId: args.clientId, reviewerId: ctx.userId })
  const decision = { clientId: args.clientId, assetId: args.assetId, versionId: args.versionId, actorId: ctx.userId, rationale: args.rationale }
  if (args.decision === 'approve') await approveContentVersion(db, decision)
  else await rejectContentVersion(db, decision)
  return { assetId: args.assetId, versionId: args.versionId, contentHash: args.expectedContentHash, status: args.decision === 'approve' ? 'approved' : 'rejected', published: false }
}

async function localMutation(name: DepartmentContentToolName, args: { clientId: string }, ctx: ToolContext, key: string, digest: string, deps: DepartmentContentDeps) {
  const fresh = await authorize(ctx, args.clientId, true, deps)
  const identity: ExecutionIdentity = { actorId: fresh.userId, key, digest, tool: name, clientId: args.clientId, inputHash: sha256({ name, args }), executor: 'local-transactional' }
  const now = deps.now?.() ?? new Date()
  return transaction(async (pool) => {
    const db = pool as unknown as LedgerDb
    const claim = await claimExecution(db, identity)
    if (claim.kind !== 'fresh') return claimOutcome(claim)
    const result = name === 'marketing_create_content_asset'
      ? await createAsset(db, fresh, args as Args<typeof name>, now)
      : name === 'marketing_create_content_version'
        ? await createVersion(db, fresh, args as Args<typeof name>, now)
        : name === 'marketing_submit_content_version'
          ? await submitVersion(db, fresh, args as Args<typeof name>)
          : await reviewVersion(db, fresh, args as Args<'marketing_review_content_version'>, deps)
    await finishExecution(db, identity, result)
    return ok({ ...result, committed: true })
  })
}

/** Revalidate the current exact version and its independent approver, including portal revocation. */
async function assertPublishApproval(db: LedgerDb, ctx: ToolContext, args: Args<'marketing_publish_content_version'>, deps: DepartmentContentDeps) {
  const { asset, version } = await exactCurrentVersion(db, args)
  if (asset.status !== 'approved') refuse('Only the current approved version can be published', 'conflict')
  const approval = (await db.query(`SELECT decided_by, decided_by_client_user_id, actor_type FROM search_authority_approval_decisions
    WHERE client_id = $1 AND asset_id = $2 AND version_id = $3 AND decision = 'approved'
    ORDER BY decided_at DESC LIMIT 1`, [args.clientId, args.assetId, args.versionId])).rows[0]
  if (!approval) refuse('No independent approval is recorded for this version', 'forbidden')
  if (approval.actor_type === 'portal') {
    const reviewer = (await db.query(`SELECT id FROM client_users
      WHERE id = $1 AND client_id = $2 AND status = 'active' AND can_approve_work = TRUE`,
    [approval.decided_by_client_user_id, args.clientId])).rows[0]
    if (!reviewer) refuse('The portal approver no longer has approval authority', 'forbidden')
  } else {
    const submitter = await lastSubmitter(db, args.clientId, args.assetId, args.versionId)
    if (approval.decided_by === version.created_by || approval.decided_by === submitter) refuse('Content approval must be independent of its author and submitter', 'forbidden')
    const requireReviewer = deps.requireReviewer ?? (await import('./reviewAuthority')).requireIndependentMarketingReviewer
    await requireReviewer(ctx.event, { requesterId: version.created_by, clientId: args.clientId, reviewerId: approval.decided_by })
  }
}

/** Provider path: claim commits first; definite pre-dispatch refusals fail closed, anything after dispatch is held. */
async function publishVersion(args: Args<'marketing_publish_content_version'>, ctx: ToolContext, key: string, digest: string, deps: DepartmentContentDeps): Promise<ToolResult> {
  let fresh = await authorize(ctx, args.clientId, true, deps)
  const identity: ExecutionIdentity = { actorId: fresh.userId, key, digest, tool: 'marketing_publish_content_version', clientId: args.clientId, inputHash: sha256({ args }), executor: 'external-provider' }
  const claimed = await transaction(async (pool) => {
    const db = pool as unknown as LedgerDb
    const claim = await claimExecution(db, identity)
    if (claim.kind !== 'fresh') return claimOutcome(claim)
    await assertPublishApproval(db, fresh, args, deps)
    return null
  })
  if (claimed) return claimed
  let dispatched = false
  const close = async (state: 'succeeded' | 'failed' | 'ambiguous', result: Record<string, unknown>) =>
    transaction(async pool => finishExecution(pool as unknown as LedgerDb, identity, result, state))
  try {
    // Re-check revocation immediately before the provider write.
    fresh = await authorize(fresh, args.clientId, true, deps)
    const publish = deps.publish ?? (await import('~~/server/utils/searchAuthority/contentPublication')).publishSearchAuthorityContent
    const published = await publish(ctx.event, {
      clientId: args.clientId, assetId: args.assetId, actorId: fresh.userId, expectedVersionId: args.versionId,
      onDispatchStart: async () => {
        fresh = await authorize(fresh, args.clientId, true, deps)
        await transaction(async db => assertPublishApproval(db, fresh, args, deps))
        dispatched = true
      }
    })
    const result = { assetId: args.assetId, versionId: published.versionId, contentHash: args.expectedContentHash, publicationId: published.publicationId, manifestVersion: published.manifestVersion, publicUrl: published.publicUrl, status: 'published' }
    try {
      await close('succeeded', result)
    } catch {
      return ok({ ...result, ledgerRecorded: false, note: 'Published, but the execution record could not be finalised; do not retry.' })
    }
    return ok(result)
  } catch (error) {
    if (dispatched) {
      await close('ambiguous', { assetId: args.assetId, versionId: args.versionId, reconciliationRequired: true }).catch(() => undefined)
      return fail('Publication outcome requires reconciliation; check the asset\'s publications before any retry', 'reconciliation_required')
    }
    const message = refusalOf(error)
      ? (refusalOf(error) as { error: string }).error
      : (error as { statusMessage?: string })?.statusMessage ?? 'Publication could not start'
    await close('failed', { assetId: args.assetId, versionId: args.versionId, error: message.slice(0, 300) }).catch(() => undefined)
    const status = (error as { statusCode?: number })?.statusCode
    const code = status === 403 ? 'forbidden' : status === 404 ? 'not_found' : status === 503 ? 'unavailable' : 'conflict'
    return refusalOf(error) ?? fail(message, code)
  }
}

export async function runDepartmentContentOperation(
  name: string, raw: unknown, ctx: ToolContext, key?: string, digest?: string, deps: DepartmentContentDeps = {}
): Promise<ToolResult> {
  const contract = departmentContentContracts[name as DepartmentContentToolName]
  if (!contract) return fail('Unknown department content operation', 'not_found')
  const parsed = contract.safeParse(raw)
  if (!parsed.success) return fail('Invalid department content arguments', 'bad_args')
  const args = parsed.data as { clientId: string }
  try {
    if (WRITES.has(name)) {
      if (!validExecutionIdentity(key, digest)) return fail('Verified logical request identity required', 'coordinator_required')
      if (name === 'marketing_publish_content_version') return await publishVersion(args as Args<typeof name>, ctx, key, digest!, deps)
      return await localMutation(name as DepartmentContentToolName, args, ctx, key, digest!, deps)
    }
    await authorize(ctx, args.clientId, false, deps)
    return name === 'marketing_list_content_assets'
      ? await listAssets(args as Args<'marketing_list_content_assets'>)
      : await getAsset(args as Args<'marketing_get_content_asset'>)
  } catch (error) {
    const refusal = refusalOf(error)
    if (refusal) return refusal
    const status = (error as { statusCode?: number })?.statusCode
    if (status === 403) return fail('Not permitted for this marketing content request', 'forbidden')
    if (status === 404) return fail('Client not available', 'not_found')
    return fail('Department content operation unavailable', 'unavailable')
  }
}
