/**
 * Per-client change timeline (marketing automation governance, phase 4).
 *
 * One normalized, newest-first history per client (optionally narrowed to one ad account
 * connection) assembled at query time from the existing, scattered change sources. Nothing new is
 * written: each source is read with the same client/account/date/cursor window, normalized into
 * `ClientChangeEntry`, merged and paginated with a stable keyset cursor `(at DESC, id DESC)`.
 *
 * Sources (origin → what it records):
 *  - ai_pending_actions               proposals (chat / MCP / God mode), approval, execution, expiry;
 *                                     enriched with the latest ai_action_audit row (risk, outcome,
 *                                     rollback ref) and god_mode_execution_ledger state.
 *  - ai_action_audit                  executed AI writes with NO proposal row (client_scope-tagged).
 *  - google_ads_action_plans          Google Ads change plans: before/after, review, provider request
 *                                     id, verification. A plan's own approval proposal is folded in,
 *                                     so a plan appears once.
 *  - budget_audit_log                 recorded XeroFlow budget allocation changes (before → after).
 *  - google_ads_account_binding_events client ↔ Google Ads account binding changes.
 *
 * Actor identity is a team member id + display name — never an email.
 */
import { queryRowsFresh } from '~~/server/utils/db'

export const CHANGE_HISTORY_ORIGINS = [
  'ai_pending_actions',
  'ai_action_audit',
  'google_ads_action_plans',
  'budget_audit_log',
  'google_ads_account_binding_events'
] as const
export type ChangeHistoryOrigin = typeof CHANGE_HISTORY_ORIGINS[number]

export type ChangeChannel = 'mcp' | 'chat' | 'ui' | 'automation' | 'migration' | 'unknown'
export type ChangeStatus
  = 'proposed' | 'approved' | 'executing' | 'executed' | 'verified'
    | 'rejected' | 'cancelled' | 'expired' | 'failed'

export interface ChangeActor {
  userId: string | null
  name: string | null
  type: 'user' | 'system'
}

export interface ChangeAccount {
  connectionId: string | null
  platform: string | null
  customerId: string | null
  label: string | null
}

export interface ClientChangeEntry {
  /** Stable, globally unique: `<prefix>:<source row id>`. */
  id: string
  /** Immutable creation time of the source row (ISO-8601 UTC, microsecond precision). */
  at: string
  origin: ChangeHistoryOrigin
  clientId: string
  account: ChangeAccount | null
  actor: ChangeActor
  source: ChangeChannel
  actionFamily: string
  toolName: string | null
  risk: string | null
  status: ChangeStatus
  /** The source's own status vocabulary, unmodified. */
  rawStatus: string | null
  summary: string
  before: unknown
  after: unknown
  approver: ChangeActor | null
  providerRequestId: string | null
  triggerRef: string | null
  rollbackRef: string | null
  resultRef: string | null
  verification: unknown
  /** Last known state change for the row (execution, review, expiry); null when unknown. */
  updatedAt: string | null
}

export interface ClientChangeHistoryQuery {
  clientId: string
  connectionId?: string | null
  /** Inclusive YYYY-MM-DD (agency local day). */
  startDate?: string | null
  /** Inclusive YYYY-MM-DD (agency local day). */
  endDate?: string | null
  cursor?: string | null
  limit?: number
  origins?: readonly ChangeHistoryOrigin[]
}

export interface ClientChangeHistoryPage {
  entries: ClientChangeEntry[]
  nextCursor: string | null
  more: boolean
  appliedLimit: number
  origins: ChangeHistoryOrigin[]
}

export type ChangeHistoryQueryRows = <T = Record<string, unknown>>(sql: string, params: unknown[]) => Promise<T[]>

export const CHANGE_HISTORY_DEFAULT_LIMIT = 25
export const CHANGE_HISTORY_MAX_LIMIT = 100
/** Agency-local day boundaries for the date filter. */
export const CHANGE_HISTORY_TIMEZONE = 'Australia/Melbourne'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const UUID_SQL = `'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'`
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const ISO_AT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/
const ENTRY_ID = /^[a-z_]+:[0-9a-f-]{36}$/

// ---------------------------------------------------------------------------------------------------
// Cursor

export function encodeChangeHistoryCursor(entry: Pick<ClientChangeEntry, 'at' | 'id'>): string {
  return Buffer.from(JSON.stringify({ at: entry.at, id: entry.id }), 'utf8').toString('base64url')
}

