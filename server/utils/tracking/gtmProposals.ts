import { gtmVersionReview, gtmReplacementChanges, gtmProposalProjection, safeGtmConfiguration } from './gtmReview'
import { createError } from 'h3'
import { z } from 'zod'
import type { ToolContext } from '~~/server/utils/ai/toolContext'
import { queryOneFresh, queryRowsFresh, transaction } from '~~/server/utils/db'
import {
  assertMarketingCapabilityAtBoundary,
  requireIndependentMarketingReviewer
} from '~~/server/utils/ai/marketing/reviewAuthority'
import {
  assertGtmSite,
  assertGtmBindingForSite,
  assertGtmConnectionForClient
} from '~~/server/utils/ai/marketing/gtmAccess'
import { resolveMcpStaffContext } from '~~/server/utils/ai/mcp/staffAuthority'
import {
  reserveGtmApiQuota,
  resolveGtmAccessToken
} from '~~/server/utils/googleTagManagerStore'
import * as api from '~~/server/utils/googleTagManagerClient'
import {
  installXeroFlowViaGtm,
  getGtmInstallationIdentity,
  upsertGtmContainerBinding
} from '~~/server/utils/googleTagManagerInstaller'
import { getGtmOwnership, gtmHash } from './gtmOwnership'
import { compileGtmTemplate } from './gtmTemplateRegistry'
import {
  assertManagedGtmUpdate,
  executeGtmTypedChanges,
  gtmTypedChangeRequestCount,
  verifyGtmVersion
} from './gtmTypedChanges'
import { GtmProposalInput } from './gtmProposalSchemas'

import { isMarketingManagementContext } from '~~/server/utils/marketingManagement'

const UUID = z.string().uuid()
export { GtmProposalInput } from './gtmProposalSchemas'

