import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { createError, type H3Event } from 'h3'
import {
  EmailIngestEnvelopeSchema,
  EmailEndpointPolicySchema,
  EmailStageConfirmationSchema,
  EmailStageRequestSchema,
  type EmailEndpointPolicy,
  type EmailIngestEnvelope,
  type EmailLeadExtraction,
  type EmailStageRequest,
  type EmailStageResponse,
  type EmailStageConfirmation
} from '~~/shared/leads/email/contracts'
import { queryOne, transaction } from '~~/server/utils/db'
import type { InsertLeadInput, LeadIngestionTerminalStatus, LeadTransactionClient } from '~~/server/utils/leads/db'
import { findEmailLeadDuplicateSignal, type PossibleDuplicateSignal } from '~~/server/utils/leads/emailDuplicateSignal'
import {
  hasCurrentEmailAiPrivacyApproval,
  resolveEmailEndpointToken
} from '~~/server/utils/leads/emailEndpoint'
import { resolveLeadIdentityFingerprintSecret } from '~~/server/utils/leads/submissionIntent'
import { createOpaqueEmailObjectKey } from '~~/shared/leads/email/quarantine'
import { isStrongEmailSecret } from '~~/shared/leads/email/secretPolicy'
import { emitEmailIngestionEvent } from '~~/shared/leads/email/telemetry'

const TIMESTAMP_TOLERANCE_MS = 5 * 60_000
const NONCE_TTL_SECONDS = 10 * 60
const CLAIM_LEASE_SECONDS = 5 * 60
const STAGING_GRACE_SECONDS = 5 * 60
const MIN_CANONICAL_WINDOW_SECONDS = 30
const MAX_ATTEMPTS = 5
const TOKEN_PATTERN = /^[0123456789abcdefghjkmnpqrstvwxyz]{10}$/
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type Endpoint = {
  id: string
  client_id: string
  form_id: string
  form_name: string
  enabled: boolean
  retired_at: string | null
  address_token: string
  previous_address_token: string | null
  previous_token_grace_until: string | null
  expected_provider: string | null
  parser_mode: 'auto' | 'adf' | 'generic'
  ai_extraction_mode: 'disabled' | 'fallback'
  ai_privacy_approval_version: number | null
  ai_privacy_approved_at: string | null
  ai_privacy_approved_by: string | null
  allowed_sender_domains: string[] | string
  lead_capture_mode?: string | null
}

type Ingestion = {
  id: string
  endpoint_id: string
  client_id: string | null
  correlation_id: string
  transport: 'cloudflare_email_routing'
  external_id_hash: string
  message_id_hash: string | null
  raw_content_hash_version: number | null
  raw_content_hash: string | null
  provider: string
  sender_domain: string | null
  header_from_domain: string | null
  raw_size: number | null
  status: 'received' | 'accepted' | 'duplicate' | 'quarantined' | 'failed'
  terminal_at: string | null
  next_attempt_at: string | null
  staged_expires_at: string | null
  attempt_count: number
  recovery_lease_token: string | null
}

export interface EmailSignatureRequest {
  rawBody: string
  headers: Record<string, string | string[] | undefined>
  secret?: string
  nowMs?: number
  reserveNonce?: (nonce: string) => Promise<boolean>
}

export type EmailIngestResult
  = | { status: 'accepted', leadId: string }
    | { status: 'duplicate' | 'quarantined' | 'in_progress' }

export class EmailTerminalTransitionError extends Error {
  constructor(cause: unknown) {
    super(cause instanceof Error ? cause.message : 'Email terminal transition failed', { cause })
    this.name = 'EmailTerminalTransitionError'
  }
}

function failure(statusCode: number, statusMessage: string): never {
  throw createError({ statusCode, statusMessage })
}

function header(request: EmailSignatureRequest, name: string): string | null {
  const value = request.headers[name] ?? request.headers[name.toLowerCase()]
  return typeof value === 'string' ? value.trim() : null
}

function signingSecret(request: EmailSignatureRequest): string {
  const secret = request.secret ?? process.env.EMAIL_INGEST_HMAC_SECRET
  if (!isStrongEmailSecret(secret)) failure(503, 'email_ingest_unavailable')
  return secret
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

function constantTimeHexEquals(left: string, right: string): boolean {
  const a = Buffer.from(left, 'hex')
  const b = Buffer.from(right, 'hex')
  return a.length === b.length && a.length === 32 && timingSafeEqual(a, b)
}

async function reserveEmailIngestNonce(nonce: string): Promise<boolean> {
  const row = await queryOne<{ nonce: string }>(`
    INSERT INTO lead_email_ingest_nonces (nonce, expires_at)
    VALUES ($1, NOW() + MAKE_INTERVAL(secs => $2::int))
    ON CONFLICT (nonce) DO NOTHING
    RETURNING nonce
  `, [nonce, NONCE_TTL_SECONDS])
  return Boolean(row)
}

/** Verifies the exact raw JSON bytes and atomically consumes one nonce. */
export async function verifyEmailIngestSignature(request: EmailSignatureRequest): Promise<void> {
  const contentType = header(request, 'content-type')
  const timestamp = header(request, 'x-xeroflow-email-timestamp')
  const nonce = header(request, 'x-xeroflow-email-nonce')
  const signature = header(request, 'x-xeroflow-email-signature')
  if (contentType?.toLowerCase() !== 'application/json' || !timestamp || !nonce || !signature) failure(401, 'invalid_email_ingest_signature')
  if (!UUID_PATTERN.test(nonce) || !/^v1=[a-f0-9]{64}$/i.test(signature)) failure(401, 'invalid_email_ingest_signature')
  const seconds = Number(timestamp)
  const nowMs = request.nowMs ?? Date.now()
  if (!/^\d{10}$/.test(timestamp) || !Number.isSafeInteger(seconds) || Math.abs(nowMs - seconds * 1000) > TIMESTAMP_TOLERANCE_MS) failure(401, 'stale_email_ingest_signature')
  const expected = createHmac('sha256', signingSecret(request))
    .update(`v1\n${timestamp}\n${nonce}\n${sha256(request.rawBody)}`)
    .digest('hex')
  if (!constantTimeHexEquals(signature.slice(3).toLowerCase(), expected)) failure(401, 'invalid_email_ingest_signature')
  const reserved = await (request.reserveNonce ?? reserveEmailIngestNonce)(nonce)
  if (!reserved) failure(409, 'email_ingest_nonce_reused')
}

function normalizeDomains(value: Endpoint['allowed_sender_domains']): string[] {
  if (Array.isArray(value)) return value.map(item => item.toLowerCase())
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string').map(item => item.toLowerCase()) : []
  } catch { return [] }
}

