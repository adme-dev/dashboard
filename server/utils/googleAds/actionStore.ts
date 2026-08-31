import { z } from 'zod'
import { queryOne as databaseQueryOne } from '~~/server/utils/db'
import {
  GoogleAdsActionPlanSchema,
  GoogleAdsActionStatusSchema,
  type GoogleAdsActionPlan,
  type GoogleAdsActionStatus
} from '~~/server/utils/googleAds/contracts'

type QueryOne = <T = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<T | null>

export interface GoogleAdsActionStoreDependencies {
  queryOne: QueryOne
}

const defaultDependencies: GoogleAdsActionStoreDependencies = {
  queryOne: databaseQueryOne as QueryOne
}

const UuidSchema = z.string().uuid()
const EventTypeSchema = z.string().trim().regex(/^[a-z][a-z0-9_]{0,99}$/)
const ExpectedStatusSchema = z.enum(['planned', 'approved'])
const TerminalStatusSchema = GoogleAdsActionStatusSchema.refine(
  status => [
    'verified',
    'partially_verified',
    'provider_rejected',
    'verification_failed',
    'recovery_required',
    'cancelled',
    'expired'
  ].includes(status),
  'A terminal Google Ads action status is required'
)

const SENSITIVE_KEY_NAMES = new Set([
  'accesstoken',
  'refreshtoken',
  'developertoken',
  'authorization',
  'password',
  'clientsecret',
  'apikey',
  'cookie',
  'setcookie',
  'signedurl'
])
const MAX_EVIDENCE_BYTES = 64 * 1024

const PLAN_COLUMNS = `
  id,
  client_id AS "clientId",
  connection_id AS "connectionId",
  customer_id AS "customerId",
  actor_id AS "actorId",
  grant_id AS "grantId",
  source,
  tool_name AS "toolName",
  resource_type AS "resourceType",
  resource_name AS "resourceName",
  operation,
  current_state AS "currentState",
  desired_state AS "desiredState",
  current_state_fingerprint AS "currentStateFingerprint",
  state_diff AS diff,
  provider_operations AS "providerOperations",
  risk_tier AS "riskTier",
  execution_mode AS "executionMode",
  policy_version AS "policyVersion",
  policy_decision AS "policyDecision",
  request_hash AS "requestHash",
  idempotency_key AS "idempotencyKey",
  status,
  approval_id AS "approvalId",
  provider_request_id AS "providerRequestId",
  verification_summary AS "verificationSummary",
  result_metadata AS "resultMetadata",
  expires_at AS "expiresAt",
  created_at AS "createdAt",
  updated_at AS "updatedAt"
`

function containsSensitiveKey(value: unknown, seen = new WeakSet<object>()): boolean {
  if (!value || typeof value !== 'object') return false
  if (seen.has(value)) throw new Error('Google Ads evidence must be acyclic JSON')
  seen.add(value)

  try {
    if (Array.isArray(value)) {
      return value.some(item => containsSensitiveKey(item, seen))
    }

    return Object.entries(value as Record<string, unknown>).some(([key, nested]) => {
      const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, '')
      return SENSITIVE_KEY_NAMES.has(normalized) || containsSensitiveKey(nested, seen)
    })
  } finally {
    seen.delete(value)
  }
}

function serializeEvidence(value: unknown, label: string): string {
  if (containsSensitiveKey(value)) {
    throw new Error(`${label} contains sensitive credential material`)
  }

  const serialized = JSON.stringify(value ?? null)
  if (serialized === undefined) throw new Error(`${label} must be JSON serializable`)
  if (new TextEncoder().encode(serialized).byteLength > MAX_EVIDENCE_BYTES) {
    throw new Error(`${label} exceeds the 64 KiB evidence limit`)
  }
  return serialized
}

function normalizeDate(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString()
  if (typeof value !== 'string') return value
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString()
}

function parsePlan(row: unknown): GoogleAdsActionPlan {
  if (!row || typeof row !== 'object') throw new Error('Google Ads action plan was not returned')
  const candidate = row as Record<string, unknown>
  return GoogleAdsActionPlanSchema.parse({
    ...candidate,
    expiresAt: normalizeDate(candidate.expiresAt),
    createdAt: normalizeDate(candidate.createdAt),
    updatedAt: normalizeDate(candidate.updatedAt)
  })
}

