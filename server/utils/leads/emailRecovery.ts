import { queryOne, transaction } from '~~/server/utils/db'
import { createError, type H3Event } from 'h3'
import {
  EmailIngestEnvelopeSchema,
  EmailEndpointPolicySchema,
  type EmailEndpointPolicy,
  type EmailIngestEnvelope
} from '~~/shared/leads/email/contracts'
import { extractEmailLeadWithAi, needsAiExtractionFallback } from '~~/shared/leads/email/ai'
import { parseMimeContent } from '~~/shared/leads/email/mime'
import { parseEmailLead, sha256Hex } from '~~/shared/leads/email/parser'
import { decryptStagedEmail } from '~~/shared/leads/email/quarantine'
import type { NormalizedInboundEmail } from '~~/shared/leads/email/types'
import { createNitroEmailAiRuntime } from '~~/server/utils/leads/emailAiRuntime'
import { getCachedObjectBinding } from '~~/server/utils/email'

const RECOVERY_LEASE_SECONDS = 5 * 60

export interface EmailRecoveryClaim {
  id: string
  endpoint_id: string
  client_id: string
  correlation_id: string
  transport: 'cloudflare_email_routing'
  external_id_hash: string
  message_id_hash: string | null
  provider: string
  sender_domain: string | null
  safe_evidence: {
    hasText: boolean
    hasHtml: boolean
    hasAdf: boolean
    fieldKeys: string[]
  }
  staged_object_key: string | null
  staged_expires_at: string | null
  staged_uploaded_at: string | null
  attempt_count: number
  created_at: string
  endpoint_enabled: boolean
  endpoint_retired_at: string | null
  address_token: string
  email_address: string
  expected_provider: string | null
  parser_mode: 'auto' | 'adf' | 'generic'
  ai_extraction_mode: 'disabled' | 'fallback'
  allowed_sender_domains: string[] | string
}

export type EmailRecoveryReason
  = | 'missing_evidence'
    | 'corrupt_evidence'
    | 'endpoint_unavailable'
    | 'sender_policy_denied'
    | 'attempts_exhausted'
    | 'evidence_expired'
    | 'legacy_evidence'
    | 'canonical_transient'
    | 'lease_lost'

interface RecoveryObject {
  arrayBuffer(): Promise<ArrayBuffer>
}

export interface EmailRecoveryBucket {
  get(key: string): Promise<RecoveryObject | null>
  delete(key: string): Promise<void>
}

interface EmailRecoveryAuditEvent {
  ingestionId: string
  endpointId: string
  clientId: string
  actorId: string | null
  actorType: 'cron' | 'team_member'
  action:
    | 'recovery_claimed'
    | 'recovery_completed'
    | 'recovery_rescheduled'
    | 'recovery_quarantined'
    | 'terminal_cleanup'
    | 'manual_replay_completed'
    | 'manual_replay_rejected'
  outcome: 'claimed' | 'accepted' | 'duplicate' | 'quarantined' | 'rescheduled' | 'deleted'
  reason?: EmailRecoveryReason
}

export interface EmailRecoveryRepository {
  commitTransition?(input: {
    kind: 'quarantine' | 'reschedule' | 'clear_terminal' | 'release_terminal'
    ingestionId: string
    leaseToken: string
    reason?: EmailRecoveryReason
    delaySeconds?: number
    clearObjectKey?: boolean
    audit: EmailRecoveryAuditEvent
  }): Promise<boolean>
  quarantine(
    ingestionId: string,
    leaseToken: string,
    reason: EmailRecoveryReason,
    clearObjectKey: boolean
  ): Promise<boolean>
  reschedule(
    ingestionId: string,
    leaseToken: string,
    delaySeconds: number,
    reason: EmailRecoveryReason
  ): Promise<boolean>
  clearTerminalObject(ingestionId: string, leaseToken: string): Promise<boolean>
  releaseTerminalLease(ingestionId: string, leaseToken: string): Promise<boolean>
  audit(event: EmailRecoveryAuditEvent): Promise<void>
}

interface WorkersAiBinding {
  run(
    model: string,
    inputs: Record<string, unknown>,
    options?: { signal?: AbortSignal, tags?: string[] }
  ): Promise<Record<string, unknown> | string>
}

type AcceptEnvelope = (
  event: H3Event,
  ingestionId: string,
  envelope: EmailIngestEnvelope,
  options: {
    recoveryLeaseToken: string
    recoveryAudit?: {
      actorId: string | null
      actorType: 'cron' | 'team_member'
      action: 'recovery_completed' | 'manual_replay_completed'
    }
  }
) => Promise<{ status: 'accepted', leadId: string } | { status: 'duplicate' | 'quarantined' | 'in_progress' }>

export interface ProcessEmailRecoveryDependencies {
  bucket: EmailRecoveryBucket
  encryptionSecret: string
  repository: EmailRecoveryRepository
  acceptEnvelope: AcceptEnvelope
  ai: WorkersAiBinding | null
  nowMs(): number
  auditActor?: {
    actorId: string
    actorType: 'team_member'
  }
}

/**
 * Installs a short ownership lease and returns immediately. R2, parsing, AI,
 * and canonical ingestion must happen after this transaction has committed.
 */