export function decodeChangeHistoryCursor(cursor: string | null | undefined): { at: string, id: string } | null {
  if (!cursor) return null
  try {
    const value = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as { at?: unknown, id?: unknown }
    if (typeof value.at === 'string' && ISO_AT.test(value.at) && typeof value.id === 'string' && ENTRY_ID.test(value.id)) {
      return { at: value.at, id: value.id }
    }
  } catch { /* fall through */ }
  throw new ChangeHistoryInputError('Invalid cursor.')
}

export class ChangeHistoryInputError extends Error {}

/** Newest first; equal timestamps break ties by id descending (byte order, matching SQL COLLATE "C"). */
export function compareChangeEntries(a: Pick<ClientChangeEntry, 'at' | 'id'>, b: Pick<ClientChangeEntry, 'at' | 'id'>): number {
  if (a.at !== b.at) return a.at < b.at ? 1 : -1
  if (a.id === b.id) return 0
  return a.id < b.id ? 1 : -1
}

// ---------------------------------------------------------------------------------------------------
// Normalization helpers (pure)

type Row = Record<string, any>

const str = (value: unknown): string | null => typeof value === 'string' && value.trim() ? value : null
const num = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}
const obj = (value: unknown): Record<string, any> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {}

function user(id: unknown, name: unknown): ChangeActor | null {
  const userId = str(id)
  if (!userId) return null
  return { userId, name: str(name), type: 'user' }
}

const SYSTEM: ChangeActor = Object.freeze({ userId: null, name: 'XeroFlow', type: 'system' }) as ChangeActor

/** Email-shaped text is never surfaced as a display name. */
function safeName(value: unknown): string | null {
  const name = str(value)
  return name && !name.includes('@') ? name : null
}

export function channelFromSource(source: unknown): ChangeChannel {
  switch (str(source)) {
    case 'mcp':
    case 'god_mode_preparation':
      return 'mcp'
    case 'chat':
    case 'portal':
      return 'chat'
    case 'ui':
    case 'application':
      return 'ui'
    case 'automation':
      return 'automation'
    case 'migration':
      return 'migration'
    default:
      return 'unknown'
  }
}

/** Coarse action family from a tool / resource name, for filtering and display. */
export function actionFamilyFor(toolName: string | null, fallback = 'other'): string {
  const name = (toolName ?? '').toLowerCase()
  if (!name) return fallback
  if (/budget|allocation/.test(name)) return 'budget'
  if (/negative_keyword|shared_negative/.test(name)) return 'negative_keywords'
  if (/keyword/.test(name)) return 'keywords'
  if (/pause|enable|archive|remove/.test(name)) return 'status'
  if (/bidding/.test(name)) return 'bidding'
  if (/conversion/.test(name)) return 'conversion_settings'
  if (/feed|catalog|product_set/.test(name)) return 'catalog_feed'
  if (/video|banner|creative|asset|image|music|voiceover/.test(name)) return 'creative'
  if (/gtm|tracking/.test(name)) return 'tracking'
  if (/task|brief|timeline|proof/.test(name)) return 'delivery'
  if (/knowledge|memory/.test(name)) return 'knowledge'
  if (/post|social/.test(name)) return 'social'
  if (/campaign|ad_group|ads?$|_ad_|recommendation|target|location|schedule|audience|placement|device|demographic|language/.test(name)) return 'campaign_settings'
  return fallback
}

function money(value: number | null): string {
  return value === null ? 'none' : `$${value.toLocaleString('en-AU', { maximumFractionDigits: 2 })}`
}