const reviewInput = z.strictObject({
  proposalId: UUID,
  expectedHash: z.string().regex(/^[a-f0-9]{64}$/)
})
const conflict = (message: string): never => {
  throw createError({ statusCode: 409, statusMessage: message })
}
const call = async <T>(fn: () => Promise<T>) => {
  await reserveGtmApiQuota(1)
  return fn()
}
async function credential(
  ctx: ToolContext,
  connectionId: string,
  publish = false
) {
  const value = await resolveGtmAccessToken(ctx.event, connectionId)
  const needed = [
    'edit.containers',
    ...(publish ? ['publish'] : ['edit.containerversions'])
  ]
  if (
    needed.some(
      s =>
        !value.scopes.includes(
          `https://www.googleapis.com/auth/tagmanager.${s}`
        )
    )
  )
    throw createError({
      statusCode: 403,
      statusMessage: 'Reconnect GTM with required scopes'
    })
  return value.token
}
// Internal only: publication construction and verification require the exact persisted manifest.
// Never return this raw row from a staff or browser boundary.
async function loadAuthorizedGtmChangeProposal(ctx: ToolContext, id: string) {
  UUID.parse(id)
  const row = await queryOneFresh<any>(
    'SELECT * FROM gtm_change_proposals WHERE id=$1',
    [id]
  )
  if (!row)
    throw createError({ statusCode: 404, statusMessage: 'Proposal not found' })
  const site = await assertGtmSite(ctx, row.site_id)
  if (site.client_id !== row.client_id)
    conflict('Tracking site ownership changed')
  const binding
    = row.action_type === 'binding'
      ? null
      : await assertGtmBindingForSite(ctx, row.site_id)
  if (
    binding
    && (binding.id !== row.binding_id
      || binding.connection_id !== row.connection_id
      || binding.container_path !== row.desired_state.containerPath)
  )
    conflict('Container binding changed')
  if (row.action_type === 'binding') {
    const current = await queryOneFresh(
      `SELECT id,connection_id,container_path FROM gtm_container_bindings WHERE tracking_site_id=$1`,
      [row.site_id]
    )
    if (row.status === 'verified') {
      if (
        !current
        || current.connection_id !== row.connection_id
        || current.container_path !== row.desired_state.containerPath
      )
        conflict('Applied binding changed')
    } else if (
      gtmHash(current) !== gtmHash(row.desired_state.previousBinding ?? null)
    )
      conflict('Site binding changed since review')
  }
  await assertGtmConnectionForClient(ctx, row.connection_id, row.client_id)
  const cross = await queryOneFresh(
    `SELECT b.id FROM gtm_container_bindings b JOIN tracking_sites s ON s.id=b.tracking_site_id WHERE b.container_path=$1 AND s.client_id<>$2 LIMIT 1`,
    [row.desired_state.containerPath, row.client_id]
  )
  if (cross)
    throw createError({
      statusCode: 403,
      statusMessage: 'Container ownership changed'
    })
  return row
}
/** Safe staff/browser view; the stored intent and request hash remain unchanged. */
export async function getGtmChangeProposal(ctx: ToolContext, id: string) {
  return gtmProposalProjection(await loadAuthorizedGtmChangeProposal(ctx, id))
}
export async function listGtmSiteInventory(
  ctx: ToolContext,
  siteId: string,
  workspacePath?: string
) {
  const binding = await assertGtmBindingForSite(ctx, siteId)
  if (
    workspacePath
    && (!workspacePath.startsWith(`${binding.container_path}/workspaces/`)
      || api.assertGtmWorkspacePath(workspacePath) !== workspacePath)
  )
    throw createError({
      statusCode: 403,
      statusMessage: 'Workspace does not belong to this site'
    })
  const token = await credential(ctx, binding.connection_id)
  const live = await call(() =>
    api.getLiveGtmVersion(token, binding.container_path)
  )
  if (!live.path.startsWith(`${binding.container_path}/versions/`))
    conflict('Container mismatch')
  // Version inventory is bounded and contains no credential or XeroFlow installer script payload.
  const summaries = (values: any[] = []) => {
    if (values.length > 500)
      conflict('Container exceeds bounded inventory limit')
    return values.map(e => ({
      id: e.tagId ?? e.triggerId ?? e.variableId ?? e.folderId,
      path: e.path,
      name: e.name,
      type: e.type,
      fingerprint: e.fingerprint
    }))
  }
  const workspaces = await api.listBoundedGtmWorkspaces(
    token,
    binding.container_path
  )
  const workspaceInventory: Record<string, unknown> = {}
  if (workspacePath)
    for (const kind of ['tags', 'triggers', 'variables', 'folders'] as const)
      workspaceInventory[kind] = summaries(
        await api.listGtmEntities(token, workspacePath, kind)
      )
  return {
    binding,
    workspaces,
    workspaceInventory,
    liveVersion: { path: live.path, fingerprint: live.fingerprint },
    tags: summaries(live.tag),
    triggers: summaries(live.trigger),
    variables: summaries(live.variable as any[]),
    folders: summaries((live as any).folder),
    evidence: 'provider_inventory_only',
    conversionDelivery: 'not_verified'
  }
}
export async function createGtmChangeProposal(
  ctx: ToolContext,
  raw: unknown,
  key: string
) {
  const input = GtmProposalInput.parse(raw),
    site = await assertGtmSite(ctx, input.siteId, true)
  const evidence = await getGtmOwnership(
    ctx,
    site.id,
    input.ownershipEvidenceId
  )
  const existing = await queryOneFresh<any>(
    'SELECT id,desired_state FROM gtm_change_proposals WHERE requester_id=$1 AND idempotency_key=$2',
    [ctx.userId, key]
  )
  if (existing) {
    if (gtmHash(existing.desired_state.input) !== gtmHash(input))
      conflict('Idempotency key already used')
    return getGtmChangeProposal(ctx, existing.id)
  }
  const binding
    = input.action === 'binding'
      ? null
      : await assertGtmBindingForSite(ctx, site.id)
  const connectionId
    = binding?.connection_id
      ?? (input as Extract<typeof input, { action: 'binding' }>).connectionId
  await assertGtmConnectionForClient(ctx, connectionId, site.client_id)
  const containerPath
    = binding?.container_path
      ?? (input as Extract<typeof input, { action: 'binding' }>).containerPath
  if (input.action === 'workspace')
    for (const change of input.changes)
      if (change.action === 'update') {
        const { kind } = compileGtmTemplate(change.template)
        api.assertGtmEntityPath(change.entityPath, kind)
        if (!change.entityPath.startsWith(`${containerPath}/workspaces/`))
          throw createError({
            statusCode: 403,
            statusMessage: 'Cross-container update denied'
          })
      }
  const cross = await queryOneFresh<any>(
    `SELECT b.id FROM gtm_container_bindings b JOIN tracking_sites s ON s.id=b.tracking_site_id WHERE b.container_path=$1 AND s.client_id<>$2 LIMIT 1`,
    [containerPath, site.client_id]
  )
  if (cross)
    throw createError({
      statusCode: 403,
      statusMessage: 'Container belongs to another client'
    })
  if (
    evidence.evidence.siteKind === 'native_driveagent'
    && input.action === 'workspace'
    && input.changes.some(
      c =>
        c.template.templateId === 'tag.google_ads_conversion.v1'
        || (c.template.templateId === 'tag.ga4_event.v1'
          && ['generate_lead', 'purchase'].includes(c.template.eventName))
    )
  )
    conflict(
      'Native accepted-lead conversions must use the supported server delivery path'
    )
  if (
    input.action === 'installation'
    && evidence.evidence.siteKind === 'native_driveagent'
  )
    conflict(
      'Native DriveAgent uses its supported server delivery; XeroFlow installation is not permitted'
    )
  let target: any = null, source: any = null
  if (input.action === 'publish' || input.action === 'rollback') {
    source = await loadAuthorizedGtmChangeProposal(ctx, input.sourceProposalId)
    if (
      source.site_id !== site.id
      || source.connection_id !== connectionId
      || source.desired_state.containerPath !== containerPath
    )
      conflict('Source proposal mapping mismatch')
    if (input.action === 'publish') {
      if (
        source.status !== 'versioned'
        || !source.result?.versionPath
        || !source.result?.versionFingerprint
      )
        conflict('Exact reviewed compiled version required')
      target = {
        path: source.result.versionPath,
        fingerprint: source.result.versionFingerprint,
        managed: source.result.managed ?? []
      }
    } else {
      if (source.action_type !== 'publish' || source.status !== 'verified')
        conflict('Rollback requires a verified publish record')
      target = {
        path: source.base_live_path,
        fingerprint: source.base_live_fingerprint,
        managed: []
      }
    }
  }
  const installation = input.action === 'installation' ? await getGtmInstallationIdentity(ctx.event, site.id) : null
  const token = await credential(
    ctx,
    connectionId,
    input.action === 'publish' || input.action === 'rollback'
  )
  const live = await call(() => api.getLiveGtmVersion(token, containerPath))
  if (!live.path.startsWith(`${containerPath}/versions/`) || !live.fingerprint)
    conflict('Exact live snapshot required')
  const beforeChanges: any[] = []
  if (input.action === 'workspace')
    for (const change of input.changes) {
      const { kind, body } = compileGtmTemplate(change.template)
      if (change.action === 'update') {
        const current = await call(() =>
          api.getGtmEntity(token, change.entityPath, kind)
        )
        if (current.fingerprint !== change.expectedFingerprint)
          conflict('GTM entity drift')
        assertManagedGtmUpdate(current, body)
        // Only managed configuration is included; no arbitrary existing HTML or provider settings.
        beforeChanges.push(
          Object.fromEntries(
            Object.keys(body)
              .filter(k => k in current)
              .map(k => [k, current[k]])
          )
        )
      } else beforeChanges.push(null)
    }
  let targetVersion: any = null
  if (target) {
    if (input.action === 'publish' && (live.path !== source.base_live_path || live.fingerprint !== source.base_live_fingerprint))
      conflict('Live version changed since compilation; recompile and review before publication')
    const version = await call(() => api.getGtmVersion(token, target.path))
    if (version.fingerprint !== target.fingerprint)
      conflict('Target version drift')
    verifyGtmVersion(target.managed, version, containerPath)
    targetVersion = version
  }
  const previousBinding
    = input.action === 'binding'
      ? await queryOneFresh(
          `SELECT id,connection_id,container_path FROM gtm_container_bindings WHERE tracking_site_id=$1`,
          [site.id]
        )
      : null
  const desired = {
    previousBinding,
    input,
    containerPath,
    target,
    ownershipHash: evidence.evidence_hash,
    installation,
    review: {
      action: input.action,
      siteName: site.name ?? site.id,
      base: gtmVersionReview(live),
      target: targetVersion ? gtmVersionReview(targetVersion) : null,
      sourceProposalId: source?.id ?? null,
      sourceProposalHref: source ? `/agency/marketing/reviews/gtm#proposal-${source.id}` : null,
      changes: targetVersion
        ? gtmReplacementChanges(live, targetVersion)
        : input.action === 'workspace'
          ? input.changes.map((change, i) => ({ action: change.action, ...compileGtmTemplate(change.template), before: beforeChanges[i], after: compileGtmTemplate(change.template).body }))
          : input.action === 'installation'
            ? [{ action: 'install', name: installation!.review.siteName, before: gtmVersionReview(live), after: installation!.review }]
            : [{ action: 'binding', before: previousBinding, after: { connectionId, containerPath } }],
      installation: installation?.review ?? null,
      installationHash: installation?.hash ?? null,
      validation: 'Local schema and provider read snapshot only; execution compilation and live read-back are not yet available.',
      cost: 'Provider billing and downstream conversion cost impact are unavailable; no spend estimate is asserted.'
    }
  }
  const hash = gtmHash({
    desired,
    basePath: live.path,
    baseFingerprint: live.fingerprint,
    clientId: site.client_id,
    connectionId,
    requester: ctx.userId
  })
  const row = await queryOneFresh<any>(
    `INSERT INTO gtm_change_proposals(client_id,site_id,binding_id,connection_id,action_type,requester_id,desired_state,state_diff,request_hash,base_live_path,base_live_fingerprint,ownership_evidence_id,idempotency_key) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,$10,$11,$12,$13) ON CONFLICT(requester_id,idempotency_key) DO NOTHING RETURNING id`,
    [
      site.client_id,
      site.id,
      binding?.id ?? null,
      connectionId,
      input.action,
      ctx.userId,
      JSON.stringify(desired),
      JSON.stringify({
        before: {
          livePath: live.path,
          fingerprint: live.fingerprint,
          changes: beforeChanges,
          previousBinding
        },
        after: input
      }),
      hash,
      live.path,
      live.fingerprint,
      evidence.id,
      key
    ]
  )
  if (!row) {
    const replay = await queryOneFresh<any>(
      'SELECT id,request_hash FROM gtm_change_proposals WHERE requester_id=$1 AND idempotency_key=$2',
      [ctx.userId, key]
    )
    if (replay?.request_hash !== hash) conflict('Concurrent proposal conflict')
    return getGtmChangeProposal(ctx, replay.id)
  }
  return getGtmChangeProposal(ctx, row.id)
}
async function reviewedContext(ctx: ToolContext, id: string) {
  const row = await queryOneFresh<any>(
    'SELECT * FROM gtm_change_proposals WHERE id=$1',
    [UUID.parse(id)]
  )
  if (!row)
    throw createError({ statusCode: 404, statusMessage: 'Proposal not found' })
  if (ctx.clientScope && ctx.clientScope !== row.client_id)
    throw createError({ statusCode: 403, statusMessage: 'Proposal outside requested client scope' })
  await requireIndependentMarketingReviewer(ctx.event, {
    requesterId: row.requester_id,
    clientId: row.client_id,
    reviewerId: ctx.userId
  })
  const requester = await assertMarketingCapabilityAtBoundary(
    ctx.event,
    row.requester_id,
    row.client_id,
    'tracking_plan'
  )
  await loadAuthorizedGtmChangeProposal(requester, id)
  const evidence = await getGtmOwnership(
    requester,
    row.site_id,
    row.ownership_evidence_id
  )
  if (evidence.evidence_hash !== row.desired_state.ownershipHash)
    conflict('Ownership evidence changed')
  return { row, requester }
}
export async function getGtmReviewProposal(ctx: ToolContext, id: string) {
  return gtmProposalProjection((await reviewedContext(ctx, id)).row)
}