export async function createGoogleAdsActionPlan(
  input: GoogleAdsActionPlan,
  dependencies: GoogleAdsActionStoreDependencies = defaultDependencies
): Promise<GoogleAdsActionPlan> {
  const plan = GoogleAdsActionPlanSchema.parse(input)
  const row = await dependencies.queryOne<Record<string, unknown>>(`
    INSERT INTO google_ads_action_plans (
      id, client_id, connection_id, customer_id, actor_id, grant_id, source, tool_name,
      resource_type, resource_name, operation, current_state, desired_state,
      current_state_fingerprint, state_diff, provider_operations, risk_tier,
      execution_mode, policy_version, policy_decision, request_hash, idempotency_key,
      status, approval_id, expires_at, created_at, updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13::jsonb,
      $14, $15::jsonb, $16::jsonb, $17, $18, $19, $20::jsonb, $21, $22,
      $23, $24, $25::timestamptz, $26::timestamptz, $27::timestamptz
    )
    ON CONFLICT (client_id, idempotency_key) DO NOTHING
    RETURNING ${PLAN_COLUMNS}
  `, [
    plan.id,
    plan.clientId,
    plan.connectionId,
    plan.customerId,
    plan.actorId,
    plan.grantId ?? null,
    plan.source,
    plan.toolName,
    plan.resourceType,
    plan.resourceName,
    plan.operation,
    serializeEvidence(plan.currentState, 'Current state'),
    serializeEvidence(plan.desiredState, 'Desired state'),
    plan.currentStateFingerprint,
    serializeEvidence(plan.diff, 'State diff'),
    serializeEvidence(plan.providerOperations, 'Provider operations'),
    plan.riskTier,
    plan.executionMode,
    plan.policyVersion,
    serializeEvidence(plan.policyDecision, 'Policy decision'),
    plan.requestHash,
    plan.idempotencyKey,
    plan.status,
    plan.approvalId ?? null,
    plan.expiresAt,
    plan.createdAt,
    plan.updatedAt ?? plan.createdAt
  ])

  if (row) return parsePlan(row)

  const existing = await dependencies.queryOne<Record<string, unknown>>(`
    SELECT ${PLAN_COLUMNS}
    FROM google_ads_action_plans
    WHERE client_id = $1 AND idempotency_key = $2
  `, [plan.clientId, plan.idempotencyKey])

  if (!existing) throw new Error('Google Ads action plan idempotency conflict could not be resolved')
  const existingPlan = parsePlan(existing)
  if (existingPlan.requestHash !== plan.requestHash) {
    throw new Error('Idempotency key is already bound to a different Google Ads request')
  }
  return existingPlan
}

export async function getGoogleAdsActionPlan(
  id: string,
  clientId: string,
  dependencies: GoogleAdsActionStoreDependencies = defaultDependencies
): Promise<GoogleAdsActionPlan | null> {
  const planId = UuidSchema.parse(id)
  const tenantId = UuidSchema.parse(clientId)
  const row = await dependencies.queryOne<Record<string, unknown>>(`
    SELECT ${PLAN_COLUMNS}
    FROM google_ads_action_plans
    WHERE id = $1 AND client_id = $2
  `, [planId, tenantId])
  return row ? parsePlan(row) : null
}

export interface ClaimGoogleAdsActionPlanInput {
  id: string
  clientId: string
  actorId: string
  expectedStatus: 'planned' | 'approved'
}

export async function claimGoogleAdsActionPlan(
  input: ClaimGoogleAdsActionPlanInput,
  dependencies: GoogleAdsActionStoreDependencies = defaultDependencies
): Promise<GoogleAdsActionPlan | null> {
  const id = UuidSchema.parse(input.id)
  const clientId = UuidSchema.parse(input.clientId)
  const actorId = UuidSchema.parse(input.actorId)
  const expectedStatus = ExpectedStatusSchema.parse(input.expectedStatus)
  const row = await dependencies.queryOne<Record<string, unknown>>(`
    UPDATE google_ads_action_plans
    SET status = 'executing', claimed_at = NOW()
    WHERE id = $1
      AND client_id = $2
      AND actor_id = $3
      AND status = $4
      AND expires_at > NOW()
    RETURNING ${PLAN_COLUMNS}
  `, [id, clientId, actorId, expectedStatus])
  return row ? parsePlan(row) : null
}