/** Budget-shaped before/after from a proposal payload (single, department changes[] or bulk allocations[]). */
export function budgetDiffFromPayload(payload: Record<string, any>, clientMediaSpendIds?: ReadonlySet<string>): { before: unknown, after: unknown } | null {
  if ('proposedBudgetAllocated' in payload || 'currentBudgetAllocated' in payload) {
    return {
      before: { budget: num(payload.currentBudgetAllocated), campaign: str(payload.campaignName), mediaSpendId: str(payload.mediaSpendId) },
      after: { budget: num(payload.proposedBudgetAllocated), campaign: str(payload.campaignName), mediaSpendId: str(payload.mediaSpendId) }
    }
  }
  const changes = Array.isArray(obj(payload.input).changes) ? obj(payload.input).changes as unknown[] : null
  if (changes) {
    const rows = changes.map(obj)
    return {
      before: rows.map(change => ({ mediaSpendId: str(change.spendId), budget: num(change.expectedBudget) })),
      after: rows.map(change => ({ mediaSpendId: str(change.spendId), budget: num(change.budget), rolling: change.rolling ?? null }))
    }
  }
  if (Array.isArray(payload.allocations)) {
    const rows = (payload.allocations as unknown[]).map(obj)
      .filter(row => !clientMediaSpendIds || clientMediaSpendIds.has(String(row.mediaSpendId)))
    return {
      before: rows.map(row => ({ mediaSpendId: str(row.mediaSpendId), campaign: str(row.campaignName), budget: num(row.currentBudgetAllocated) })),
      after: rows.map(row => ({ mediaSpendId: str(row.mediaSpendId), campaign: str(row.campaignName), budget: num(row.proposedBudgetAllocated) }))
    }
  }
  return null
}

function triggerFrom(...sources: Record<string, any>[]): string | null {
  for (const source of sources) {
    for (const key of ['alertId', 'anomalyId', 'ruleId', 'policyId', 'automationRuleId', 'triggerId']) {
      const value = source[key]
      if (typeof value === 'string' && value.trim()) return `${key}:${value}`
      if (typeof value === 'number') return `${key}:${value}`
    }
  }
  return null
}

function pendingStatus(row: Row, now: Date): ChangeStatus {
  const raw = str(row.status)
  const auditOutcome = str(row.audit_outcome)
  const ledgerState = str(row.ledger_state)
  if (auditOutcome === 'failed' || ledgerState === 'failed') return 'failed'
  switch (raw) {
    case 'executed':
      return auditOutcome === 'rolled_back' ? 'cancelled' : 'executed'
    case 'rejected':
      return 'rejected'
    case 'cancelled':
      return 'cancelled'
    case 'expired':
      return 'expired'
    case 'failed':
      return 'failed'
    case 'sending':
    case 'confirmed':
    case 'approved':
      return 'approved'
    case 'proposed':
    case 'pending':
    default: {
      const expires = row.expires_at ? Date.parse(String(row.expires_at)) : Number.NaN
      return Number.isFinite(expires) && expires < now.getTime() ? 'expired' : 'proposed'
    }
  }
}

/** ai_pending_actions (+ latest ai_action_audit + god_mode_execution_ledger) → entry. */
export function normalizePendingAction(row: Row, now = new Date()): ClientChangeEntry {
  const payload = obj(row.resolved_payload)
  const args = { ...obj(payload.args), ...obj(payload.input) }
  const toolName = str(row.tool_name)
  const status = pendingStatus(row, now)
  const clientMediaSpendIds = Array.isArray(row.client_media_spend_ids) ? new Set<string>(row.client_media_spend_ids.map(String)) : undefined
  const diff = budgetDiffFromPayload(payload, clientMediaSpendIds)
  const result = obj(row.result_payload)
  const note = str(payload.note) ?? str(args.note) ?? str(payload.title) ?? str(payload.description)
  const kind = str(payload.kind) ?? toolName ?? 'action'
  const approverId = str(row.confirmed_by) ?? str(row.audit_confirmed_by)
  return {
    id: `ai_pending:${row.id}`,
    at: String(row.at),
    origin: 'ai_pending_actions',
    clientId: String(row.client_id),
    account: row.account_connection_id || row.account_platform
      ? { connectionId: str(row.account_connection_id), platform: str(row.account_platform) ?? str(payload.platform), customerId: str(row.account_customer_id), label: safeName(row.account_name) }
      : null,
    actor: user(row.user_id, safeName(row.actor_name)) ?? SYSTEM,
    source: channelFromSource(row.source),
    actionFamily: actionFamilyFor(`${toolName ?? ''} ${kind}`.trim(), 'other'),
    toolName,
    risk: str(row.audit_risk_tier),
    status,
    rawStatus: str(row.status),
    summary: [kind.replace(/_/g, ' '), note].filter(Boolean).join(': ').slice(0, 400),
    before: diff?.before ?? null,
    after: diff?.after ?? null,
    approver: approverId ? user(approverId, safeName(row.approver_name)) : null,
    providerRequestId: str(result.providerRequestId) ?? str(result.requestId),
    triggerRef: triggerFrom(payload, args),
    rollbackRef: str(row.audit_rollback_ref),
    resultRef: str(row.result_ref) ?? str(row.audit_result_ref) ?? str(row.ledger_result_reference),
    verification: row.ledger_state ? { executionState: str(row.ledger_state), phase: str(row.ledger_phase) } : null,
    updatedAt: str(row.updated_at)
  }
}