export async function claimNextEmailRecovery(
  leaseToken: string
): Promise<EmailRecoveryClaim | null> {
  return transaction(async (db) => {
    const result = await db.query<EmailRecoveryClaim>(`
      WITH candidate AS (
        SELECT i.id
        FROM lead_email_ingestions i
        JOIN lead_email_endpoints e ON e.id = i.endpoint_id
        WHERE i.terminal_at IS NULL
          AND i.status IN ('received', 'failed')
          AND i.next_attempt_at <= NOW()
          AND i.attempt_count < 5
          AND i.staged_expires_at > NOW()
          AND i.client_id = e.client_id
          AND (
            i.recovery_lease_token IS NULL
            OR i.recovery_claimed_at <= NOW() - MAKE_INTERVAL(secs => $2::int)
          )
        ORDER BY i.next_attempt_at ASC, i.created_at ASC, i.id ASC
        FOR UPDATE OF i SKIP LOCKED
        LIMIT 1
      )
      UPDATE lead_email_ingestions i
      SET recovery_lease_token = $1::uuid,
        recovery_claimed_at = NOW(),
        next_attempt_at = NOW() + MAKE_INTERVAL(secs => $2::int),
        updated_at = NOW()
      FROM candidate c, lead_email_endpoints e
      WHERE i.id = c.id
        AND e.id = i.endpoint_id
      RETURNING
        i.id, i.endpoint_id, i.client_id, i.correlation_id, i.transport,
        i.external_id_hash, i.message_id_hash, i.provider, i.sender_domain,
        i.safe_evidence, i.staged_object_key, i.staged_expires_at, i.staged_uploaded_at,
        i.attempt_count, i.created_at,
        e.enabled AS endpoint_enabled, e.retired_at AS endpoint_retired_at,
        e.address_token, e.email_address, e.expected_provider, e.parser_mode,
        e.ai_extraction_mode, e.allowed_sender_domains
    `, [leaseToken, RECOVERY_LEASE_SECONDS])
    const claim = result.rows[0] ?? null
    if (claim) {
      await db.query(`
        INSERT INTO lead_email_ingestion_audits (
          ingestion_id, endpoint_id, client_id, actor_type, action, outcome
        ) VALUES ($1, $2, $3, 'cron', 'recovery_claimed', 'claimed')
      `, [claim.id, claim.endpoint_id, claim.client_id])
    }
    return claim
  })
}

/**
 * Expiry and attempt limits are reconciled independently of retry scheduling,
 * so a future backoff cannot extend the seven-day retention boundary.
 */
export async function claimNextEmailTerminalReconciliation(
  leaseToken: string
): Promise<EmailRecoveryClaim | null> {
  return transaction(async (db) => {
    const result = await db.query<EmailRecoveryClaim>(`
      WITH candidate AS (
        SELECT i.id
        FROM lead_email_ingestions i
        JOIN lead_email_endpoints e
          ON e.id = i.endpoint_id
         AND e.client_id = i.client_id
        WHERE i.terminal_at IS NULL
          AND i.status IN ('received', 'failed')
          AND (
            i.attempt_count >= 5
            OR i.staged_expires_at IS NULL
            OR i.staged_expires_at <= NOW()
          )
          AND (
            i.recovery_lease_token IS NULL
            OR i.recovery_claimed_at <= NOW() - MAKE_INTERVAL(secs => $2::int)
          )
        ORDER BY i.created_at ASC, i.id ASC
        FOR UPDATE OF i SKIP LOCKED
        LIMIT 1
      )
      UPDATE lead_email_ingestions i
      SET recovery_lease_token = $1::uuid,
        recovery_claimed_at = NOW(),
        next_attempt_at = NOW() + MAKE_INTERVAL(secs => $2::int),
        updated_at = NOW()
      FROM candidate c, lead_email_endpoints e
      WHERE i.id = c.id
        AND e.id = i.endpoint_id
        AND e.client_id = i.client_id
      RETURNING
        i.id, i.endpoint_id, i.client_id, i.correlation_id, i.transport,
        i.external_id_hash, i.message_id_hash, i.provider, i.sender_domain,
        i.safe_evidence, i.staged_object_key, i.staged_expires_at, i.staged_uploaded_at,
        i.attempt_count, i.created_at,
        e.enabled AS endpoint_enabled, e.retired_at AS endpoint_retired_at,
        e.address_token, e.email_address, e.expected_provider, e.parser_mode,
        e.ai_extraction_mode, e.allowed_sender_domains
    `, [leaseToken, RECOVERY_LEASE_SECONDS])
    const claim = result.rows[0] ?? null
    if (claim) {
      await db.query(`
        INSERT INTO lead_email_ingestion_audits (
          ingestion_id, endpoint_id, client_id, actor_type, action, outcome
        ) VALUES ($1, $2, $3, 'cron', 'recovery_claimed', 'claimed')
      `, [claim.id, claim.endpoint_id, claim.client_id])
    }
    return claim
  })
}

function normalizeDomains(value: string[] | string): string[] {
  if (Array.isArray(value)) return value.map(domain => domain.toLowerCase())
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed)
      ? parsed.filter((domain): domain is string => typeof domain === 'string').map(domain => domain.toLowerCase())
      : []
  } catch {
    return []
  }
}