export interface AppendGoogleAdsActionEventInput {
  planId: string
  clientId: string
  actorId?: string | null
  eventType: string
  metadata?: Record<string, unknown>
}

export interface GoogleAdsActionEvent {
  id: string
  planId: string
  clientId: string
  actorId?: string | null
  eventType: string
  metadata: Record<string, unknown>
  createdAt: string
}

export async function appendGoogleAdsActionEvent(
  input: AppendGoogleAdsActionEventInput,
  dependencies: GoogleAdsActionStoreDependencies = defaultDependencies
): Promise<GoogleAdsActionEvent> {
  const planId = UuidSchema.parse(input.planId)
  const clientId = UuidSchema.parse(input.clientId)
  const actorId = input.actorId == null ? null : UuidSchema.parse(input.actorId)
  const eventType = EventTypeSchema.parse(input.eventType)
  const metadata = input.metadata ?? {}
  const metadataJson = serializeEvidence(metadata, 'Action event metadata')

  const row = await dependencies.queryOne<Record<string, unknown>>(`
    INSERT INTO google_ads_action_events (
      id, plan_id, client_id, actor_id, event_type, metadata
    )
    SELECT gen_random_uuid(), id, client_id, $3, $4, $5::jsonb
    FROM google_ads_action_plans
    WHERE id = $1 AND client_id = $2
    RETURNING
      id,
      plan_id AS "planId",
      client_id AS "clientId",
      actor_id AS "actorId",
      event_type AS "eventType",
      metadata,
      created_at AS "createdAt"
  `, [planId, clientId, actorId, eventType, metadataJson])

  if (!row) throw new Error('Google Ads action plan was not found for this client')
  return {
    id: UuidSchema.parse(row.id),
    planId: UuidSchema.parse(row.planId),
    clientId: UuidSchema.parse(row.clientId),
    actorId: row.actorId == null ? null : UuidSchema.parse(row.actorId),
    eventType: EventTypeSchema.parse(row.eventType),
    metadata: z.record(z.string(), z.unknown()).parse(row.metadata),
    createdAt: z.string().datetime({ offset: true }).parse(normalizeDate(row.createdAt))
  }
}

export interface CompleteGoogleAdsActionPlanInput {
  id: string
  clientId: string
  status: GoogleAdsActionStatus
  providerRequestId?: string | null
  verificationSummary?: unknown
  resultMetadata?: unknown
}

export async function completeGoogleAdsActionPlan(
  input: CompleteGoogleAdsActionPlanInput,
  dependencies: GoogleAdsActionStoreDependencies = defaultDependencies
): Promise<GoogleAdsActionPlan | null> {
  const id = UuidSchema.parse(input.id)
  const clientId = UuidSchema.parse(input.clientId)
  const status = TerminalStatusSchema.parse(input.status)
  const providerRequestId = input.providerRequestId == null
    ? null
    : z.string().trim().min(1).max(255).parse(input.providerRequestId)
  const verificationSummary = serializeEvidence(
    input.verificationSummary ?? null,
    'Verification summary'
  )
  const resultMetadata = serializeEvidence(input.resultMetadata ?? null, 'Result metadata')

  const row = await dependencies.queryOne<Record<string, unknown>>(`
    UPDATE google_ads_action_plans
    SET status = $3,
        provider_request_id = $4,
        verification_summary = $5::jsonb,
        result_metadata = $6::jsonb,
        completed_at = NOW()
    WHERE id = $1
      AND client_id = $2
      AND status = 'executing'
    RETURNING ${PLAN_COLUMNS}
  `, [id, clientId, status, providerRequestId, verificationSummary, resultMetadata])
  return row ? parsePlan(row) : null
}