/** ai_action_audit rows that have no proposal row → entry. Audit payloads carry argument KEYS only. */
export function normalizeActionAudit(row: Row): ClientChangeEntry {
  const payload = obj(row.payload)
  const toolName = str(row.tool_name)
  const outcome = str(row.outcome)
  const status: ChangeStatus = outcome === 'failed' ? 'failed' : outcome === 'rolled_back' ? 'cancelled' : outcome === 'proposed' ? 'proposed' : 'executed'
  return {
    id: `ai_audit:${row.id}`,
    at: String(row.at),
    origin: 'ai_action_audit',
    clientId: String(row.client_id),
    account: null,
    actor: user(row.user_id, safeName(row.actor_name)) ?? SYSTEM,
    source: channelFromSource(payload.source ?? 'chat'),
    actionFamily: actionFamilyFor(toolName),
    toolName,
    risk: str(row.risk_tier),
    status,
    rawStatus: outcome,
    summary: `${(toolName ?? 'action').replace(/_/g, ' ')} ${outcome ?? ''}`.trim(),
    before: null,
    after: null,
    approver: user(row.confirmed_by, safeName(row.approver_name)),
    providerRequestId: null,
    triggerRef: triggerFrom(payload),
    rollbackRef: str(row.rollback_ref),
    resultRef: str(row.result_ref),
    verification: null,
    updatedAt: null
  }
}

const PLAN_STATUS: Record<string, ChangeStatus> = {
  planned: 'proposed',
  pending_approval: 'proposed',
  approved: 'approved',
  executing: 'executing',
  verified: 'verified',
  partially_verified: 'verified',
  provider_rejected: 'failed',
  verification_failed: 'failed',
  recovery_required: 'failed',
  cancelled: 'cancelled',
  expired: 'expired'
}

/** google_ads_action_plans → entry. */
export function normalizeGoogleAdsPlan(row: Row): ClientChangeEntry {
  const raw = str(row.status) ?? 'planned'
  let status = PLAN_STATUS[raw] ?? 'proposed'
  if (raw === 'cancelled' && str(row.rejection_reason)) status = 'rejected'
  const policy = obj(row.policy_decision)
  const result = obj(row.result_metadata)
  const resourceType = str(row.resource_type)
  const operation = str(row.operation)
  const toolName = str(row.tool_name)
  const approverId = str(row.reviewed_by) ?? str(row.approval_confirmed_by)
  const approverName = str(row.reviewed_by) ? row.reviewer_name : row.approval_confirmed_name
  const resource = str(row.resource_name)
  return {
    id: `gads_plan:${row.id}`,
    at: String(row.at),
    origin: 'google_ads_action_plans',
    clientId: String(row.client_id),
    account: { connectionId: str(row.connection_id), platform: 'google', customerId: str(row.customer_id), label: safeName(row.account_name) },
    actor: user(row.actor_id, safeName(row.actor_name)) ?? SYSTEM,
    source: channelFromSource(row.source),
    actionFamily: actionFamilyFor(toolName ?? `${resourceType ?? ''}_${operation ?? ''}`),
    toolName,
    risk: str(row.risk_tier),
    status,
    rawStatus: raw,
    summary: [`${operation ?? 'change'} ${resourceType ?? 'resource'}`.replace(/_/g, ' '), resource, str(row.rejection_reason) ? `rejected: ${row.rejection_reason}` : null]
      .filter(Boolean).join(' · ').slice(0, 400),
    before: row.current_state ?? null,
    after: row.desired_state ?? null,
    approver: approverId ? user(approverId, safeName(approverName)) : null,
    providerRequestId: str(row.provider_request_id),
    triggerRef: triggerFrom(policy, result) ?? (str(row.policy_version) && channelFromSource(row.source) === 'automation' ? `policyVersion:${row.policy_version}` : null),
    rollbackRef: str(result.rollbackRef) ?? str(result.rollbackPlanId) ?? str(result.undoPlanId),
    resultRef: str(result.resourceName) ?? resource,
    verification: row.verification_summary ?? null,
    updatedAt: str(row.updated_at)
  }
}