function domainOf(address: string | null): string | null {
  const match = address?.trim().match(/@([^>\s]+)>?$/)
  return match?.[1]?.toLowerCase().replace(/\.$/, '') ?? null
}

function senderAllowed(domain: string | null, allowed: string[]): boolean {
  if (!allowed.length) return true
  return Boolean(domain && allowed.some(rule => domain === rule || domain.endsWith(`.${rule}`)))
}

function policyFor(claim: EmailRecoveryClaim): EmailEndpointPolicy {
  return EmailEndpointPolicySchema.parse({
    schemaVersion: 1,
    parserMode: claim.parser_mode,
    aiExtractionMode: claim.ai_extraction_mode,
    expectedProvider: claim.expected_provider,
    allowedSenderDomains: normalizeDomains(claim.allowed_sender_domains),
    maxRawBytes: 2 * 1024 * 1024,
    maxAdfAttachmentBytes: 256 * 1024
  })
}

function retryDelaySeconds(priorAttempts: number): number {
  return Math.min(60 * (2 ** priorAttempts), 60 * 60)
}

async function quarantine(
  claim: EmailRecoveryClaim,
  leaseToken: string,
  dependencies: ProcessEmailRecoveryDependencies,
  reason: EmailRecoveryReason,
  clearObjectKey: boolean
) {
  const auditEvent: EmailRecoveryAuditEvent = {
    ingestionId: claim.id,
    endpointId: claim.endpoint_id,
    clientId: claim.client_id,
    actorId: dependencies.auditActor?.actorId ?? null,
    actorType: dependencies.auditActor?.actorType ?? 'cron',
    action: dependencies.auditActor ? 'manual_replay_rejected' : 'recovery_quarantined',
    outcome: 'quarantined',
    reason
  }
  const updated = dependencies.repository.commitTransition
    ? await dependencies.repository.commitTransition({
        kind: 'quarantine', ingestionId: claim.id, leaseToken, reason,
        clearObjectKey, audit: auditEvent
      })
    : await dependencies.repository.quarantine(claim.id, leaseToken, reason, clearObjectKey)
  if (!updated) return { status: 'quarantined' as const, reason: 'lease_lost' as const }
  if (!dependencies.repository.commitTransition) await dependencies.repository.audit(auditEvent)
  return { status: 'quarantined' as const, reason }
}

export async function processEmailRecoveryClaim(
  event: H3Event,
  claim: EmailRecoveryClaim,
  leaseToken: string,
  dependencies: ProcessEmailRecoveryDependencies
): Promise<
  | { status: 'accepted' | 'duplicate' | 'rescheduled' }
  | { status: 'quarantined', reason: EmailRecoveryReason }