export async function reviewGtmChangeProposal(ctx: ToolContext, raw: unknown) {
  const input = reviewInput
    .extend({
      decision: z.enum(['approved', 'rejected']),
      reason: z.string().max(1000).optional()
    })
    .parse(raw)
  const { row } = await reviewedContext(ctx, input.proposalId)
  if (row.request_hash !== input.expectedHash) conflict('Proposal hash changed')
  if (!row.desired_state.review && input.decision === 'approved') conflict('Prepare a new proposal with exact review evidence')
  const result = await queryOneFresh<any>(
    `UPDATE gtm_change_proposals SET status=$3,reviewer_id=$4,reviewed_at=NOW(),result=$5::jsonb WHERE id=$1 AND request_hash=$2 AND status='pending_review' AND expires_at>NOW() AND requester_id<>$4 RETURNING *`,
    [
      row.id,
      input.expectedHash,
      input.decision,
      ctx.userId,
      JSON.stringify({ reviewReason: input.reason ?? null })
    ]
  )
  if (!result) conflict('Proposal expired or already reviewed')
  return gtmProposalProjection(result)
}
export async function listGtmReviewProposals(ctx: ToolContext) {
  const fresh = await resolveMcpStaffContext(ctx.event, ctx.userId, [])
  if ((!fresh.permissionGroups?.includes('ADMIN') && !isMarketingManagementContext(fresh)) || fresh.assistantReadOnly)
    throw createError({
      statusCode: 403,
      statusMessage: 'Reviewer authority required'
    })
  const rows = await queryRowsFresh<any>(
    `SELECT p.*,e.evidence AS ownership_evidence FROM gtm_change_proposals p JOIN gtm_tracking_ownership_evidence e ON e.id=p.ownership_evidence_id JOIN agency_clients c ON c.id=p.client_id AND c.is_active=TRUE WHERE requester_id<>$1 AND ($2::uuid[] IS NULL OR p.client_id=ANY($2)) AND ($3::uuid IS NULL OR p.client_id=$3) ORDER BY p.created_at DESC LIMIT 100`,
    [
      ctx.userId,
      fresh.assistantScope?.clientAccessMode === 'all_active'
        ? null
        : (fresh.assistantScope?.assignedClientIds ?? []),
      ctx.clientScope ?? null
    ]
  )
  const proposals = []
  for (const row of rows) {
    try {
      await requireIndependentMarketingReviewer(ctx.event, {
        requesterId: row.requester_id, clientId: row.client_id, reviewerId: ctx.userId
      })
      await assertMarketingCapabilityAtBoundary(ctx.event, row.requester_id, row.client_id, 'tracking_plan')
      proposals.push(gtmProposalProjection(row))
    } catch (error) {
      if (![403, 404].includes((error as { statusCode: number }).statusCode)) throw error
    }
  }
  return proposals
}
export async function executeApprovedGtmProposal(
  ctx: ToolContext,
  raw: unknown
) {
  const input = reviewInput.parse(raw),
    { row, requester } = await reviewedContext(ctx, input.proposalId)
  if (row.request_hash !== input.expectedHash || !row.reviewer_id)
    conflict('Exact reviewed proposal required')
  await requireIndependentMarketingReviewer(ctx.event, {
    requesterId: row.requester_id,
    clientId: row.client_id,
    reviewerId: row.reviewer_id
  })
  await transaction(async (db) => {
    // Durable connection-level serialization prevents concurrent container publications and also holds
    // uncertain work across process crashes. It is not a timed lease: an unknown result needs inspection.
    const locked = await db.query(
      `UPDATE gtm_connections SET metadata=jsonb_set(metadata,'{reviewedExecution}',to_jsonb($2::text)),updated_at=NOW() WHERE id=$1 AND status='active' AND NOT (metadata ? 'reviewedExecution') RETURNING id`,
      [row.connection_id, row.id]
    )
    if (!locked.rows.length)
      conflict(
        'Another reviewed GTM operation is active or requires inspection'
      )
    const claimed = await db.query(
      `UPDATE gtm_change_proposals SET status='executing',executor_id=$3,executed_at=NOW() WHERE id=$1 AND request_hash=$2 AND status='approved' AND expires_at>NOW() RETURNING id`,
      [row.id, input.expectedHash, ctx.userId]
    )
    if (!claimed.rows.length)
      conflict('Proposal is not executable; inspect its recorded result')
  })
  let writesStarted = false,
    quotaFailure: string | undefined,
    changeSetId: string | undefined
  try {
    if (row.action_type === 'publish') {
      const source = await loadAuthorizedGtmChangeProposal(requester, row.desired_state.input.sourceProposalId)
      if (source.status !== 'versioned' || source.base_live_path !== row.base_live_path || source.base_live_fingerprint !== row.base_live_fingerprint)
        conflict('Publication no longer matches its compilation base')
    }
    if (row.action_type === 'installation') {
      const identity = await getGtmInstallationIdentity(ctx.event, row.site_id)
      if (!row.desired_state.installation?.hash || identity.hash !== row.desired_state.installation.hash)
        conflict('Reviewed installation configuration changed')
    }
    // Reserve all reads, mutations and read-back before credentials or the first provider effect.
    const requests = row.action_type === 'workspace'
      ? 1 + gtmTypedChangeRequestCount(row.desired_state.input.changes)
      : row.action_type === 'installation' ? 11 : row.action_type === 'binding' ? 2 : 5
    if (requests > 20) {
      quotaFailure = `This operation needs ${requests} GTM requests; the supported bound is 20 per operation. Prepare a smaller separately reviewed proposal.`
      conflict(quotaFailure)
    }
    try {
      await reserveGtmApiQuota(requests)
    } catch (error: any) {
      if (error?.statusCode === 429) quotaFailure = 'GTM capacity is unavailable for the whole operation. Wait for the quota window, then prepare a new proposal; no provider write was attempted.'
      throw error
    }
    let remaining = requests
    const call = async <T>(fn: () => Promise<T>): Promise<T> => {
      if (--remaining < 0) throw new Error('GTM admitted request budget exceeded')
      return fn()
    }
    const beforeWrite = () => {
      writesStarted = true
    }
    const token = await credential(
      ctx,
      row.connection_id,
      ['publish', 'rollback'].includes(row.action_type)
    )
    const container = row.desired_state.containerPath
    const live = await call(() => api.getLiveGtmVersion(token, container))
    if (
      live.path !== row.base_live_path
      || live.fingerprint !== row.base_live_fingerprint
    )
      conflict('Live GTM version drift; create a new proposal')
    let result: any,
      status = 'verified'
    if (row.action_type === 'installation') {
      result = await installXeroFlowViaGtm(ctx.event, {
        siteId: row.site_id,
        userId: ctx.userId,
        publish: false,
        reviewed: {
          proposalId: row.id,
          bindingId: row.binding_id,
          connectionId: row.connection_id,
          requesterId: row.requester_id,
          reviewerId: row.reviewer_id,
          basePath: row.base_live_path,
          baseFingerprint: row.base_live_fingerprint,
          installationHash: row.desired_state.installation.hash
        },
        execution: { beforeWrite, quotaReserved: true }
      })
      if (result.effect === 'none') {
        status = result.status === 'already_installed' ? 'verified' : 'failed'
      } else {
        changeSetId = result.changeSetId
        if (!changeSetId) conflict('Installation returned no compiled change set')
        const compiled = await queryOneFresh<any>(
          'SELECT created_version_path,created_version_fingerprint,observed_after FROM gtm_change_sets WHERE id=$1 AND source_proposal_id=$2',
          [changeSetId, row.id]
        )
        if (
          !compiled?.created_version_path
          || !compiled.created_version_fingerprint
        )
          conflict('Installation version evidence missing')
        result = {
          versionPath: compiled.created_version_path,
          versionFingerprint: compiled.created_version_fingerprint,
          managed: result.managed ?? compiled.observed_after?.managed ?? conflict('Installation manifest missing'),
          installationPresence: 'versioned_only'
        }
        status = 'versioned'
      }
    } else if (row.action_type === 'binding') {
      const site = await assertGtmSite(requester, row.site_id)
      const accountPath = container.split('/').slice(0, 2).join('/')
      const target = await call(() => api.getGtmContainer(token, container))
      if (
        !target
        || target.path !== container
        || !target.domainName?.some(host =>
          site.allowed_origins.includes(`https://${host}`)
        )
        || !target.usageContext?.includes('web')
      )
        conflict('Exact public host and web container ownership required')
      result = await upsertGtmContainerBinding({
        siteId: row.site_id,
        userId: ctx.userId,
        connectionId: row.connection_id,
        account: { path: accountPath, name: accountPath },
        container: target!,
        beforeWrite
      })
    } else {
      const change = await queryOneFresh<any>(
        `INSERT INTO gtm_change_sets(binding_id,action_type,status,requested_by,approved_by,executed_by,approved_at,desired_state,previous_live_version_path,previous_live_version_fingerprint,source_proposal_id) VALUES($1,$2,'executing',$3,$4,$5,NOW(),$6::jsonb,$7,$8,$9) RETURNING id`,
        [
          row.binding_id,
          row.action_type === 'workspace'
            ? 'typed_workspace'
            : row.action_type === 'rollback'
              ? 'rollback'
              : 'reviewed_publish',
          row.requester_id,
          row.reviewer_id,
          ctx.userId,
          JSON.stringify(row.desired_state),
          live.path,
          live.fingerprint,
          row.id
        ]
      )
      changeSetId = change.id
      if (row.action_type === 'workspace') {
        result = await executeGtmTypedChanges(
          token,
          container,
          row.desired_state.input.changes,
          `Reviewed ${row.id}`,
          live,
          { call, beforeWrite }
        )
        status = 'versioned'
      } else {
        const target = row.desired_state.target,
          exact = await call(() => api.getGtmVersion(token, target.path))
        if (exact.fingerprint !== target.fingerprint)
          conflict('Target GTM version drift')
        verifyGtmVersion(target.managed, exact, container)
        // The target fingerprint does not lock the live version: repeat the base-live check immediately before publish.
        const current = await call(() =>
          api.getLiveGtmVersion(token, container)
        )
        if (
          current.path !== row.base_live_path
          || current.fingerprint !== row.base_live_fingerprint
        )
          conflict('Live GTM version drift')
        const published = await call(() => {
          beforeWrite()
          return api.publishGtmVersion(token, target.path, target.fingerprint)
        })
        if (published.compilerError)
          throw new Error('GTM publish compiler error')
        const after = await call(() => api.getLiveGtmVersion(token, container))
        if (
          after.path !== target.path
          || after.fingerprint !== target.fingerprint
        )
          throw new Error('GTM live read-back mismatch')
        verifyGtmVersion(target.managed, after, container)
        result = {
          versionPath: after.path,
          versionFingerprint: after.fingerprint,
          managed: target.managed,
          liveReadBack: true,
          conversionDelivery: 'not_verified'
        }
        status = row.action_type === 'rollback' ? 'rolled_back' : 'verified'
      }
    }
    await transaction(async (db) => {
      if (changeSetId)
        await db.query(
          `UPDATE gtm_change_sets SET status=$2,created_version_path=$3,created_version_fingerprint=$4,observed_after=$5::jsonb WHERE id=$1`,
          [
            changeSetId,
            status,
            result.versionPath ?? null,
            result.versionFingerprint ?? null,
            JSON.stringify(result)
          ]
        )
      await db.query(
        `UPDATE gtm_change_proposals SET status=$2,result=$3::jsonb,change_set_id=$4 WHERE id=$1 AND status='executing'`,
        [row.id, status, JSON.stringify(result), changeSetId ?? null]
      )
      if (row.action_type === 'publish') {
        await db.query(
          `UPDATE gtm_change_sets SET status='verified' WHERE source_proposal_id=$1 AND status='versioned'`,
          [row.desired_state.input.sourceProposalId]
        )
        await db.query(
          `UPDATE gtm_change_proposals SET status='verified',result=result || jsonb_build_object('publishedByProposalId',$2::text) WHERE id=$1 AND status='versioned'`,
          [row.desired_state.input.sourceProposalId, row.id]
        )
      }
      await db.query(
        `UPDATE gtm_connections SET metadata=metadata-'reviewedExecution' WHERE id=$1 AND metadata->>'reviewedExecution'=$2`,
        [row.connection_id, row.id]
      )
    })
    return safeGtmConfiguration({
      ok: status !== 'failed',
      proposalId: row.id,
      status,
      result,
      conversionDelivery: 'not_verified'
    })
  } catch {
    if (!writesStarted)
      await queryOneFresh(
        `UPDATE gtm_connections SET metadata=metadata-'reviewedExecution' WHERE id=$1 AND metadata->>'reviewedExecution'=$2 RETURNING id`,
        [row.connection_id, row.id]
      )
    await queryOneFresh(
      `UPDATE gtm_change_proposals SET status=$2,error_code=$3,change_set_id=$4 WHERE id=$1 AND status='executing' RETURNING id`,
      [
        row.id,
        writesStarted ? 'unknown' : 'failed',
        writesStarted ? 'verification_required' : quotaFailure ? 'quota_capacity' : 'precondition_failed',
        changeSetId ?? null
      ]
    )
    if (changeSetId)
      await queryOneFresh(
        `UPDATE gtm_change_sets SET status='failed',error_code=$2 WHERE id=$1 RETURNING id`,
        [
          changeSetId,
          writesStarted ? 'verification_required' : quotaFailure ? 'quota_capacity' : 'precondition_failed'
        ]
      )
    throw createError({
      statusCode: 409,
      statusMessage: writesStarted
        ? 'GTM outcome requires inspection; never retry blindly'
        : quotaFailure ?? 'GTM precondition failed; prepare a new proposal'
    })
  }
}