/** XeroFlow allocation imports/backfills are recorded with these note prefixes. */
const MIGRATION_NOTE = /^(backfilled|imported|seeded)\b/i
const BATCH_NOTE = /\[batch:[0-9a-f-]{36}\]/i

/** budget_audit_log (+ media_spend) → entry. A XeroFlow allocation record, not a provider change. */
export function normalizeBudgetAudit(row: Row): ClientChangeEntry {
  const note = str(row.note)
  const before = num(row.previous_budget)
  const after = num(row.new_budget)
  const batch = note?.match(BATCH_NOTE)?.[0] ?? null
  return {
    id: `budget:${row.id}`,
    at: String(row.at),
    origin: 'budget_audit_log',
    clientId: String(row.client_id),
    account: { connectionId: str(row.connection_id), platform: str(row.platform), customerId: str(row.account_customer_id), label: safeName(row.account_name) },
    actor: user(row.changed_by, safeName(row.actor_name)) ?? SYSTEM,
    source: note && MIGRATION_NOTE.test(note) ? 'migration' : batch ? 'mcp' : 'ui',
    actionFamily: 'budget',
    toolName: null,
    risk: null,
    status: 'executed',
    rawStatus: null,
    summary: [`Budget ${money(before)} → ${money(after)}`, str(row.campaign_name), note].filter(Boolean).join(' · ').slice(0, 400),
    before: { budget: before, campaign: str(row.campaign_name), period: str(row.period) },
    after: { budget: after, campaign: str(row.campaign_name), period: str(row.period) },
    approver: null,
    providerRequestId: null,
    triggerRef: batch ? batch.slice(1, -1) : null,
    rollbackRef: null,
    resultRef: str(row.media_spend_id),
    verification: null,
    updatedAt: null
  }
}

/** google_ads_account_binding_events (+ binding) → entry. */
export function normalizeBindingEvent(row: Row): ClientChangeEntry {
  const evidence = obj(row.evidence)
  const actorType = str(row.actor_type)
  const actorId = str(row.actor_id)
  const actor = actorType === 'user' && actorId && UUID.test(actorId)
    ? user(actorId, safeName(row.actor_name)) ?? SYSTEM
    : { userId: null, name: actorType === 'migration' && actorId ? `Migration ${actorId}` : 'XeroFlow', type: 'system' as const }
  const eventType = str(row.event_type) ?? 'changed'
  const reason = str(evidence.reason)
  const customerId = str(row.operating_customer_id) ?? str(evidence.operatingCustomerId)
  return {
    id: `gads_binding:${row.id}`,
    at: String(row.at),
    origin: 'google_ads_account_binding_events',
    clientId: String(row.client_id),
    account: { connectionId: str(row.connection_id) ?? str(evidence.connectionId), platform: 'google', customerId, label: safeName(row.account_name) },
    actor,
    source: actorType === 'migration' ? 'migration' : actorType === 'user' ? 'ui' : channelFromSource(actorType),
    actionFamily: 'account_binding',
    toolName: null,
    risk: null,
    status: 'executed',
    rawStatus: eventType,
    summary: [`Google Ads account ${customerId ?? ''} ${eventType}`.replace(/\s+/g, ' ').trim(), reason?.replace(/_/g, ' ')].filter(Boolean).join(' · '),
    before: str(evidence.fromClientId) ? { clientId: evidence.fromClientId } : null,
    after: { eventType, accountRole: str(evidence.accountRole), ...(str(evidence.toClientId) ? { toClientId: evidence.toClientId } : {}) },
    approver: null,
    providerRequestId: null,
    triggerRef: null,
    rollbackRef: null,
    resultRef: str(row.binding_id),
    verification: null,
    updatedAt: null
  }
}

const NORMALIZERS: Record<ChangeHistoryOrigin, (row: Row, now: Date) => ClientChangeEntry> = {
  ai_pending_actions: normalizePendingAction,
  ai_action_audit: normalizeActionAudit,
  google_ads_action_plans: normalizeGoogleAdsPlan,
  budget_audit_log: normalizeBudgetAudit,
  google_ads_account_binding_events: normalizeBindingEvent
}