function asPolicy(
  endpoint: Endpoint,
  capabilities: { aiExtractionAvailable: boolean }
): EmailEndpointPolicy {
  const aiFallbackAllowed = capabilities.aiExtractionAvailable
    && hasCurrentEmailAiPrivacyApproval(endpoint)
  const policy = {
    schemaVersion: 1,
    parserMode: endpoint.parser_mode,
    aiExtractionMode: aiFallbackAllowed ? 'fallback' : 'disabled',
    expectedProvider: endpoint.expected_provider,
    allowedSenderDomains: normalizeDomains(endpoint.allowed_sender_domains),
    maxRawBytes: 2 * 1024 * 1024,
    maxAdfAttachmentBytes: 256 * 1024
  }
  const parsed = EmailEndpointPolicySchema.safeParse(policy)
  if (!parsed.success) failure(409, 'email_endpoint_policy_denied')
  return parsed.data
}

async function endpointForToken(db: LeadTransactionClient, token: string, lock = false): Promise<Endpoint | null> {
  if (!TOKEN_PATTERN.test(token)) return null
  const result = await db.query(`
    SELECT endpoint.*, client.lead_capture_mode
    FROM lead_email_endpoints endpoint
    JOIN agency_clients client ON client.id = endpoint.client_id
    WHERE endpoint.enabled = TRUE AND endpoint.retired_at IS NULL
      AND (
        endpoint.address_token = $1
        OR (
          endpoint.previous_address_token = $1
          AND endpoint.previous_token_grace_until > NOW()
        )
      )
    LIMIT 1${lock ? ' FOR UPDATE OF endpoint' : ''}
  `, [token])
  return (result.rows?.[0] as Endpoint | undefined) ?? null
}

export async function resolveEmailEndpointPolicy(
  request: { recipientToken: string },
  capabilities: { aiExtractionAvailable: boolean } = { aiExtractionAvailable: false }
): Promise<EmailEndpointPolicy> {
  if (!TOKEN_PATTERN.test(request.recipientToken)) failure(404, 'email_endpoint_unavailable')
  const endpoint = await resolveEmailEndpointToken(request.recipientToken) as Endpoint | null
  if (!endpoint) failure(404, 'email_endpoint_unavailable')
  return asPolicy(endpoint, capabilities)
}

function parseStage(request: unknown): EmailStageRequest {
  const parsed = EmailStageRequestSchema.safeParse(request)
  if (!parsed.success) failure(400, 'invalid_email_stage_request')
  if (new Date(parsed.data.quarantineExpiresAt).getTime() <= Date.now()) failure(400, 'invalid_email_stage_request')
  return parsed.data
}