> {
  if (!claim.endpoint_enabled || claim.endpoint_retired_at) {
    return quarantine(claim, leaseToken, dependencies, 'endpoint_unavailable', false)
  }
  if (claim.attempt_count >= 5) {
    return quarantine(claim, leaseToken, dependencies, 'attempts_exhausted', false)
  }
  if (
    !claim.staged_expires_at
    || new Date(claim.staged_expires_at).getTime() <= dependencies.nowMs()
  ) {
    if (claim.staged_object_key) await dependencies.bucket.delete(claim.staged_object_key)
    return quarantine(claim, leaseToken, dependencies, 'evidence_expired', true)
  }
  if (!claim.staged_object_key) {
    return quarantine(claim, leaseToken, dependencies, 'missing_evidence', true)
  }
  const object = await dependencies.bucket.get(claim.staged_object_key)
  if (!object && !claim.staged_uploaded_at) {
    const auditEvent: EmailRecoveryAuditEvent = {
      ingestionId: claim.id, endpointId: claim.endpoint_id, clientId: claim.client_id,
      actorId: dependencies.auditActor?.actorId ?? null,
      actorType: dependencies.auditActor?.actorType ?? 'cron',
      action: dependencies.auditActor ? 'manual_replay_completed' : 'recovery_rescheduled',
      outcome: 'rescheduled', reason: 'missing_evidence'
    }
    const updated = dependencies.repository.commitTransition
      ? await dependencies.repository.commitTransition({
          kind: 'reschedule', ingestionId: claim.id, leaseToken,
          delaySeconds: RECOVERY_LEASE_SECONDS, reason: 'missing_evidence', audit: auditEvent
        })
      : await dependencies.repository.reschedule(claim.id, leaseToken, RECOVERY_LEASE_SECONDS, 'missing_evidence')
    if (!updated) return { status: 'quarantined', reason: 'lease_lost' }
    if (!dependencies.repository.commitTransition) await dependencies.repository.audit(auditEvent)
    return { status: 'rescheduled' }
  }
  if (!object) return quarantine(claim, leaseToken, dependencies, 'missing_evidence', true)

  let raw: Uint8Array
  let originalEnvelopeSender: string | null
  let parsed: Awaited<ReturnType<typeof parseMimeContent>>
  try {
    const staged = await decryptStagedEmail(
      new Uint8Array(await object.arrayBuffer()),
      dependencies.encryptionSecret
    )
    if (staged.format === 'legacy') {
      return quarantine(claim, leaseToken, dependencies, 'legacy_evidence', false)
    }
    raw = staged.raw
    originalEnvelopeSender = staged.envelopeSender
    parsed = await parseMimeContent(raw)
  } catch {
    return quarantine(claim, leaseToken, dependencies, 'corrupt_evidence', false)
  }

  const policy = policyFor(claim)
  const headerFromDomain = domainOf(parsed.headerFrom)
  if (
    !senderAllowed(claim.sender_domain, policy.allowedSenderDomains)
    || !senderAllowed(headerFromDomain, policy.allowedSenderDomains)
  ) {
    return quarantine(claim, leaseToken, dependencies, 'sender_policy_denied', false)
  }
  const normalized: NormalizedInboundEmail = {
    transport: claim.transport,
    envelopeRecipient: claim.email_address,
    envelopeSender: originalEnvelopeSender,
    headerFrom: parsed.headerFrom,
    subject: parsed.subject,
    text: parsed.text ?? parsed.htmlText,
    html: parsed.html,
    messageId: parsed.messageId,
    attachments: parsed.attachments,
    receivedAt: claim.created_at,
    rawSize: parsed.rawSize
  }
  let extraction = parseEmailLead(normalized, policy)
  if (
    policy.aiExtractionMode === 'fallback'
    && dependencies.ai
    && needsAiExtractionFallback(extraction)
  ) {
    extraction = await extractEmailLeadWithAi(
      { email: normalized, canonicalExternalIdHash: claim.external_id_hash },
      extraction,
      createNitroEmailAiRuntime(dependencies.ai)
    )
  }
  if (extraction) extraction = { ...extraction, externalIdHash: claim.external_id_hash }
  const canonicalExtraction = extraction?.needsReview ? null : extraction
  const envelope = EmailIngestEnvelopeSchema.parse({
    schemaVersion: 1,
    correlationId: claim.correlation_id,
    ingestionId: claim.id,
    transport: claim.transport,
    recipientToken: claim.address_token,
    recipientAddressHash: sha256Hex(claim.email_address),
    envelopeSenderDomain: claim.sender_domain,
    headerFromDomain,
    messageIdHash: claim.message_id_hash,
    externalIdHash: claim.external_id_hash,
    receivedAt: claim.created_at,
    rawSize: parsed.rawSize,
    attachmentCount: parsed.attachments.length,
    extraction: canonicalExtraction,
    safeEvidence: claim.safe_evidence,
    quarantine: canonicalExtraction
      ? undefined
      : {
          reason: 'Extraction requires review',
          encryptedObjectKey: claim.staged_object_key,
          expiresAt: claim.staged_expires_at
        }
  })

  let result: Awaited<ReturnType<AcceptEnvelope>>
  try {
    result = await dependencies.acceptEnvelope(
      event,
      claim.id,
      envelope,
      {
        recoveryLeaseToken: leaseToken,
        recoveryAudit: {
          actorId: dependencies.auditActor?.actorId ?? null,
          actorType: dependencies.auditActor?.actorType ?? 'cron',
          action: dependencies.auditActor ? 'manual_replay_completed' : 'recovery_completed'
        }
      }
    )
  } catch (error) {
    if (error instanceof Error && error.name === 'EmailTerminalTransitionError') throw error
    const delay = retryDelaySeconds(claim.attempt_count)
    const auditEvent: EmailRecoveryAuditEvent = {
      ingestionId: claim.id, endpointId: claim.endpoint_id, clientId: claim.client_id,
      actorId: dependencies.auditActor?.actorId ?? null,
      actorType: dependencies.auditActor?.actorType ?? 'cron',
      action: dependencies.auditActor ? 'manual_replay_completed' : 'recovery_rescheduled',
      outcome: 'rescheduled', reason: 'canonical_transient'
    }
    const updated = dependencies.repository.commitTransition
      ? await dependencies.repository.commitTransition({
          kind: 'reschedule', ingestionId: claim.id, leaseToken,
          delaySeconds: delay, reason: 'canonical_transient', audit: auditEvent
        })
      : await dependencies.repository.reschedule(claim.id, leaseToken, delay, 'canonical_transient')
    if (!updated) {
      return { status: 'quarantined', reason: 'lease_lost' }
    }
    if (!dependencies.repository.commitTransition) await dependencies.repository.audit(auditEvent)
    return { status: 'rescheduled' }
  }

  if (result.status === 'accepted' || result.status === 'duplicate') {
    await dependencies.bucket.delete(claim.staged_object_key)
    const auditEvent: EmailRecoveryAuditEvent = {
      ingestionId: claim.id, endpointId: claim.endpoint_id, clientId: claim.client_id,
      actorId: dependencies.auditActor?.actorId ?? null,
      actorType: dependencies.auditActor?.actorType ?? 'cron',
      action: 'terminal_cleanup',
      outcome: 'deleted'
    }
    const cleared = dependencies.repository.commitTransition
      ? await dependencies.repository.commitTransition({
          kind: 'clear_terminal', ingestionId: claim.id, leaseToken, audit: auditEvent
        })
      : await dependencies.repository.clearTerminalObject(claim.id, leaseToken)
    if (!cleared) throw new Error('Email recovery lease lost')
    if (!dependencies.repository.commitTransition) await dependencies.repository.audit(auditEvent)
    return { status: result.status }
  }
  if (result.status === 'in_progress') {
    return { status: 'quarantined', reason: 'lease_lost' }
  }
  // Canonical terminalization owns the completion audit and clears the recovery
  // lease for quarantined outcomes. A second release audit would be misleading.
  return { status: 'quarantined', reason: 'lease_lost' }
}