// ---------------------------------------------------------------------------------------------------
// SQL (one statement per source; identical parameter layout)
//
//  $1 client id (uuid)        $2 start (timestamptz|null)   $3 end, exclusive (timestamptz|null)
//  $4 cursor at (|null)       $5 cursor entry id (text|null) $6 per-source limit
//  $7 connection id (uuid|null)

const AT_TEXT = (column: string) => `to_char(${column} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`
const UPDATED_TEXT = (column: string) => `CASE WHEN ${column} IS NULL THEN NULL ELSE ${AT_TEXT(column)} END`
const uuidOrNull = (expression: string) => `(CASE WHEN (${expression}) ~ ${UUID_SQL} THEN (${expression})::uuid END)`

function windowed(inner: string): string {
  return `SELECT * FROM (${inner}) src
    WHERE ($2::timestamptz IS NULL OR src.at_ts >= $2::timestamptz)
      AND ($3::timestamptz IS NULL OR src.at_ts < $3::timestamptz)
      AND ($4::timestamptz IS NULL OR src.at_ts < $4::timestamptz
           OR (src.at_ts = $4::timestamptz AND src.entry_id COLLATE "C" < ($5::text) COLLATE "C"))
    ORDER BY src.at_ts DESC, src.entry_id COLLATE "C" DESC
    LIMIT $6`
}

const PENDING_CLIENT_SPEND = `ARRAY(
  SELECT ms.id::text FROM media_spend ms
   WHERE ms.client_id = $1::uuid
     AND ms.id::text IN (
       SELECT lower(x) FROM (
         SELECT p.resolved_payload->>'mediaSpendId' AS x
         UNION ALL SELECT a->>'mediaSpendId' FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p.resolved_payload->'allocations') = 'array' THEN p.resolved_payload->'allocations' ELSE '[]'::jsonb END) a
         UNION ALL SELECT c->>'spendId' FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p.resolved_payload->'input'->'changes') = 'array' THEN p.resolved_payload->'input'->'changes' ELSE '[]'::jsonb END) c
       ) ids WHERE x IS NOT NULL))`