/** Creates an endpoint-scoped durable reservation before any MIME is stored. */
export async function reserveEmailIngestionStage(request: EmailStageRequest): Promise<EmailStageResponse> {
  const input = parseStage(request)
  return transaction(async (db) => {
    const endpoint = await endpointForToken(db, input.recipientToken, true)
    if (!endpoint) {
      return { schemaVersion: 1, outcome: 'denied', code: 'email_endpoint_unavailable' }
    }
    if (endpoint.lead_capture_mode === 'analytics_only') {
      return { schemaVersion: 1, outcome: 'denied', code: 'email_endpoint_unavailable' }
    }
    if (!senderDomainsAllowed(endpoint, input.envelopeSenderDomain, input.headerFromDomain)) {
      return { schemaVersion: 1, outcome: 'denied', code: 'email_endpoint_policy_denied' }
    }
    const existing = await db.query(`
      SELECT id, endpoint_id, client_id, correlation_id, external_id_hash, message_id_hash,
        transport, provider, sender_domain, header_from_domain, raw_size,
        raw_content_hash_version, raw_content_hash,
        status, terminal_at, next_attempt_at, attempt_count, staged_object_key,
        staged_expires_at, (staged_expires_at IS NULL OR staged_expires_at <= NOW()) AS staged_expired
      FROM lead_email_ingestions
      WHERE endpoint_id = $1
        AND (
          external_id_hash = $2
          OR ($3::text IS NOT NULL AND external_id_hash = $3)
        )
      ORDER BY (external_id_hash = $2) DESC
      LIMIT 1
      FOR UPDATE
    `, [endpoint.id, input.externalIdHash, input.legacyExternalIdHash])
    const found = existing.rows?.[0] as (
      Ingestion & { staged_object_key?: string | null, staged_expired?: boolean }
    ) | undefined
    if (found) {
      if (found.terminal_at) {
        if (found.status === 'accepted' || found.status === 'duplicate') {
          await updateEndpointHealthForTerminal(db, {
            id: found.id,
            endpoint_id: endpoint.id,
            client_id: endpoint.client_id
          }, 'duplicate')
        }
        return {
          schemaVersion: 1,
          outcome: 'duplicate',
          correlationId: found.correlation_id,
          ingestionId: found.id,
          cleanupObjectKey: ['accepted', 'duplicate'].includes(found.status)
            ? found.staged_object_key ?? null
            : null
        }
      }
      const immutableIdentityMatches = (
        found.message_id_hash === input.messageIdHash
        && found.transport === input.transport
        && found.provider === input.provider
        && found.sender_domain === input.envelopeSenderDomain
        && found.header_from_domain === input.headerFromDomain
        && Number(found.raw_size) === input.rawSize
        && found.raw_content_hash_version === input.rawContentHashVersion
        && found.raw_content_hash === input.rawContentHash
      )
      if (!immutableIdentityMatches) {
        return {
          schemaVersion: 1,
          outcome: 'denied',
          code: 'email_stage_identity_conflict'
        }
      }
      if (found.staged_expired) {
        await db.query(`
          UPDATE lead_email_ingestions
          SET status = 'failed', error_class = 'evidence_expired',
            terminal_at = NULL, next_attempt_at = NOW(), updated_at = NOW()
          WHERE id = $1 AND terminal_at IS NULL
            AND (staged_expires_at IS NULL OR staged_expires_at <= NOW())
          RETURNING id
        `, [found.id])
        return {
          schemaVersion: 1,
          outcome: 'duplicate',
          correlationId: found.correlation_id,
          ingestionId: found.id,
          cleanupObjectKey: null
        }
      }
      if (!found.staged_object_key) failure(409, 'email_stage_reservation_invalid')
      return {
        schemaVersion: 1,
        outcome: 'reserved',
        correlationId: found.correlation_id,
        ingestionId: found.id,
        encryptedObjectKey: found.staged_object_key
      }
    }
    const key = createOpaqueEmailObjectKey()
    const inserted = await db.query(`
      INSERT INTO lead_email_ingestions (
        endpoint_id, client_id, correlation_id, transport, external_id_hash, message_id_hash,
        provider, sender_domain, header_from_domain, raw_size,
        raw_content_hash_version, raw_content_hash,
        status, safe_evidence, staged_object_key, staged_expires_at, next_attempt_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
        'received', $13::jsonb, $14, $15::timestamptz,
        NOW() + MAKE_INTERVAL(secs => $16::int)
      )
      RETURNING id, correlation_id
    `, [endpoint.id, endpoint.client_id, input.correlationId, input.transport, input.externalIdHash,
      input.messageIdHash, input.provider, input.envelopeSenderDomain, input.headerFromDomain,
      input.rawSize, input.rawContentHashVersion, input.rawContentHash,
      JSON.stringify(input.safeEvidence), key, input.quarantineExpiresAt, STAGING_GRACE_SECONDS])
    const row = inserted.rows?.[0] as { id?: string, correlation_id?: string } | undefined
    if (!row?.id || !row.correlation_id) failure(409, 'email_stage_reservation_conflict')
    return {
      schemaVersion: 1,
      outcome: 'reserved',
      correlationId: row.correlation_id,
      ingestionId: row.id,
      encryptedObjectKey: key
    }
  }) as Promise<EmailStageResponse>
}

export async function markEmailEndpointReceipt(ingestionId: string): Promise<void> {
  await queryOne(`
    UPDATE lead_email_endpoints endpoint
    SET last_received_at = NOW(), updated_at = NOW()
    FROM lead_email_ingestions ingestion
    WHERE ingestion.id = $1
      AND endpoint.id = ingestion.endpoint_id
      AND endpoint.client_id = ingestion.client_id
    RETURNING endpoint.id
  `, [ingestionId])
}

/** Marks the exact reserved object recoverable only after R2 put() completed. */
export async function confirmEmailIngestionStage(input: EmailStageConfirmation) {
  const confirmation = EmailStageConfirmationSchema.parse(input)
  const row = await queryOne<{ id: string }>(`
    UPDATE lead_email_ingestions
    SET staged_uploaded_at = COALESCE(staged_uploaded_at, NOW()),
      next_attempt_at = NOW(),
      updated_at = NOW()
    WHERE id = $1
      AND correlation_id = $2
      AND staged_object_key = $3
      AND raw_content_hash_version = $4
      AND raw_content_hash = $5
      AND terminal_at IS NULL
      AND staged_expires_at > NOW()
    RETURNING id
  `, [
    confirmation.ingestionId,
    confirmation.correlationId,
    confirmation.encryptedObjectKey,
    confirmation.rawContentHashVersion,
    confirmation.rawContentHash
  ])
  if (!row) failure(409, 'email_stage_confirmation_mismatch')
  return { schemaVersion: 1 as const, status: 'confirmed' as const }
}