interface TerminalCleanupCandidate {
  id: string
  staged_object_key: string
}

export async function claimNextTerminalEmailObject(
  leaseToken: string
): Promise<TerminalCleanupCandidate | null> {
  return transaction(async (db) => {
    const result = await db.query<TerminalCleanupCandidate>(`
      WITH candidate AS (
        SELECT id
        FROM lead_email_ingestions
        WHERE terminal_at IS NOT NULL
          AND (
            status IN ('accepted', 'duplicate')
            OR (
              status IN ('quarantined', 'failed')
              AND (staged_expires_at IS NULL OR staged_expires_at <= NOW())
            )
          )
          AND staged_object_key IS NOT NULL
          AND (
            recovery_lease_token IS NULL
            OR recovery_claimed_at <= NOW() - MAKE_INTERVAL(secs => $2::int)
          )
        ORDER BY terminal_at ASC, id ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      UPDATE lead_email_ingestions i
      SET recovery_lease_token = $1::uuid,
        recovery_claimed_at = NOW(),
        updated_at = NOW()
      FROM candidate c
      WHERE i.id = c.id
      RETURNING i.id, i.staged_object_key
    `, [leaseToken, RECOVERY_LEASE_SECONDS])
    return result.rows[0] ?? null
  })
}

interface TerminalCleanupRepository {
  clearTerminalObjectWithAudit?(
    ingestionId: string,
    leaseToken: string
  ): Promise<boolean>
  claimTerminalObject(leaseToken: string): Promise<TerminalCleanupCandidate | null>
  clearTerminalObject(ingestionId: string, leaseToken: string): Promise<boolean>
  audit(event: {
    ingestionId: string
    actorType: 'cron'
    action: 'terminal_cleanup'
    outcome: 'deleted'
  }): Promise<void>
}

export async function cleanupTerminalEmailEvidence(input: {
  bucket: EmailRecoveryBucket
  repository: TerminalCleanupRepository
  randomUUID(): string
  limit?: number
}): Promise<{ cleaned: number }> {
  const limit = Math.min(Math.max(input.limit ?? 25, 1), 100)
  let cleaned = 0
  while (cleaned < limit) {
    const leaseToken = input.randomUUID()
    const candidate = await input.repository.claimTerminalObject(leaseToken)
    if (!candidate) break
    await input.bucket.delete(candidate.staged_object_key)
    const cleared = input.repository.clearTerminalObjectWithAudit
      ? await input.repository.clearTerminalObjectWithAudit(candidate.id, leaseToken)
      : await input.repository.clearTerminalObject(candidate.id, leaseToken)
    if (!cleared) throw new Error('Email recovery lease lost')
    if (!input.repository.clearTerminalObjectWithAudit) {
      await input.repository.audit({
        ingestionId: candidate.id,
        actorType: 'cron',
        action: 'terminal_cleanup',
        outcome: 'deleted'
      })
    }
    cleaned++
  }
  return { cleaned }
}