export const CHANGE_HISTORY_SQL: Record<ChangeHistoryOrigin, string> = {
  ai_pending_actions: windowed(`
    SELECT p.id, p.user_id, p.tool_name, p.resolved_payload, p.result_payload, p.status, p.result_ref,
           p.source, p.confirmed_by, p.expires_at, $1::uuid AS client_id,
           ${AT_TEXT('p.created_at')} AS at, p.created_at AS at_ts, 'ai_pending:' || p.id::text AS entry_id,
           ${UPDATED_TEXT('COALESCE(p.executed_at, led.updated_at)')} AS updated_at,
           actor.name AS actor_name, approver.name AS approver_name,
           aud.outcome AS audit_outcome, aud.risk_tier AS audit_risk_tier, aud.rollback_ref AS audit_rollback_ref,
           aud.result_ref AS audit_result_ref, aud.confirmed_by AS audit_confirmed_by,
           led.state AS ledger_state, led.execution_phase AS ledger_phase, led.result_reference AS ledger_result_reference,
           COALESCE(sc.id, ms1.connection_id)::text AS account_connection_id,
           COALESCE(sc.platform, ms1.platform, p.resolved_payload->>'platform') AS account_platform,
           sc.account_id AS account_customer_id, sc.account_name AS account_name,
           spend.ids AS client_media_spend_ids
      FROM ai_pending_actions p
      CROSS JOIN LATERAL (SELECT ${PENDING_CLIENT_SPEND} AS ids) spend
      LEFT JOIN team_members actor ON actor.id = p.user_id
      LEFT JOIN team_members approver ON approver.id = p.confirmed_by
      LEFT JOIN LATERAL (
        SELECT a.outcome, a.risk_tier, a.rollback_ref, a.result_ref, a.confirmed_by
          FROM ai_action_audit a WHERE a.pending_id = p.id ORDER BY a.created_at DESC, a.id DESC LIMIT 1
      ) aud ON true
      LEFT JOIN LATERAL (
        SELECT l.state, l.execution_phase, l.result_reference, l.updated_at
          FROM god_mode_execution_ledger l WHERE l.proposal_id = p.id ORDER BY l.updated_at DESC LIMIT 1
      ) led ON true
      LEFT JOIN media_spend ms1 ON ms1.id = ${uuidOrNull(`p.resolved_payload->>'mediaSpendId'`)}
      LEFT JOIN social_connections sc ON sc.id = ${uuidOrNull(`COALESCE(p.resolved_payload->>'connectionId', p.resolved_payload->'args'->>'connectionId', p.resolved_payload->'input'->>'connectionId')`)}
     WHERE p.google_ads_action_plan_id IS NULL
       AND (p.client_scope = $1::uuid
         OR lower(p.resolved_payload->>'clientId') = $1::text
         OR lower(p.resolved_payload->'input'->>'clientId') = $1::text
         OR lower(p.resolved_payload->'args'->>'clientId') = $1::text
         OR cardinality(spend.ids) > 0)
       AND ($7::uuid IS NULL OR COALESCE(sc.id, ms1.connection_id) = $7::uuid)`),

  ai_action_audit: windowed(`
    SELECT a.id, a.user_id, a.confirmed_by, a.tool_name, a.risk_tier, a.payload, a.result_ref, a.rollback_ref,
           a.outcome, a.client_scope AS client_id,
           ${AT_TEXT('a.created_at')} AS at, a.created_at AS at_ts, 'ai_audit:' || a.id::text AS entry_id,
           actor.name AS actor_name, approver.name AS approver_name
      FROM ai_action_audit a
      LEFT JOIN team_members actor ON actor.id = a.user_id
      LEFT JOIN team_members approver ON approver.id = a.confirmed_by
     WHERE a.pending_id IS NULL
       AND a.client_scope = $1::uuid
       AND a.outcome <> 'read' AND a.risk_tier <> 'auto'
       AND COALESCE(a.payload->>'actionClass', '') <> 'read'
       AND ($7::uuid IS NULL OR FALSE)`),

  google_ads_action_plans: windowed(`
    SELECT g.id, g.client_id, g.connection_id, g.customer_id, g.actor_id, g.source, g.tool_name, g.resource_type,
           g.resource_name, g.operation, g.current_state, g.desired_state, g.risk_tier, g.policy_version,
           g.policy_decision, g.status, g.provider_request_id, g.verification_summary, g.result_metadata,
           g.reviewed_by, g.rejection_reason,
           ${AT_TEXT('g.created_at')} AS at, g.created_at AS at_ts, 'gads_plan:' || g.id::text AS entry_id,
           ${UPDATED_TEXT('g.updated_at')} AS updated_at,
           actor.name AS actor_name, reviewer.name AS reviewer_name,
           ap.confirmed_by AS approval_confirmed_by, approver.name AS approval_confirmed_name,
           sc.account_name AS account_name
      FROM google_ads_action_plans g
      LEFT JOIN team_members actor ON actor.id = g.actor_id
      LEFT JOIN team_members reviewer ON reviewer.id = g.reviewed_by
      LEFT JOIN ai_pending_actions ap ON ap.id = g.approval_id
      LEFT JOIN team_members approver ON approver.id = ap.confirmed_by
      LEFT JOIN social_connections sc ON sc.id = g.connection_id
     WHERE g.client_id = $1::uuid
       AND ($7::uuid IS NULL OR g.connection_id = $7::uuid)`),

  budget_audit_log: windowed(`
    SELECT b.id, b.media_spend_id, b.previous_budget, b.new_budget, b.changed_by, b.note,
           ms.client_id, ms.connection_id::text AS connection_id, ms.platform, ms.campaign_name, ms.period,
           ${AT_TEXT('b.changed_at')} AS at, b.changed_at AS at_ts, 'budget:' || b.id::text AS entry_id,
           actor.name AS actor_name, sc.account_id AS account_customer_id, sc.account_name AS account_name
      FROM budget_audit_log b
      JOIN media_spend ms ON ms.id = b.media_spend_id
      LEFT JOIN team_members actor ON actor.id = b.changed_by
      LEFT JOIN social_connections sc ON sc.id = ms.connection_id
     WHERE ms.client_id = $1::uuid
       AND ($7::uuid IS NULL OR ms.connection_id = $7::uuid)`),

  google_ads_account_binding_events: windowed(`
    SELECT e.id, e.binding_id, e.client_id, e.event_type, e.actor_type, e.actor_id, e.evidence,
           gb.connection_id::text AS connection_id, gb.operating_customer_id,
           ${AT_TEXT('e.created_at')} AS at, e.created_at AS at_ts, 'gads_binding:' || e.id::text AS entry_id,
           actor.name AS actor_name, sc.account_name AS account_name
      FROM google_ads_account_binding_events e
      LEFT JOIN google_ads_account_bindings gb ON gb.id = e.binding_id
      LEFT JOIN team_members actor ON actor.id = ${uuidOrNull('e.actor_id')}
      LEFT JOIN social_connections sc ON sc.id = COALESCE(gb.connection_id, ${uuidOrNull(`e.evidence->>'connectionId'`)})
     WHERE e.client_id = $1::uuid
       AND ($7::uuid IS NULL OR COALESCE(gb.connection_id, ${uuidOrNull(`e.evidence->>'connectionId'`)}) = $7::uuid)`)
}

