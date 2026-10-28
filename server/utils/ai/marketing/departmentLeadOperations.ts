import type { z } from 'zod'
import { queryOneFresh, queryRowsFresh, transaction } from '~~/server/utils/db'
import { requireMarketingDepartment } from './departmentAuthority'
import { resolveMarketingReadScope, requireScopedClient } from './readScope'
import { departmentLeadContracts, departmentLeadRoutingInputSchema, DEPARTMENT_LEAD_WRITE_NAMES } from './departmentLeadSchemas'
import { claimExecution, claimOutcome, departmentCanonicalJson, finishExecution, refuse, refusalOf, sha256, validExecutionIdentity, type ExecutionIdentity, type LedgerDb } from './departmentExecutionLedger'
import { assignLeadFollowup, leadAssignmentRevision, type LeadAssignmentRow } from '~~/server/utils/leads/followupAssignment'
import { requireLeadAssigneeAuthority } from '~~/server/utils/leads/followupAccess'
import { assertLeadEmailRuleEndpoint, assertLeadRuleFormClient, validateLeadRuleDestination } from '~~/server/utils/leads/ruleConfiguration'
import { fail, ok, type ToolContext, type ToolResult } from '../toolContext'

const ACTION = 'department_lead_routing_change'
const WRITES = new Set<string>(DEPARTMENT_LEAD_WRITE_NAMES)
type RoutingInput = z.infer<typeof departmentLeadRoutingInputSchema>
type RuleRow = { id: string, client_id: string, source: string, form_id: string, form_name: string | null, enabled: boolean, created_by?: string | null }
type DestinationRow = { id: string, rule_id: string, destination_type: string, config: unknown, filter: unknown, delay_minutes: number, enabled: boolean, sort_order: number }
type Snapshot = { rule: RuleRow | null, destinations: DestinationRow[] }
type ProposalRow = {
  id: string
  user_id: string
  tool_name: string
  status: string
  expires_at: string
  confirmed_by: string | null
  resolved_payload: {
    version: 1
    action: string
    clientId: string
    input: RoutingInput
    before: Snapshot
    revision: string
    requestKey: string
    digest: string
    intentHash: string
    review?: { decision: 'approved' | 'rejected', reviewerId: string, reviewedAt: string, reason?: string }
  }
  result_payload: Record<string, unknown> | null
}
const freshDb: LedgerDb = { query: async (sql, params) => ({ rows: await queryRowsFresh(sql, params) }) }
async function authorize(ctx: ToolContext, clientId: string, write: boolean): Promise<ToolContext> {
  const fresh = await requireMarketingDepartment(ctx, write)
  await requireScopedClient(await resolveMarketingReadScope(fresh), clientId)
  return fresh
}
async function requireReviewer(ctx: ToolContext, row: ProposalRow, reviewerId = ctx.userId): Promise<void> {
  const { requireIndependentMarketingReviewer } = await import('./reviewAuthority')
  await requireIndependentMarketingReviewer(ctx.event, {
    requesterId: row.user_id,
    clientId: row.resolved_payload.clientId,
    reviewerId
  })
}
async function requireCurrentProposer(ctx: ToolContext, row: ProposalRow): Promise<void> {
  const { resolveMcpStaffContext } = await import('../mcp/staffAuthority')
  const proposer = await resolveMcpStaffContext(ctx.event, row.user_id, [])
  if (proposer.mcpStaffAuthority !== 'fresh'
    || !proposer.permissionGroups?.includes('MARKETING_MANAGEMENT')
    || !proposer.marketingCapabilities?.includes('department_management')
    || proposer.assistantReadOnly) refuse('Routing proposer authority is no longer available', 'approval_required')
  await requireScopedClient(await resolveMarketingReadScope(proposer), row.resolved_payload.clientId)
}
async function readSnapshot(db: LedgerDb, input: RoutingInput, lock = false): Promise<Snapshot> {
  if (lock) {
    const client = (await db.query('SELECT id FROM agency_clients WHERE id=$1 AND is_active=TRUE FOR UPDATE', [input.clientId])).rows[0]
    if (!client) refuse('Client is no longer active', 'not_found')
  }
  const ruleId = await assertLeadRuleFormClient(db, input)
  if (input.ruleId && !ruleId) refuse('Routing rule not found in active client scope', 'not_found')
  if (input.source === 'email') await assertLeadEmailRuleEndpoint(db, input)
  if (ruleId) {
    const conflict = (await db.query(`SELECT id,client_id FROM lead_form_rules WHERE source=$1 AND form_id=$2 AND id<>$3 LIMIT 1`,
      [input.source, input.formId, ruleId])).rows[0]
    if (conflict) refuse('Another rule already owns this source and form', 'conflict')
  }
  const rule = ruleId
    ? (await db.query(`SELECT r.id,r.client_id,r.source,r.form_id,r.form_name,r.enabled,r.created_by
        FROM lead_form_rules r JOIN agency_clients c ON c.id=r.client_id AND c.is_active=TRUE
        WHERE r.id=$1 AND r.client_id=$2${lock ? ' FOR UPDATE OF r' : ''}`, [ruleId, input.clientId])).rows[0] as RuleRow | undefined
    : null
  if (ruleId && !rule) refuse('Routing rule not found in active client scope', 'not_found')
  const destinations = rule
    ? (await db.query(`SELECT d.id,d.rule_id,d.destination_type,d.config,d.filter,d.delay_minutes,d.enabled,d.sort_order
        FROM lead_rule_destinations d WHERE d.rule_id=$1 ORDER BY d.sort_order,d.created_at,d.id${lock ? ' FOR UPDATE OF d' : ''}`,
      [rule.id])).rows as DestinationRow[]
    : []
  return { rule: rule ?? null, destinations }
}
function validateDestinationIds(input: RoutingInput, snapshot: Snapshot): void {
  const existing = new Set(snapshot.destinations.map(row => row.id))
  for (const destination of input.destinations) {
    if (destination.destinationId && !existing.has(destination.destinationId)) {
      refuse('Destination does not belong to the current client rule', 'forbidden')
    }
  }
}
async function validateRoutingInput(ctx: ToolContext, input: RoutingInput): Promise<void> {
  if (departmentCanonicalJson(input).length > 65_536) refuse('Routing request is too large', 'bad_args')
  for (const destination of input.destinations) {
    if (departmentCanonicalJson(destination.config).length > 16_384) refuse('Destination configuration is too large', 'bad_args')
    try {
      validateLeadRuleDestination(destination.destinationType, destination.config)
    } catch {
      refuse('Unknown destination or invalid destination configuration', 'bad_args')
    }
    if (destination.destinationType === 'assign_user') {
      const userId = (destination.config as { user_id?: unknown })?.user_id
      if (typeof userId !== 'string') refuse('Assignment destination requires active staff', 'bad_args')
      try {
        await requireLeadAssigneeAuthority(ctx.event, input.clientId, userId)
      } catch {
        refuse('Assignment destination staff no longer have current client authority', 'forbidden')
      }
    }
  }
}
function destinationView(destination: {
  id?: string
  destinationId?: string
  destination_type?: string
  destinationType?: string
  config: unknown
  filter?: unknown
  delay_minutes?: number
  delayMinutes?: number
  enabled: boolean
  sort_order?: number
  sortOrder?: number
}) {
  return {
    destinationId: destination.id ?? destination.destinationId ?? null,
    destinationType: destination.destination_type ?? destination.destinationType,
    enabled: destination.enabled,
    filter: destination.filter ?? null,
    delayMinutes: destination.delay_minutes ?? destination.delayMinutes ?? 0,
    sortOrder: destination.sort_order ?? destination.sortOrder ?? 0,
    configHash: sha256(destination.config)
  }
}
function snapshotView(snapshot: Snapshot) {
  return {
    rule: snapshot.rule
      ? {
          ruleId: snapshot.rule.id,
          clientId: snapshot.rule.client_id,
          source: snapshot.rule.source,
          formId: snapshot.rule.form_id,
          formName: snapshot.rule.form_name,
          enabled: snapshot.rule.enabled
        }
      : null,
    destinations: snapshot.destinations.map(destinationView)
  }
}
function proposedView(input: RoutingInput) {
  return {
    ruleId: input.ruleId ?? null,
    source: input.source,
    formId: input.formId,
    formName: input.formName ?? null,
    enabled: input.enabled,
    destinations: input.destinations.map(destinationView)
  }
}
function proposalView(row: ProposalRow) {
  const payload = row.resolved_payload
  return {
    proposalId: row.id,
    clientId: payload.clientId,
    revision: payload.revision,
    status: row.status,
    expiresAt: row.expires_at,
    before: snapshotView(payload.before),
    proposed: proposedView(payload.input),
    review: payload.review
      ? {
          decision: payload.review.decision,
          reviewerId: payload.review.reviewerId,
          reviewedAt: payload.review.reviewedAt,
          reasonRecorded: Boolean(payload.review.reason)
        }
      : null,
    outcome: row.result_payload,
    reconciliationRequired: row.status === 'executed' && !row.result_payload
  }
}
async function readProposal(ctx: ToolContext, proposalId: string, clientId: string, access: 'owner' | 'reviewer' | 'either'): Promise<ProposalRow> {
  const row = await queryOneFresh<ProposalRow>(`SELECT id,user_id,tool_name,status,expires_at,confirmed_by,resolved_payload,result_payload
    FROM ai_pending_actions WHERE id=$1 AND source='mcp' AND tool_name=$2`, [proposalId, ACTION])
  if (!row || row.resolved_payload?.version !== 1 || row.resolved_payload.action !== ACTION
    || row.resolved_payload.clientId !== clientId
    || (access === 'owner' && row.user_id !== ctx.userId)
    || (access === 'reviewer' && row.user_id === ctx.userId)) refuse('Routing proposal not found', 'not_found')
  if (access === 'reviewer' || (access === 'either' && row.user_id !== ctx.userId)) await requireReviewer(ctx, row)
  return row
}
async function getFollowup(raw: unknown, ctx: ToolContext): Promise<ToolResult> {
  const args = departmentLeadContracts[0][1].parse(raw)
  await authorize(ctx, args.clientId, false)
  const lead = await queryOneFresh<LeadAssignmentRow & {
    source: string
    form_id: string | null
    form_name: string | null
    campaign_id: string | null
    campaign_name: string | null
    submitted_at: string
    assignee_name?: string | null
  }>(`SELECT l.id,l.client_id,l.source,l.form_id,l.form_name,l.campaign_id,l.campaign_name,l.status,
      l.assigned_to,l.contacted_at,l.contacted_by,l.submitted_at,tm.name AS assignee_name
    FROM leads l JOIN agency_clients c ON c.id=l.client_id AND c.is_active=TRUE
    LEFT JOIN team_members tm ON tm.id=l.assigned_to
    WHERE l.id=$1 AND l.client_id=$2 AND l.deleted_at IS NULL AND l.is_test=FALSE`, [args.leadId, args.clientId])
  if (!lead) return fail('Lead not found in active client scope', 'not_found')
  const deliveries = await queryRowsFresh(`SELECT d.id,d.rule_destination_id,d.destination_type,d.status,
      d.scheduled_at,d.claimed_at,d.attempted_at,d.retry_count,d.created_at,d.updated_at
    FROM lead_deliveries d WHERE d.lead_id=$1 ORDER BY d.created_at,d.id LIMIT 100`, [args.leadId])
  let routing: Snapshot | null = null
  if (lead.form_id) {
    routing = await readSnapshot(freshDb, {
      clientId: args.clientId,
      source: lead.source as RoutingInput['source'],
      formId: lead.form_id,
      enabled: true,
      destinations: []
    })
  }
  return ok({
    followup: {
      leadId: lead.id,
      clientId: lead.client_id,
      source: lead.source,
      formId: lead.form_id,
      formName: lead.form_name,
      campaignId: lead.campaign_id,
      campaignName: lead.campaign_name,
      status: lead.status,
      assignedTo: lead.assigned_to,
      assigneeName: lead.assignee_name ?? null,
      contactedAt: lead.contacted_at,
      contactedBy: lead.contacted_by,
      submittedAt: lead.submitted_at
    },
    revision: leadAssignmentRevision(lead),
    routing: routing ? snapshotView(routing) : null,
    deliveries,
    storedOnly: true
  })
}
async function assignFollowup(raw: unknown, ctx: ToolContext, key: string, digest: string): Promise<ToolResult> {
  const args = departmentLeadContracts[1][1].parse(raw)
  const fresh = await authorize(ctx, args.clientId, true)
  if (args.assigneeId) await requireLeadAssigneeAuthority(ctx.event, args.clientId, args.assigneeId)
  const identity: ExecutionIdentity = {
    actorId: fresh.userId,
    key,
    digest,
    tool: 'marketing_assign_lead_followup',
    clientId: args.clientId,
    inputHash: sha256({ name: 'marketing_assign_lead_followup', args }),
    executor: 'local-transactional'
  }
  return transaction(async (pool) => {
    const db = pool as unknown as LedgerDb
    const claim = await claimExecution(db, identity)
    if (claim.kind !== 'fresh') return claimOutcome(claim)
    if (args.assigneeId) {
      const assignee = (await db.query('SELECT id FROM team_members WHERE id=$1 AND is_active=TRUE FOR UPDATE', [args.assigneeId])).rows[0]
      if (!assignee) refuse('Assignee is no longer active', 'forbidden')
    }
    const assigned = await assignLeadFollowup(db, {
      ...args,
      assigneeId: args.assigneeId ?? null
    })
    const result = { ...assigned, committed: true }
    await finishExecution(db, identity, result)
    return ok(result)
  })
}
async function listRules(raw: unknown, ctx: ToolContext): Promise<ToolResult> {
  const args = departmentLeadContracts[2][1].parse(raw)
  await authorize(ctx, args.clientId, false)
  const rules = await queryRowsFresh<RuleRow>(`SELECT r.id,r.client_id,r.source,r.form_id,r.form_name,r.enabled,r.created_by
    FROM lead_form_rules r JOIN agency_clients c ON c.id=r.client_id AND c.is_active=TRUE
    WHERE r.client_id=$1 AND ($2::uuid IS NULL OR r.id>$2) ORDER BY r.id LIMIT $3`,
  [args.clientId, args.afterId ?? null, args.limit + 1])
  const items = []
  for (const rule of rules.slice(0, args.limit)) {
    const snapshot = await readSnapshot(freshDb, {
      clientId: args.clientId,
      ruleId: rule.id,
      source: rule.source as RoutingInput['source'],
      formId: rule.form_id,
      enabled: rule.enabled,
      destinations: []
    })
    items.push({ ...snapshotView(snapshot), configurationHash: sha256(snapshot) })
  }
  return ok({
    items,
    nextCursor: rules.length > args.limit ? rules[args.limit - 1]?.id ?? null : null,
    storedOnly: true
  })
}
async function propose(raw: unknown, ctx: ToolContext, key: string, digest: string): Promise<ToolResult> {
  const input = departmentLeadRoutingInputSchema.parse(raw)
  const fresh = await authorize(ctx, input.clientId, true)
  await validateRoutingInput(fresh, input)
  const before = await readSnapshot(freshDb, input)
  validateDestinationIds(input, before)
  const revision = sha256({ action: ACTION, input, before })
  const intentHash = sha256({ action: ACTION, input })
  return transaction(async (pool) => {
    const db = pool as unknown as LedgerDb
    await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`${fresh.userId}:${key}`])
    const prior = (await db.query(`SELECT id,user_id,tool_name,status,expires_at,confirmed_by,resolved_payload,result_payload
      FROM ai_pending_actions WHERE user_id=$1 AND source='mcp' AND tool_name=$2 AND resolved_payload->>'requestKey'=$3`,
    [fresh.userId, ACTION, key])).rows[0] as ProposalRow | undefined
    if (prior) {
      if (prior.resolved_payload.intentHash !== intentHash || prior.resolved_payload.digest !== digest) {
        refuse('Idempotency key belongs to a different routing request', 'idempotency_conflict')
      }
      return ok(proposalView(prior))
    }
    const payload = {
      version: 1 as const,
      action: ACTION,
      clientId: input.clientId,
      input,
      before,
      revision,
      requestKey: key,
      digest,
      intentHash
    }
    const row = (await db.query(`INSERT INTO ai_pending_actions (user_id,tool_name,resolved_payload,status,source,conversation_id)
      VALUES ($1,$2,$3::jsonb,'proposed','mcp',NULL)
      RETURNING id,user_id,tool_name,status,expires_at,confirmed_by,resolved_payload,result_payload`,
    [fresh.userId, ACTION, JSON.stringify(payload)])).rows[0] as ProposalRow
    return ok(proposalView(row))
  })
}
async function review(raw: unknown, ctx: ToolContext): Promise<ToolResult> {
  const args = departmentLeadContracts[5][1].parse(raw)
  await authorize(ctx, args.clientId, true)
  const row = await readProposal(ctx, args.proposalId, args.clientId, 'reviewer')
  const payload = row.resolved_payload
  if (payload.revision !== args.expectedRevision) refuse('Routing revision changed', 'conflict')
  await requireCurrentProposer(ctx, row)
  await validateRoutingInput(ctx, payload.input)
  const current = await readSnapshot(freshDb, payload.input)
  validateDestinationIds(payload.input, current)
  if (sha256({ action: ACTION, input: payload.input, before: current }) !== payload.revision) {
    refuse('Routing configuration changed since proposal', 'conflict')
  }
  const reviewedPayload = {
    ...payload,
    review: {
      decision: args.decision,
      reviewerId: ctx.userId,
      reviewedAt: new Date().toISOString(),
      ...(args.reason ? { reason: args.reason } : {})
    }
  }
  const status = args.decision === 'approved' ? 'approved' : 'cancelled'
  const reviewed = await transaction(async (pool) => {
    const db = pool as unknown as LedgerDb
    return (await db.query(`UPDATE ai_pending_actions SET status=$3,confirmed_by=$4,resolved_payload=$5::jsonb
      WHERE id=$1 AND user_id=$2 AND source='mcp' AND tool_name=$6 AND status='proposed'
      AND expires_at>NOW() AND resolved_payload=$7::jsonb RETURNING id`,
    [row.id, row.user_id, status, ctx.userId, JSON.stringify(reviewedPayload), ACTION, JSON.stringify(payload)])).rows[0]
  })
  if (!reviewed) refuse('Routing proposal expired or was already reviewed', 'conflict')
  return ok(proposalView({ ...row, status, confirmed_by: ctx.userId, resolved_payload: reviewedPayload }))
}
async function applyRoutingChange(db: LedgerDb, row: ProposalRow): Promise<Record<string, unknown>> {
  const { input, before } = row.resolved_payload
  let ruleId = before.rule?.id ?? null
  if (ruleId) {
    const updated = await db.query(`UPDATE lead_form_rules SET client_id=$1,source=$2,form_id=$3,form_name=$4,enabled=$5,updated_at=NOW()
      WHERE id=$6 AND client_id=$1 RETURNING id`, [input.clientId, input.source, input.formId, input.formName ?? null, input.enabled, ruleId])
    if (updated.rowCount !== 1) refuse('Routing rule update rejected', 'conflict')
  } else {
    const inserted = await db.query(`INSERT INTO lead_form_rules (client_id,source,form_id,form_name,enabled,created_by)
      VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [input.clientId, input.source, input.formId, input.formName ?? null, input.enabled, row.user_id])
    ruleId = inserted.rows[0]?.id
    if (!ruleId) refuse('Routing rule creation rejected', 'unavailable')
  }
  let created = 0
  let updated = 0
  for (const destination of input.destinations) {
    if (destination.destinationId) {
      const result = await db.query(`UPDATE lead_rule_destinations SET destination_type=$3,config=$4::jsonb,filter=$5::jsonb,
        delay_minutes=$6,enabled=$7,sort_order=$8,updated_at=NOW() WHERE id=$1 AND rule_id=$2 RETURNING id`,
      [destination.destinationId, ruleId, destination.destinationType, JSON.stringify(destination.config),
        destination.filter ? JSON.stringify(destination.filter) : null, destination.delayMinutes, destination.enabled, destination.sortOrder])
      if (result.rowCount !== 1) refuse('Destination update rejected', 'conflict')
      updated++
    } else {
      const result = await db.query(`INSERT INTO lead_rule_destinations
        (rule_id,destination_type,config,filter,delay_minutes,enabled,sort_order)
        VALUES ($1,$2,$3::jsonb,$4::jsonb,$5,$6,$7) RETURNING id`,
      [ruleId, destination.destinationType, JSON.stringify(destination.config),
        destination.filter ? JSON.stringify(destination.filter) : null, destination.delayMinutes, destination.enabled, destination.sortOrder])
      if (!result.rows[0]?.id) refuse('Destination creation rejected', 'unavailable')
      created++
    }
  }
  const retained = new Set(input.destinations.map(destination => destination.destinationId).filter(Boolean))
  const removed = before.destinations.filter(destination => !retained.has(destination.id))
  if (removed.length) {
    const result = await db.query('DELETE FROM lead_rule_destinations WHERE rule_id=$1 AND id=ANY($2::uuid[])',
      [ruleId, removed.map(destination => destination.id)])
    if (result.rowCount !== removed.length) refuse('Destination removal rejected', 'conflict')
  }
  return {
    proposalId: row.id,
    revision: row.resolved_payload.revision,
    ruleId,
    destinationsCreated: created,
    destinationsUpdated: updated,
    destinationsDeleted: removed.length,
    affectedFutureLeadsOnly: true,
    deliveriesCreated: 0,
    leadsReplayed: 0,
    committed: true
  }
}
async function execute(raw: unknown, ctx: ToolContext, key: string, digest: string): Promise<ToolResult> {
  const args = departmentLeadContracts[6][1].parse(raw)
  const fresh = await authorize(ctx, args.clientId, true)
  const row = await readProposal(ctx, args.proposalId, args.clientId, 'owner')
  const payload = row.resolved_payload
  if (args.expectedRevision !== payload.revision) refuse('Routing revision changed', 'conflict')
  if (row.status === 'executed') {
    return row.result_payload
      ? ok({ ...row.result_payload, replayed: true })
      : fail('Routing outcome requires reconciliation; do not retry', 'reconciliation_required')
  }
  const reviewerId = payload.review?.reviewerId
  if (row.status !== 'approved' || payload.review?.decision !== 'approved' || !reviewerId
    || reviewerId === row.user_id || row.confirmed_by !== reviewerId || Date.parse(row.expires_at) <= Date.now()) {
    refuse('An unexpired independent routing approval is required', 'approval_required')
  }
  await requireCurrentProposer(ctx, row)
  await requireReviewer(ctx, row, reviewerId)
  await validateRoutingInput(fresh, payload.input)
  const identity: ExecutionIdentity = {
    actorId: fresh.userId,
    key,
    digest,
    tool: 'marketing_execute_lead_routing_change',
    clientId: args.clientId,
    inputHash: sha256({ name: 'marketing_execute_lead_routing_change', args }),
    executor: 'local-transactional'
  }
  return transaction(async (pool) => {
    const db = pool as unknown as LedgerDb
    const claim = await claimExecution(db, identity)
    if (claim.kind !== 'fresh') return claimOutcome(claim)
    const current = await readSnapshot(db, payload.input, true)
    validateDestinationIds(payload.input, current)
    if (sha256({ action: ACTION, input: payload.input, before: current }) !== payload.revision) {
      refuse('Routing configuration changed since approval', 'conflict')
    }
    const result = await applyRoutingChange(db, row)
    const claimed = await db.query(`UPDATE ai_pending_actions SET status='executed',executed_at=NOW(),result_payload=$2::jsonb
      WHERE id=$1 AND source='mcp' AND tool_name=$3 AND status='approved' AND resolved_payload=$4::jsonb RETURNING id`,
    [row.id, JSON.stringify(result), ACTION, JSON.stringify(payload)])
    if (claimed.rowCount !== 1) refuse('Routing proposal was claimed or changed; inspect its status', 'reconciliation_required')
    await finishExecution(db, identity, result)
    return ok(result)
  })
}
export async function runDepartmentLeadOperation(
  name: string,
  raw: unknown,
  ctx: ToolContext,
  key?: string,
  digest?: string
): Promise<ToolResult> {
  if (!departmentLeadContracts.some(contract => contract[0] === name)) return fail('Unknown department lead operation', 'not_found')
  try {
    if (WRITES.has(name) && !validExecutionIdentity(key, digest)) return fail('Verified logical request identity required', 'coordinator_required')
    if (name === 'marketing_get_lead_followup') return await getFollowup(raw, ctx)
    if (name === 'marketing_assign_lead_followup') return await assignFollowup(raw, ctx, key!, digest!)
    if (name === 'marketing_list_lead_routing_rules') return await listRules(raw, ctx)
    if (name === 'marketing_propose_lead_routing_change') return await propose(raw, ctx, key!, digest!)
    if (name === 'marketing_get_lead_routing_change') {
      const args = departmentLeadContracts[4][1].parse(raw)
      await authorize(ctx, args.clientId, false)
      return ok(proposalView(await readProposal(ctx, args.proposalId, args.clientId, 'either')))
    }
    if (name === 'marketing_review_lead_routing_change') return await review(raw, ctx)
    return await execute(raw, ctx, key!, digest!)
  } catch (error) {
    const refusal = refusalOf(error)
    if (refusal) return refusal
    const status = (error as { statusCode?: number })?.statusCode
    if (status === 400) return fail('Invalid lead or routing input', 'bad_args')
    if (status === 403) return fail('Not permitted for this marketing lead request', 'forbidden')
    if (status === 404) return fail('Lead or routing resource not found in active client scope', 'not_found')
    if (status === 409) return fail('Lead or routing revision changed; reload before applying', 'conflict')
    return fail('Department lead operation unavailable', 'unavailable')
  }
}