const CUSTOMER_FIELD_KEYS = new Set([
  'full_name', 'first_name', 'last_name',
  'email', 'email_address', 'work_email',
  'phone', 'phone_number', 'mobile', 'mobile_number', 'telephone',
  'address', 'address_line_1', 'address_line_2', 'suburb', 'state', 'postcode', 'country',
  'request_date', 'campaign'
])

function clean(value: string): string | null {
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function setIfPresent(target: Record<string, string>, key: string, value: string | undefined, max = 4000) {
  const normalized = value && clean(value)
  if (normalized) target[key] = normalized.slice(0, max)
}

function confidenceBand(confidence: number): 'high' | 'medium' | 'low' {
  if (confidence >= 0.85) return 'high'
  if (confidence >= 0.65) return 'medium'
  return 'low'
}

export function mapEmailExtractionToLeadInput(input: {
  endpoint: Pick<Endpoint, 'id' | 'client_id' | 'form_id' | 'form_name'>
  externalIdHash: string
  receivedAt: string
  extraction: EmailLeadExtraction
}): InsertLeadInput & { client_id: string } {
  const fieldData: Record<string, string> = {}
  for (const [key, extracted] of Object.entries(input.extraction.fields)) {
    if (CUSTOMER_FIELD_KEYS.has(key)) setIfPresent(fieldData, key, extracted.value)
  }
  if (fieldData.full_name && !fieldData.first_name) {
    const parts = fieldData.full_name.split(/\s+/)
    setIfPresent(fieldData, 'first_name', parts[0], 200)
    if (parts.length > 1) setIfPresent(fieldData, 'last_name', parts.slice(1).join(' '), 300)
  }
  if (input.extraction.message) setIfPresent(fieldData, 'message', input.extraction.message.value, 20_000)
  for (const [key, extracted] of Object.entries(input.extraction.vehicle ?? {})) {
    if (extracted) setIfPresent(fieldData, `vehicle_${key}`, extracted.value)
  }
  fieldData.lead_provider = input.extraction.provider
  fieldData.lead_source = input.extraction.sourceName
  return {
    client_id: input.endpoint.client_id,
    source: 'email',
    source_lead_id: `email:${input.endpoint.id}:${input.externalIdHash}`,
    form_id: input.endpoint.form_id,
    form_name: input.endpoint.form_name,
    ad_id: null,
    ad_name: null,
    campaign_id: null,
    campaign_name: null,
    page_id: null,
    submitted_at: input.receivedAt,
    field_data: fieldData,
    attribution: {
      utm_source: input.extraction.provider,
      utm_medium: input.extraction.medium,
      provider: input.extraction.provider,
      email_endpoint_id: input.endpoint.id,
      parser: input.extraction.parser,
      confidence_band: confidenceBand(input.extraction.overallConfidence),
      transport: 'email',
      // Retain the pre-launch alias for rules drafted against the original DTO.
      medium: input.extraction.medium
    },
    assigned_to: null,
    created_by: null
  }
}

function hasTruthfulContact(fields: Record<string, string>): boolean {
  const email = fields.email ?? fields.email_address ?? fields.work_email
  if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return true
  const phone = fields.phone ?? fields.phone_number ?? fields.mobile ?? fields.mobile_number ?? fields.telephone
  return Boolean(phone && phone.replace(/\D/g, '').length >= 6)
}

function senderDomainsAllowed(
  endpoint: Endpoint,
  envelopeSenderDomain: string | null,
  headerFromDomain: string | null
): boolean {
  const allowed = normalizeDomains(endpoint.allowed_sender_domains)
  if (!allowed.length) return true
  const domains = [envelopeSenderDomain, headerFromDomain].filter((value): value is string => Boolean(value))
  return domains.length > 0 && domains.every(domain => allowed.some(rule => domain === rule || domain.endsWith(`.${rule}`)))
}

function senderAllowed(endpoint: Endpoint, envelope: EmailIngestEnvelope): boolean {
  return senderDomainsAllowed(endpoint, envelope.envelopeSenderDomain, envelope.headerFromDomain)
}

type TerminalIngestionRow = {
  id: string
  endpoint_id: string
  client_id: string
}

async function updateEndpointHealthForTerminal(
  db: LeadTransactionClient,
  ingestion: TerminalIngestionRow,
  status: LeadIngestionTerminalStatus
): Promise<void> {
  const endpoint = status === 'quarantined'
    ? await db.query(`
        UPDATE lead_email_endpoints
        SET last_failure_at = NOW(),
          consecutive_failures = consecutive_failures + 1,
          updated_at = NOW()
        WHERE id = $1 AND client_id = $2
        RETURNING id
      `, [ingestion.endpoint_id, ingestion.client_id])
    : await db.query(`
        UPDATE lead_email_endpoints
        SET last_received_at = NOW(),
          last_accepted_at = CASE
            WHEN $3 = 'accepted' THEN NOW()
            ELSE last_accepted_at
          END,
          consecutive_failures = 0,
          updated_at = NOW()
        WHERE id = $1 AND client_id = $2
        RETURNING id
      `, [ingestion.endpoint_id, ingestion.client_id, status])
  if (!endpoint.rows?.[0]) throw new Error('Email endpoint health transition failed')
}

async function terminal(
  ingestionId: string,
  status: LeadIngestionTerminalStatus,
  values: {
    leadId?: string | null
    duplicate?: PossibleDuplicateSignal | null
    parser?: string | null
    confidence?: number | null
    senderDomain?: string | null
    errorClass?: string | null
  } = {},
  recoveryLeaseToken?: string,
  recoveryAudit?: {
    actorId: string | null
    actorType: 'cron' | 'team_member'
    action: 'recovery_completed' | 'manual_replay_completed'
  }
): Promise<boolean> {
  const leaseCondition = recoveryLeaseToken
    ? 'AND recovery_lease_token = $11::uuid'
    : 'AND recovery_lease_token IS NULL'
  const sql = `
    UPDATE lead_email_ingestions
    SET status = $2, lead_id = $3, parser = $4, confidence = $5, sender_domain = $6,
      possible_duplicate_of_lead_id = $7, duplicate_match_basis = $8,
      duplicate_confidence = $9, duplicate_window_hours = $10,
      attempt_count = CASE
        WHEN attempt_count = 4 AND error_class = 'final_attempt_leased' THEN 5
        ELSE attempt_count
      END,
      error_class = $12, terminal_at = NOW(), next_attempt_at = NULL,
      recovery_lease_token = CASE WHEN $2 = 'quarantined' THEN NULL ELSE recovery_lease_token END,
      recovery_claimed_at = CASE WHEN $2 = 'quarantined' THEN NULL ELSE recovery_claimed_at END,
      updated_at = NOW()
    WHERE id = $1 AND terminal_at IS NULL
      ${leaseCondition}
    RETURNING id, endpoint_id, client_id
  `
  const params = [ingestionId, status, values.leadId ?? null, values.parser ?? null, values.confidence ?? null, values.senderDomain ?? null,
    values.duplicate?.possibleDuplicateOfLeadId ?? null, values.duplicate?.matchBasis ?? null,
    values.duplicate?.confidence ?? null, values.duplicate?.windowHours ?? null,
    recoveryLeaseToken ?? null, values.errorClass ?? null]
  try {
    return await transaction(async (db) => {
      const updated = await db.query(sql, params)
      const row = updated.rows?.[0] as TerminalIngestionRow | undefined
      if (!row) return false
      await updateEndpointHealthForTerminal(db, row, status)
      if (recoveryAudit) {
        await db.query(`
          INSERT INTO lead_email_ingestion_audits (
            ingestion_id, endpoint_id, client_id, actor_id, actor_type,
            action, outcome, reason
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `, [
          ingestionId, row.endpoint_id, row.client_id,
          recoveryAudit.actorId, recoveryAudit.actorType, recoveryAudit.action,
          status, values.errorClass ?? null
        ])
      }
      return true
    }) as boolean
  } catch (error) {
    throw new EmailTerminalTransitionError(error)
  }
}

async function claimEmailIngestion(
  ingestionId: string,
  envelope: EmailIngestEnvelope,
  recoveryLeaseToken?: string
): Promise<
  | { ingestion: Ingestion, endpoint: Endpoint, ownershipToken: string }
  | { expired: true, endpoint: Endpoint, ownershipToken: string }
  | { notReady: true }
  | EmailIngestResult
> {
  const ownershipToken = recoveryLeaseToken ?? crypto.randomUUID()
  return transaction(async (db) => {
    const endpoint = await endpointForToken(db, envelope.recipientToken, true)
    if (!endpoint) failure(404, 'email_endpoint_unavailable')
    const result = await db.query(`
      SELECT id, endpoint_id, client_id, correlation_id, transport,
        external_id_hash, message_id_hash, raw_content_hash_version, raw_content_hash,
        status, terminal_at, next_attempt_at, attempt_count, recovery_lease_token,
        staged_expires_at,
        (staged_expires_at IS NULL OR staged_expires_at <= clock_timestamp()) AS staged_expired,
        staged_expires_at > clock_timestamp()
          + MAKE_INTERVAL(secs => $2::int) AS staged_ready
      FROM lead_email_ingestions WHERE id = $1 FOR UPDATE
    `, [ingestionId, MIN_CANONICAL_WINDOW_SECONDS])
    const ingestion = result.rows?.[0] as (
      Ingestion & { staged_expired?: boolean, staged_ready?: boolean }
    ) | undefined
    if (!ingestion) failure(404, 'email_ingestion_unavailable')
    if (
      ingestion.endpoint_id !== endpoint.id
      || ingestion.correlation_id !== envelope.correlationId
      || ingestion.transport !== envelope.transport
      || ingestion.external_id_hash !== envelope.externalIdHash
      || ingestion.message_id_hash !== envelope.messageIdHash
      || ingestion.raw_content_hash_version !== envelope.rawContentHashVersion
      || ingestion.raw_content_hash !== envelope.rawContentHash
    ) {
      failure(409, 'email_ingestion_mismatch')
    }
    if (ingestion.terminal_at) return { status: 'duplicate' as const }
    if (
      ingestion.recovery_lease_token
      && ingestion.recovery_lease_token !== recoveryLeaseToken
    ) {
      return { status: 'in_progress' as const }
    }
    if (recoveryLeaseToken && ingestion.recovery_lease_token !== recoveryLeaseToken) {
      return { status: 'in_progress' as const }
    }
    if (ingestion.staged_expired) {
      return { expired: true as const, endpoint, ownershipToken }
    }
    if (!ingestion.staged_ready) return { notReady: true as const }
    if (
      !recoveryLeaseToken
      && ingestion.next_attempt_at
      && new Date(ingestion.next_attempt_at).getTime() > Date.now() + 1_000
    ) {
      return { status: 'in_progress' as const }
    }
    const nextAttempt = ingestion.attempt_count + 1
    if (nextAttempt > MAX_ATTEMPTS) {
      const ownershipCondition = recoveryLeaseToken
        ? 'AND recovery_lease_token = $2::uuid'
        : 'AND recovery_lease_token IS NULL'
      const exhausted = await db.query(`
        UPDATE lead_email_ingestions
        SET status = 'quarantined', error_class = 'attempts_exhausted',
          terminal_at = NOW(), next_attempt_at = NULL, updated_at = NOW()
        WHERE id = $1 AND terminal_at IS NULL
          ${ownershipCondition}
        RETURNING id, endpoint_id, client_id
      `, [ingestion.id, ...(recoveryLeaseToken ? [recoveryLeaseToken] : [])])
      const row = exhausted.rows?.[0] as TerminalIngestionRow | undefined
      if (!row) return { status: 'in_progress' as const }
      await updateEndpointHealthForTerminal(db, row, 'quarantined')
      return { status: 'quarantined' as const }
    }
    if (nextAttempt === MAX_ATTEMPTS) {
      const ownershipCondition = recoveryLeaseToken
        ? 'AND recovery_lease_token = $3::uuid'
        : 'AND recovery_lease_token IS NULL'
      const installOwnership = recoveryLeaseToken
        ? ''
        : 'recovery_lease_token = $3::uuid, recovery_claimed_at = NOW(),'
      const leased = await db.query(`
        UPDATE lead_email_ingestions
        SET status = 'failed', error_class = 'final_attempt_leased',
          ${installOwnership}
          next_attempt_at = NOW() + MAKE_INTERVAL(secs => $2::int), updated_at = NOW()
        WHERE id = $1 AND terminal_at IS NULL AND attempt_count = 4
          AND staged_expires_at > NOW()
          ${ownershipCondition}
        RETURNING id
      `, [
        ingestion.id,
        CLAIM_LEASE_SECONDS,
        ownershipToken
      ])
      return leased.rows?.[0]
        ? { ingestion: { ...ingestion, attempt_count: nextAttempt }, endpoint, ownershipToken }
        : { status: 'in_progress' as const }
    }
    if (recoveryLeaseToken) {
      const leased = await db.query(`
        UPDATE lead_email_ingestions
        SET attempt_count = attempt_count + 1,
          next_attempt_at = NOW() + MAKE_INTERVAL(secs => $2::int),
          updated_at = NOW()
        WHERE id = $1
          AND recovery_lease_token = $3::uuid
          AND staged_expires_at > NOW()
        RETURNING id
      `, [ingestion.id, CLAIM_LEASE_SECONDS, recoveryLeaseToken])
      if (!leased.rows?.[0]) return { status: 'in_progress' as const }
    } else {
      const leased = await db.query(`
        UPDATE lead_email_ingestions
        SET attempt_count = attempt_count + 1,
          recovery_lease_token = $3::uuid, recovery_claimed_at = NOW(),
          next_attempt_at = NOW() + MAKE_INTERVAL(secs => $2::int), updated_at = NOW()
        WHERE id = $1
          AND recovery_lease_token IS NULL
          AND staged_expires_at > NOW()
        RETURNING id
      `, [ingestion.id, CLAIM_LEASE_SECONDS, ownershipToken])
      if (!leased.rows?.[0]) return { status: 'in_progress' as const }
    }
    return { ingestion: { ...ingestion, attempt_count: nextAttempt }, endpoint, ownershipToken }
  }) as Promise<
    | { ingestion: Ingestion, endpoint: Endpoint, ownershipToken: string }
    | { expired: true, endpoint: Endpoint, ownershipToken: string }
    | { notReady: true }
    | EmailIngestResult
  >
}

type RecoveryCompletionAudit = {
  actorId: string | null
  actorType: 'cron' | 'team_member'
  action: 'recovery_completed' | 'manual_replay_completed'
}

async function transitionExpiredEmailIngestion(input: {
  ingestionId: string
  ownershipToken: string
  ownsLease: boolean
  recoveryAudit?: RecoveryCompletionAudit
}): Promise<EmailIngestResult> {
  const ownershipCondition = input.ownsLease
    ? 'AND recovery_lease_token = $2::uuid'
    : 'AND recovery_lease_token IS NULL'
  if (!input.recoveryAudit) {
    await queryOne<{ id: string }>(`
      UPDATE lead_email_ingestions
      SET status = 'failed', error_class = 'evidence_expired',
        terminal_at = NULL, next_attempt_at = NOW(),
        recovery_lease_token = NULL, recovery_claimed_at = NULL, updated_at = NOW()
      WHERE id = $1 AND terminal_at IS NULL
        AND (staged_expires_at IS NULL OR staged_expires_at <= clock_timestamp())
        ${ownershipCondition}
      RETURNING id
    `, [
      input.ingestionId,
      ...(input.ownsLease ? [input.ownershipToken] : [])
    ])
    return { status: 'in_progress' }
  }
  const recoveryAudit = input.recoveryAudit
  try {
    const owned = await transaction(async (db) => {
      const expired = await db.query(`
        UPDATE lead_email_ingestions
        SET status = 'quarantined', error_class = 'evidence_expired',
          terminal_at = NOW(), next_attempt_at = NULL,
          recovery_lease_token = NULL, recovery_claimed_at = NULL, updated_at = NOW()
        WHERE id = $1 AND terminal_at IS NULL
          AND (staged_expires_at IS NULL OR staged_expires_at <= clock_timestamp())
          AND recovery_lease_token = $2::uuid
        RETURNING id, endpoint_id, client_id
      `, [input.ingestionId, input.ownershipToken])
      const row = expired.rows?.[0] as TerminalIngestionRow | undefined
      if (!row) return false
      await updateEndpointHealthForTerminal(db, row, 'quarantined')
      await db.query(`
        INSERT INTO lead_email_ingestion_audits (
          ingestion_id, endpoint_id, client_id, actor_id, actor_type,
          action, outcome, reason
        ) VALUES ($1, $2, $3, $4, $5, $6, 'quarantined', 'evidence_expired')
      `, [
        input.ingestionId, row.endpoint_id, row.client_id,
        recoveryAudit.actorId, recoveryAudit.actorType,
        recoveryAudit.action
      ])
      return true
    }) as boolean
    return owned ? { status: 'quarantined' } : { status: 'in_progress' }
  } catch (error) {
    throw new EmailTerminalTransitionError(error)
  }
}

export async function acceptEmailEnvelope(
  event: H3Event,
  ingestionId: string,
  input: EmailIngestEnvelope,
  options: {
    recoveryLeaseToken?: string
    recoveryAudit?: {
      actorId: string | null
      actorType: 'cron' | 'team_member'
      action: 'recovery_completed' | 'manual_replay_completed'
    }
  } = {}
): Promise<EmailIngestResult> {
  if (!UUID_PATTERN.test(ingestionId)) failure(400, 'invalid_email_ingestion_id')
  const parsed = EmailIngestEnvelopeSchema.safeParse(input)
  if (!parsed.success || parsed.data.ingestionId !== ingestionId) failure(400, 'invalid_email_ingest_envelope')
  const envelope = parsed.data
  const claim = await claimEmailIngestion(ingestionId, envelope, options.recoveryLeaseToken)
  if ('status' in claim) return claim
  if ('notReady' in claim) return { status: 'in_progress' }
  const { endpoint, ownershipToken } = claim
  const recoveryAudit = options.recoveryAudit
  if ('expired' in claim) {
    return transitionExpiredEmailIngestion({
      ingestionId,
      ownershipToken,
      ownsLease: Boolean(options.recoveryLeaseToken),
      recoveryAudit
    })
  }
  const { ingestion } = claim
  if (endpoint.lead_capture_mode === 'analytics_only') {
    const owned = await terminal(
      ingestionId,
      'quarantined',
      { errorClass: 'capture_mode_ineligible' },
      ownershipToken,
      recoveryAudit
    )
    return owned ? { status: 'quarantined' } : { status: 'in_progress' }
  }
  if (!senderAllowed(endpoint, envelope)) {
    const owned = await terminal(ingestionId, 'quarantined', {
      senderDomain: envelope.envelopeSenderDomain,
      errorClass: 'sender_policy_denied'
    }, ownershipToken, recoveryAudit)
    return owned ? { status: 'quarantined' } : { status: 'in_progress' }
  }
  if (!envelope.extraction) {
    const owned = await terminal(ingestionId, 'quarantined', {
      senderDomain: envelope.envelopeSenderDomain,
      errorClass: 'extraction_requires_review'
    }, ownershipToken, recoveryAudit)
    return owned ? { status: 'quarantined' } : { status: 'in_progress' }
  }
  if (endpoint.expected_provider && endpoint.expected_provider !== envelope.extraction.provider) {
    const owned = await terminal(ingestionId, 'quarantined', {
      senderDomain: envelope.envelopeSenderDomain,
      errorClass: 'provider_policy_denied'
    }, ownershipToken, recoveryAudit)
    return owned ? { status: 'quarantined' } : { status: 'in_progress' }
  }
  const lead = mapEmailExtractionToLeadInput({ endpoint, externalIdHash: envelope.externalIdHash, receivedAt: envelope.receivedAt, extraction: envelope.extraction })
  if (!hasTruthfulContact(lead.field_data)) {
    const owned = await terminal(ingestionId, 'quarantined', {
      parser: envelope.extraction.parser,
      confidence: envelope.extraction.overallConfidence,
      senderDomain: envelope.envelopeSenderDomain,
      errorClass: 'truthful_contact_missing'
    }, ownershipToken, recoveryAudit)
    return owned ? { status: 'quarantined' } : { status: 'in_progress' }
  }
  let accepted: Awaited<ReturnType<typeof import('~~/server/utils/leads/acceptance')['acceptLead']>>
  try {
    // Keep the canonical boundary lazy so private ingress verification remains
    // usable in minimal runtimes and does not load application side effects
    // until a reservation has been successfully claimed.
    const { acceptLead, resolveLeadCaptureMode } = await import('~~/server/utils/leads/acceptance')
    const leadCaptureMode = await resolveLeadCaptureMode(endpoint.client_id)
    const evidenceCurrent = await queryOne<{ id: string }>(`
      SELECT id
      FROM lead_email_ingestions
      WHERE id = $1
        AND recovery_lease_token = $2::uuid
        AND terminal_at IS NULL
        AND staged_expires_at > clock_timestamp()
    `, [ingestionId, ownershipToken])
    if (!evidenceCurrent) {
      return await transitionExpiredEmailIngestion({
        ingestionId,
        ownershipToken,
        ownsLease: true,
        recoveryAudit
      })
    }
    accepted = await acceptLead(event, {
      lead,
      leadCaptureMode,
      consentDecision: 'unknown',
      identityFingerprintSecret: resolveLeadIdentityFingerprintSecret(event),
      emailEvidenceGuard: {
        ingestionId,
        leaseToken: ownershipToken
      }
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'EmailTerminalTransitionError') throw error
    const terminalFailure = ingestion.attempt_count >= MAX_ATTEMPTS
    if (terminalFailure) {
      const owned = await terminal(
        ingestionId,
        'quarantined',
        {
          parser: envelope.extraction.parser,
          confidence: envelope.extraction.overallConfidence,
          senderDomain: envelope.envelopeSenderDomain,
          errorClass: 'attempts_exhausted'
        },
        ownershipToken,
        recoveryAudit
      )
      return owned ? { status: 'quarantined' } : { status: 'in_progress' }
    }
    if (recoveryAudit) throw error
    await queryOne<{ id: string }>(`
      UPDATE lead_email_ingestions
      SET status = 'failed', error_class = $2, terminal_at = NULL,
        next_attempt_at = NOW() + INTERVAL '5 minutes', updated_at = NOW()
      WHERE id = $1 AND terminal_at IS NULL
        AND recovery_lease_token = $3::uuid
      RETURNING id
    `, [
      ingestionId,
      error instanceof Error ? error.name.slice(0, 120) : 'unknown',
      ownershipToken
    ])
    throw error
  }
  if (accepted.status === 'evidence_expired') {
    return transitionExpiredEmailIngestion({
      ingestionId,
      ownershipToken,
      ownsLease: true,
      recoveryAudit
    })
  }
  if (accepted.status === 'mode_skipped') {
    const owned = await terminal(
      ingestionId,
      'quarantined',
      {
        parser: envelope.extraction.parser,
        confidence: envelope.extraction.overallConfidence,
        senderDomain: envelope.envelopeSenderDomain,
        errorClass: 'capture_mode_ineligible'
      },
      ownershipToken,
      recoveryAudit
    )
    return owned ? { status: 'quarantined' } : { status: 'in_progress' }
  }
  if (accepted.status === 'duplicate') {
    const owned = await terminal(ingestionId, 'duplicate', { parser: envelope.extraction.parser, confidence: envelope.extraction.overallConfidence, senderDomain: envelope.envelopeSenderDomain }, ownershipToken, recoveryAudit)
    if (owned) {
      emitEmailIngestionEvent({
        event: 'email_ingestion_transport_duplicate',
        correlationId: envelope.correlationId,
        endpointId: endpoint.id,
        clientId: endpoint.client_id,
        provider: envelope.extraction.provider,
        parser: envelope.extraction.parser,
        status: 'duplicate'
      })
    }
    return owned ? { status: 'duplicate' } : { status: 'in_progress' }
  }
  if (accepted.status !== 'created') {
    const owned = await terminal(
      ingestionId,
      'quarantined',
      {
        parser: envelope.extraction.parser,
        confidence: envelope.extraction.overallConfidence,
        senderDomain: envelope.envelopeSenderDomain,
        errorClass: 'canonical_outcome_invalid'
      },
      ownershipToken,
      recoveryAudit
    )
    return owned ? { status: 'quarantined' } : { status: 'in_progress' }
  }
  let duplicate: PossibleDuplicateSignal | null = null
  try {
    duplicate = await transaction(db => findEmailLeadDuplicateSignal(db, {
      clientId: endpoint.client_id, leadId: accepted.leadId, fieldData: lead.field_data, occurredAt: lead.submitted_at
    })) as PossibleDuplicateSignal | null
  } catch {
    // Similarity enrichment is advisory; it must never roll back canonical acceptance.
  }
  const owned = await terminal(ingestionId, 'accepted', {
    leadId: accepted.leadId, duplicate, parser: envelope.extraction.parser,
    confidence: envelope.extraction.overallConfidence, senderDomain: envelope.envelopeSenderDomain
  }, ownershipToken, recoveryAudit)
  if (!owned) return { status: 'in_progress' }
  emitEmailIngestionEvent({
    event: 'email_ingestion_canonical',
    correlationId: envelope.correlationId,
    endpointId: endpoint.id,
    clientId: endpoint.client_id,
    provider: envelope.extraction.provider,
    parser: envelope.extraction.parser,
    status: 'accepted'
  })
  if (duplicate) {
    emitEmailIngestionEvent({
      event: 'email_ingestion_possible_duplicate',
      correlationId: envelope.correlationId,
      endpointId: endpoint.id,
      clientId: endpoint.client_id,
      provider: envelope.extraction.provider,
      parser: envelope.extraction.parser,
      status: 'possible_duplicate'
    })
  }
  return { status: 'accepted', leadId: accepted.leadId }
}