// ---------------------------------------------------------------------------------------------------
// Assembly

function localDayStart(date: string, label: string): string {
  if (!ISO_DATE.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) throw new ChangeHistoryInputError(`${label} must be YYYY-MM-DD.`)
  return date
}

function nextDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

/** Agency-local midnight as an ISO timestamp with offset, resolved by Postgres-free Intl math. */
export function agencyMidnight(date: string, timeZone = CHANGE_HISTORY_TIMEZONE): string {
  const guess = new Date(`${date}T00:00:00Z`)
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit'
  }).formatToParts(guess)
  const get = (type: string) => Number(parts.find(part => part.type === type)?.value)
  const asLocal = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
  const offsetMs = asLocal - guess.getTime()
  return new Date(guess.getTime() - offsetMs).toISOString()
}

export interface ChangeHistoryDeps {
  queryRows: ChangeHistoryQueryRows
  now?: () => Date
}

const defaultDeps: ChangeHistoryDeps = { queryRows: queryRowsFresh as ChangeHistoryQueryRows }

/**
 * Read one page of a client's change timeline. Authorization is the CALLER's job (the API route and
 * the MCP/chat tool both resolve the client-scoped reporting authority first).
 */
export async function getClientChangeHistory(
  query: ClientChangeHistoryQuery,
  deps: ChangeHistoryDeps = defaultDeps
): Promise<ClientChangeHistoryPage> {
  if (!UUID.test(query.clientId)) throw new ChangeHistoryInputError('A valid client id is required.')
  if (query.connectionId && !UUID.test(query.connectionId)) throw new ChangeHistoryInputError('connectionId must be a UUID.')
  const limit = Math.min(CHANGE_HISTORY_MAX_LIMIT, Math.max(1, Math.trunc(query.limit ?? CHANGE_HISTORY_DEFAULT_LIMIT)))
  const start = query.startDate ? agencyMidnight(localDayStart(query.startDate, 'startDate')) : null
  const end = query.endDate ? agencyMidnight(nextDay(localDayStart(query.endDate, 'endDate'))) : null
  if (query.startDate && query.endDate && query.startDate > query.endDate) throw new ChangeHistoryInputError('startDate must be on or before endDate.')
  const cursor = decodeChangeHistoryCursor(query.cursor)
  const origins = query.origins?.length
    ? CHANGE_HISTORY_ORIGINS.filter(origin => query.origins!.includes(origin))
    : [...CHANGE_HISTORY_ORIGINS]
  const params = [
    query.clientId.toLowerCase(),
    start,
    end,
    cursor?.at ?? null,
    cursor?.id ?? null,
    limit + 1,
    query.connectionId ? query.connectionId.toLowerCase() : null
  ]
  const now = deps.now?.() ?? new Date()
  const perSource = await Promise.all(origins.map(async (origin) => {
    const rows = await deps.queryRows<Row>(CHANGE_HISTORY_SQL[origin], params)
    return rows.map(row => NORMALIZERS[origin](row, now))
  }))
  const merged = perSource.flat()
    // Defence in depth: never trust a source to have applied the keyset exactly.
    .filter(entry => !cursor || compareChangeEntries(entry, cursor) > 0)
    .sort(compareChangeEntries)
  const page = merged.slice(0, limit)
  const more = merged.length > limit
  return {
    entries: page,
    nextCursor: more && page.length ? encodeChangeHistoryCursor(page[page.length - 1]!) : null,
    more,
    appliedLimit: limit,
    origins
  }
}