const defaultRepository: EmailRecoveryRepository = {
  async commitTransition(input) {
    return transaction(async (db) => {
      let result
      if (input.kind === 'quarantine') {
        result = await db.query(`
          UPDATE lead_email_ingestions
          SET status = 'quarantined', error_class = $3, terminal_at = NOW(),
            next_attempt_at = NULL,
            staged_object_key = CASE WHEN $4 THEN NULL ELSE staged_object_key END,
            recovery_lease_token = NULL, recovery_claimed_at = NULL, updated_at = NOW()
          WHERE id = $1 AND recovery_lease_token = $2::uuid
          RETURNING id
        `, [input.ingestionId, input.leaseToken, input.reason, input.clearObjectKey ?? false])
      } else if (input.kind === 'reschedule') {
        result = await db.query(`
          UPDATE lead_email_ingestions
          SET status = 'failed', error_class = $4, terminal_at = NULL,
            next_attempt_at = NOW() + MAKE_INTERVAL(secs => $3::int),
            recovery_lease_token = NULL, recovery_claimed_at = NULL, updated_at = NOW()
          WHERE id = $1 AND recovery_lease_token = $2::uuid
            AND terminal_at IS NULL AND attempt_count < 5
          RETURNING id
        `, [input.ingestionId, input.leaseToken, input.delaySeconds, input.reason])
      } else if (input.kind === 'clear_terminal') {
        result = await db.query(`
          UPDATE lead_email_ingestions
          SET staged_object_key = NULL, recovery_lease_token = NULL,
            recovery_claimed_at = NULL, updated_at = NOW()
          WHERE id = $1 AND recovery_lease_token = $2::uuid
            AND terminal_at IS NOT NULL
            AND (
              status IN ('accepted', 'duplicate')
              OR (
                status IN ('quarantined', 'failed')
                AND (staged_expires_at IS NULL OR staged_expires_at <= NOW())
              )
            )
          RETURNING id
        `, [input.ingestionId, input.leaseToken])
      } else {
        result = await db.query(`
          UPDATE lead_email_ingestions
          SET recovery_lease_token = NULL, recovery_claimed_at = NULL, updated_at = NOW()
          WHERE id = $1 AND recovery_lease_token = $2::uuid AND terminal_at IS NOT NULL
          RETURNING id
        `, [input.ingestionId, input.leaseToken])
      }
      if (!result.rows?.[0]) return false
      const event = input.audit
      await db.query(`
        INSERT INTO lead_email_ingestion_audits (
          ingestion_id, endpoint_id, client_id, actor_id, actor_type,
          action, outcome, reason
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [
        event.ingestionId, event.endpointId, event.clientId, event.actorId,
        event.actorType, event.action, event.outcome, event.reason ?? null
      ])
      return true
    })
  },
  async quarantine(ingestionId, leaseToken, reason, clearObjectKey) {
    const row = await queryOne<{ id: string }>(`
      UPDATE lead_email_ingestions
      SET status = 'quarantined',
        error_class = $3,
        terminal_at = NOW(),
        next_attempt_at = NULL,
        staged_object_key = CASE WHEN $4 THEN NULL ELSE staged_object_key END,
        recovery_lease_token = NULL,
        recovery_claimed_at = NULL,
        updated_at = NOW()
      WHERE id = $1
        AND recovery_lease_token = $2::uuid
      RETURNING id
    `, [ingestionId, leaseToken, reason, clearObjectKey])
    return Boolean(row)
  },
  async reschedule(ingestionId, leaseToken, delaySeconds, reason) {
    const row = await queryOne<{ id: string }>(`
      UPDATE lead_email_ingestions
      SET status = 'failed',
        error_class = $4,
        terminal_at = NULL,
        next_attempt_at = NOW() + MAKE_INTERVAL(secs => $3::int),
        recovery_lease_token = NULL,
        recovery_claimed_at = NULL,
        updated_at = NOW()
      WHERE id = $1
        AND recovery_lease_token = $2::uuid
        AND terminal_at IS NULL
        AND attempt_count < 5
      RETURNING id
    `, [ingestionId, leaseToken, delaySeconds, reason])
    return Boolean(row)
  },
  async clearTerminalObject(ingestionId, leaseToken) {
    const row = await queryOne<{ id: string }>(`
      UPDATE lead_email_ingestions
      SET staged_object_key = NULL,
        recovery_lease_token = NULL,
        recovery_claimed_at = NULL,
        updated_at = NOW()
      WHERE id = $1
        AND recovery_lease_token = $2::uuid
        AND terminal_at IS NOT NULL
        AND (
          status IN ('accepted', 'duplicate')
          OR (
            status IN ('quarantined', 'failed')
            AND (staged_expires_at IS NULL OR staged_expires_at <= NOW())
          )
        )
      RETURNING id
    `, [ingestionId, leaseToken])
    return Boolean(row)
  },
  async releaseTerminalLease(ingestionId, leaseToken) {
    const row = await queryOne<{ id: string }>(`
      UPDATE lead_email_ingestions
      SET recovery_lease_token = NULL,
        recovery_claimed_at = NULL,
        updated_at = NOW()
      WHERE id = $1
        AND recovery_lease_token = $2::uuid
        AND terminal_at IS NOT NULL
      RETURNING id
    `, [ingestionId, leaseToken])
    return Boolean(row)
  },
  async audit(event) {
    await queryOne(`
      INSERT INTO lead_email_ingestion_audits (
        ingestion_id, endpoint_id, client_id, actor_id, actor_type,
        action, outcome, reason
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id
    `, [
      event.ingestionId,
      event.endpointId,
      event.clientId,
      event.actorId,
      event.actorType,
      event.action,
      event.outcome,
      event.reason ?? null
    ])
  }
}

const defaultTerminalCleanupRepository: TerminalCleanupRepository = {
  async claimTerminalObject(leaseToken) {
    return claimNextTerminalEmailObject(leaseToken)
  },
  async clearTerminalObject(ingestionId, leaseToken) {
    return defaultRepository.clearTerminalObject(ingestionId, leaseToken)
  },
  async clearTerminalObjectWithAudit(ingestionId, leaseToken) {
    return transaction(async (db) => {
      const cleared = await db.query(`
        UPDATE lead_email_ingestions
        SET staged_object_key = NULL, recovery_lease_token = NULL,
          recovery_claimed_at = NULL, updated_at = NOW()
        WHERE id = $1 AND recovery_lease_token = $2::uuid
          AND terminal_at IS NOT NULL
          AND (
            status IN ('accepted', 'duplicate')
            OR (
              status IN ('quarantined', 'failed')
              AND (staged_expires_at IS NULL OR staged_expires_at <= NOW())
            )
          )
        RETURNING id, endpoint_id, client_id
      `, [ingestionId, leaseToken])
      const row = cleared.rows?.[0] as {
        id: string
        endpoint_id: string
        client_id: string
      } | undefined
      if (!row) return false
      await db.query(`
        INSERT INTO lead_email_ingestion_audits (
          ingestion_id, endpoint_id, client_id, actor_type, action, outcome
        ) VALUES ($1, $2, $3, 'cron', 'terminal_cleanup', 'deleted')
      `, [row.id, row.endpoint_id, row.client_id])
      return true
    })
  },
  async audit(event) {
    await queryOne(`
      INSERT INTO lead_email_ingestion_audits (
        ingestion_id, endpoint_id, client_id, actor_type, action, outcome
      )
      SELECT id, endpoint_id, client_id, $2, $3, $4
      FROM lead_email_ingestions
      WHERE id = $1
      RETURNING id
    `, [event.ingestionId, event.actorType, event.action, event.outcome])
  }
}

export interface EmailRecoveryRuntime {
  bucket: EmailRecoveryBucket
  encryptionSecret: string
  ai: WorkersAiBinding | null
}

export function resolveEmailRecoveryRuntime(event: H3Event): EmailRecoveryRuntime {
  const env = (event.context as {
    cloudflare?: { env?: Record<string, unknown> }
  }).cloudflare?.env
  const bucket = (
    env?.EMAIL_QUARANTINE_BUCKET
    ?? getCachedObjectBinding<EmailRecoveryBucket>('EMAIL_QUARANTINE_BUCKET')
  ) as EmailRecoveryBucket | undefined
  const encryptionSecret = typeof env?.EMAIL_QUARANTINE_ENCRYPTION_SECRET === 'string'
    ? env.EMAIL_QUARANTINE_ENCRYPTION_SECRET
    : process.env.EMAIL_QUARANTINE_ENCRYPTION_SECRET
  const ai = env?.AI && typeof env.AI === 'object'
    ? env.AI as WorkersAiBinding
    : null
  if (!bucket || !encryptionSecret || encryptionSecret.length < 16) {
    throw createError({ statusCode: 503, statusMessage: 'email_recovery_unavailable' })
  }
  return { bucket, encryptionSecret, ai }
}

export interface EmailRecoveryRunResult {
  recovered: number
  rescheduled: number
  quarantined: number
  cleaned: number
  failed: number
}

export async function recoverEmailIngestions(
  event: H3Event,
  runtime: EmailRecoveryRuntime,
  input: {
    limit?: number
    repository?: EmailRecoveryRepository
    terminalRepository?: TerminalCleanupRepository
    acceptEnvelope?: AcceptEnvelope
    claimRecovery?: typeof claimNextEmailRecovery
    claimTerminal?: typeof claimNextEmailTerminalReconciliation
    randomUUID?: () => string
    nowMs?: () => number
  } = {}
): Promise<EmailRecoveryRunResult> {
  const limit = Math.min(Math.max(input.limit ?? 25, 1), 100)
  const repository = input.repository ?? defaultRepository
  const randomUUID = input.randomUUID ?? (() => crypto.randomUUID())
  const nowMs = input.nowMs ?? (() => Date.now())
  const { acceptEmailEnvelope } = await import('~~/server/utils/leads/emailIngestion')
  const acceptEnvelope = input.acceptEnvelope ?? acceptEmailEnvelope
  const result: EmailRecoveryRunResult = {
    recovered: 0,
    rescheduled: 0,
    quarantined: 0,
    cleaned: 0,
    failed: 0
  }

  const runClaims = async (
    claimNext: (leaseToken: string) => Promise<EmailRecoveryClaim | null>
  ) => {
    for (let index = 0; index < limit; index++) {
      const leaseToken = randomUUID()
      const claim = await claimNext(leaseToken)
      if (!claim) break
      try {
        const outcome = await processEmailRecoveryClaim(event, claim, leaseToken, {
          bucket: runtime.bucket,
          encryptionSecret: runtime.encryptionSecret,
          ai: runtime.ai,
          repository,
          acceptEnvelope,
          nowMs
        })
        if (outcome.status === 'accepted' || outcome.status === 'duplicate') result.recovered++
        else if (outcome.status === 'rescheduled') result.rescheduled++
        else result.quarantined++
      } catch {
        // Keep processing other independent claims. The lease expires naturally
        // and makes this row eligible for a later recovery pass.
        result.failed++
      }
    }
  }

  // Reconcile retention/attempt terminal states first. These candidates are
  // intentionally independent of next_attempt_at.
  await runClaims(input.claimTerminal ?? claimNextEmailTerminalReconciliation)
  await runClaims(input.claimRecovery ?? claimNextEmailRecovery)

  try {
    const cleanup = await cleanupTerminalEmailEvidence({
      bucket: runtime.bucket,
      repository: input.terminalRepository ?? defaultTerminalCleanupRepository,
      randomUUID,
      limit
    })
    result.cleaned = cleanup.cleaned
  } catch {
    result.failed++
  }

  return result
}

type ReplayClaimResult
  = | { outcome: 'claimed', claim: EmailRecoveryClaim, leaseToken: string }
    | { outcome: 'rejected', reason: EmailRecoveryReason }

async function claimEmailReplay(
  ingestionId: string,
  actorId: string,
  leaseToken: string
): Promise<ReplayClaimResult> {
  return transaction(async (db) => {
    const selected = await db.query<EmailRecoveryClaim & {
      status: string
      terminal_at: string | null
      recovery_lease_token: string | null
      recovery_claimed_at: string | null
    }>(`
      SELECT
        i.id, i.endpoint_id, i.client_id, i.correlation_id, i.transport,
        i.external_id_hash, i.message_id_hash, i.provider, i.sender_domain,
        i.safe_evidence, i.staged_object_key, i.staged_expires_at, i.staged_uploaded_at,
        i.attempt_count, i.created_at, i.status, i.terminal_at,
        i.recovery_lease_token, i.recovery_claimed_at,
        e.enabled AS endpoint_enabled, e.retired_at AS endpoint_retired_at,
        e.address_token, e.email_address, e.expected_provider, e.parser_mode,
        e.ai_extraction_mode, e.allowed_sender_domains
      FROM lead_email_ingestions i
      JOIN lead_email_endpoints e
        ON e.id = i.endpoint_id
       AND e.client_id = i.client_id
      JOIN team_members tm
        ON tm.id = $2
       AND tm.is_active = TRUE
      WHERE i.id = $1
      FOR UPDATE OF i SKIP LOCKED
    `, [ingestionId, actorId])
    const claim = selected.rows[0]
    if (
      !claim
      || (
        claim.recovery_lease_token
        && claim.recovery_claimed_at
        && new Date(claim.recovery_claimed_at).getTime() > Date.now() - RECOVERY_LEASE_SECONDS * 1000
      )
    ) {
      return { outcome: 'rejected', reason: 'lease_lost' }
    }
    let reason: EmailRecoveryReason | null = null
    if (!claim.endpoint_enabled || claim.endpoint_retired_at) reason = 'endpoint_unavailable'
    else if (claim.attempt_count >= 5) reason = 'attempts_exhausted'
    else if (
      !claim.staged_expires_at
      || new Date(claim.staged_expires_at).getTime() <= Date.now()
    ) reason = 'evidence_expired'
    else if (!claim.staged_object_key) reason = 'missing_evidence'
    if (reason) {
      await db.query(`
        INSERT INTO lead_email_ingestion_audits (
          ingestion_id, endpoint_id, client_id, actor_id, actor_type,
          action, outcome, reason
        ) VALUES ($1, $2, $3, $4, 'team_member',
          'manual_replay_rejected', 'skipped', $5)
      `, [claim.id, claim.endpoint_id, claim.client_id, actorId, reason])
      return { outcome: 'rejected', reason }
    }
    if (!['quarantined', 'failed'].includes(claim.status)) {
      return { outcome: 'rejected', reason: 'lease_lost' }
    }
    const updated = await db.query(`
      UPDATE lead_email_ingestions
      SET status = 'failed',
        terminal_at = NULL,
        next_attempt_at = NOW() + MAKE_INTERVAL(secs => $4::int),
        recovery_lease_token = $3::uuid,
        recovery_claimed_at = NOW(),
        updated_at = NOW()
      WHERE id = $1
        AND client_id = $2
        AND (
          recovery_lease_token IS NULL
          OR recovery_claimed_at <= NOW() - MAKE_INTERVAL(secs => $4::int)
        )
        AND attempt_count < 5
      RETURNING id
    `, [claim.id, claim.client_id, leaseToken, RECOVERY_LEASE_SECONDS])
    if (!updated.rows[0]) return { outcome: 'rejected', reason: 'lease_lost' }
    await db.query(`
      INSERT INTO lead_email_ingestion_audits (
        ingestion_id, endpoint_id, client_id, actor_id, actor_type,
        action, outcome
      ) VALUES ($1, $2, $3, $4, 'team_member',
        'manual_replay_requested', 'claimed')
    `, [claim.id, claim.endpoint_id, claim.client_id, actorId])
    return { outcome: 'claimed', claim, leaseToken }
  })
}

export async function replayEmailIngestion(
  event: H3Event,
  ingestionId: string,
  actorId: string,
  input: EmailRecoveryRuntime & {
    repository?: EmailRecoveryRepository
    acceptEnvelope?: AcceptEnvelope
    claimReplay?: typeof claimEmailReplay
    randomUUID?: () => string
    nowMs?: () => number
    auditActor?: ProcessEmailRecoveryDependencies['auditActor']
  }
) {
  const leaseToken = (input.randomUUID ?? (() => crypto.randomUUID()))()
  const claimed = await (input.claimReplay ?? claimEmailReplay)(
    ingestionId,
    actorId,
    leaseToken
  )
  if (claimed.outcome === 'rejected') {
    const statusMessage = claimed.reason === 'lease_lost'
      ? 'email_replay_in_progress'
      : `email_replay_${claimed.reason}`
    throw createError({ statusCode: 409, statusMessage })
  }
  const { acceptEmailEnvelope } = await import('~~/server/utils/leads/emailIngestion')
  return processEmailRecoveryClaim(event, claimed.claim, claimed.leaseToken, {
    bucket: input.bucket,
    encryptionSecret: input.encryptionSecret,
    ai: input.ai,
    repository: input.repository ?? defaultRepository,
    acceptEnvelope: input.acceptEnvelope ?? acceptEmailEnvelope,
    nowMs: input.nowMs ?? (() => Date.now()),
    auditActor: input.auditActor ?? { actorId, actorType: 'team_member' }
  })
}
