import { z } from 'zod'

import {
  EmailEndpointPolicySchema,
  EmailIngestEnvelopeSchema,
  EmailStageConfirmationSchema,
  EmailStageRequestSchema,
  EmailStageResponseSchema,
  EmailStagedManifestSchema,
  type EmailEndpointPolicy,
  type EmailIngestEnvelope,
  type EmailStageRequest
} from '../../../shared/leads/email/contracts'
import { extractEmailLeadWithAi, needsAiExtractionFallback } from '../../../shared/leads/email/ai'
import {
  emailMessageIdHashes,
  parseEmailLead,
  sha256Hex
} from '../../../shared/leads/email/parser'
import { isStrongEmailSecret } from '../../../shared/leads/email/secretPolicy'
import {
  emitEmailIngestionEvent,
  type EmailIngestionTelemetryInput
} from '../../../shared/leads/email/telemetry'
import { createWorkerEmailAiRuntime } from './aiRuntime'
import {
  deleteEncryptedRawEmail,
  encryptedRawEmailPutOptions,
  encryptStagedEmail,
  putEncryptedRawEmail,
  secretsAreEqual
} from './quarantine'
import { createSignedHeaders, sha256HexBytes } from './signing'
import {
  extractRecipientToken,
  mailboxDomain,
  normalizeCloudflareEmail,
  readBoundedRawEmail,
  type CloudflareEmailMessage
} from './transport'

const RETRY_DELAYS_MS = [100, 200] as const
const RESPONSE_LIMIT_BYTES = 64 * 1024
const QUARANTINE_RETENTION_MS = 7 * 24 * 60 * 60_000
const MAX_TELEMETRY_EVENTS = 20

const IngestResponseSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('accepted'), leadId: z.string().uuid() }).strict(),
  z.object({ status: z.literal('duplicate') }).strict(),
  z.object({ status: z.literal('quarantined') }).strict(),
  z.object({ status: z.literal('in_progress') }).strict()
])

export interface EmailIntakeDependencies {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>
  nowMs(): number
  randomUUID(): string
  sleep(milliseconds: number): Promise<void>
  emit?(event: Record<string, unknown>): void
}

export type EmailIntakeOutcome
  = | { status: 'accepted' | 'duplicate' | 'quarantined' | 'failed' | 'in_progress', correlationId: string }
    | { status: 'rejected' }

export class RetryableEmailIntakeError extends Error {
  override readonly name = 'RetryableEmailIntakeError'

  constructor(
    readonly correlationId: string,
    cause?: unknown,
    readonly errorClass: 'unexpected' | 'internal_upstream_network' | 'internal_upstream_401' | 'internal_upstream_409' | 'internal_upstream_4xx' | 'internal_upstream_5xx' = 'unexpected'
  ) {
    super('Email intake must be retried', { cause })
  }
}

const defaultDependencies: EmailIntakeDependencies = {
  fetch: (input, init) => fetch(input, init),
  nowMs: () => Date.now(),
  randomUUID: () => crypto.randomUUID(),
  sleep: milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))
}

function emit(
  dependencies: EmailIntakeDependencies,
  input: EmailIngestionTelemetryInput
): void {
  if (dependencies.emit) emitEmailIngestionEvent(input, dependencies.emit)
}

function authoritativeTelemetry(
  events: Record<string, unknown>[],
  correlationId: string | undefined
): Record<string, unknown>[] {
  if (!correlationId) return events.slice(0, MAX_TELEMETRY_EVENTS)
  return events.slice(0, MAX_TELEMETRY_EVENTS).map(event => (
    'correlationId' in event ? { ...event, correlationId } : event
  ))
}

function transportEventClasses(event: Record<string, unknown>): string[] {
  const classes: string[] = []
  if (event.event === 'email_ingestion_receipt') classes.push('pre_policy')
  if (event.errorClass === 'unknown_recipient') classes.push('unknown_recipient')
  if (event.errorClass === 'policy_denied') classes.push('policy_denied')
  if (event.errorClass === 'r2_write_failed') classes.push('r2_write_failure')
  if (event.errorClass === 'r2_delete_failed') classes.push('r2_delete_failure')
  if (event.errorClass === 'ai_schema_rejected') classes.push('ai_schema_rejection')
  return classes
}

async function persistTransportTelemetry(
  events: Record<string, unknown>[],
  env: Env,
  dependencies: EmailIntakeDependencies
): Promise<void> {
  const transportEvents = events.flatMap(event =>
    transportEventClasses(event).map(eventClass => ({
      eventClass,
      correlationId: typeof event.correlationId === 'string' ? event.correlationId : null
    }))
  ).slice(0, 32)
  if (!transportEvents.length) return
  try {
    const body = JSON.stringify({
      schemaVersion: 1,
      batchId: dependencies.randomUUID(),
      events: transportEvents
    })
    await signedRequest(
      '/api/internal/leads/email-telemetry',
      body,
      env,
      dependencies,
      transportEvents[0]?.correlationId ?? dependencies.randomUUID()
    )
  } catch {
    // Durable telemetry is best-effort at the ingestion boundary and must not
    // change mail acceptance. Missing batches are visible as a telemetry gap.
  }
}

function applicationOrigin(value: string): string {
  const url = new URL(value)
  if (
    url.protocol !== 'https:'
    || url.username
    || url.password
    || url.pathname !== '/'
    || url.search
    || url.hash
  ) {
    throw new Error('Invalid application origin')
  }
  return url.origin
}

function senderAllowed(domain: string | null, policy: EmailEndpointPolicy): boolean {
  if (!policy.allowedSenderDomains.length) return true
  if (!domain) return false
  return policy.allowedSenderDomains.some(rule => domain === rule || domain.endsWith(`.${rule}`))
}

function isRetryableStatus(status: number): boolean {
  return [408, 425, 429, 500, 502, 503, 504].includes(status)
}

function upstreamErrorClass(status: number): RetryableEmailIntakeError['errorClass'] {
  if (status === 401) return 'internal_upstream_401'
  if (status === 409) return 'internal_upstream_409'
  return status >= 500 ? 'internal_upstream_5xx' : 'internal_upstream_4xx'
}

async function readBoundedJson(response: Response): Promise<unknown> {
  if (!response.body) throw new Error('Internal response body is unavailable')
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > RESPONSE_LIMIT_BYTES) {
        await reader.cancel('Internal response exceeds limit')
        throw new Error('Internal response exceeds limit')
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  const body = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  return JSON.parse(new TextDecoder().decode(body))
}

async function signedRequest(
  path: string,
  body: string,
  env: Env,
  dependencies: EmailIntakeDependencies,
  correlationId: string
): Promise<Response> {
  const origin = applicationOrigin(env.APPLICATION_ORIGIN)
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    const headers = await createSignedHeaders(body, env.EMAIL_INGEST_HMAC_SECRET, {
      timestampSeconds: String(Math.floor(dependencies.nowMs() / 1000)),
      nonce: dependencies.randomUUID()
    })
    try {
      const response = await dependencies.fetch(new URL(path, origin), {
        method: 'POST',
        headers,
        body
      })
      if (response.ok || !isRetryableStatus(response.status)) return response
      if (attempt === RETRY_DELAYS_MS.length) return response
    } catch (error) {
      if (attempt === RETRY_DELAYS_MS.length) {
        retryable(correlationId, error, 'internal_upstream_network')
      }
    }
    if (attempt < RETRY_DELAYS_MS.length) await dependencies.sleep(RETRY_DELAYS_MS[attempt]!)
  }
  retryable(correlationId, undefined, 'internal_upstream_network')
}

function retryable(
  correlationId: string,
  cause?: unknown,
  errorClass?: RetryableEmailIntakeError['errorClass']
): never {
  throw new RetryableEmailIntakeError(correlationId, cause, errorClass)
}

function configuredBucket(value: unknown): value is R2Bucket {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<R2Bucket>
  return typeof candidate.put === 'function' && typeof candidate.delete === 'function'
}

async function validateEmailIntakeConfiguration(
  env: Env,
  correlationId: string
): Promise<void> {
  try {
    applicationOrigin(env.APPLICATION_ORIGIN)
    if (
      !isStrongEmailSecret(env.EMAIL_INGEST_HMAC_SECRET)
      || !isStrongEmailSecret(env.EMAIL_QUARANTINE_ENCRYPTION_SECRET)
      || !configuredBucket(env.EMAIL_QUARANTINE_BUCKET)
      || await secretsAreEqual(
        env.EMAIL_INGEST_HMAC_SECRET,
        env.EMAIL_QUARANTINE_ENCRYPTION_SECRET
      )
    ) {
      throw new Error('Email intake configuration is unavailable')
    }
  } catch (error) {
    retryable(correlationId, error)
  }
}

async function putEncryptedRawEmailWithRetry(
  bucket: R2Bucket,
  objectKey: string,
  encrypted: Uint8Array,
  options: R2PutOptions,
  correlationId: string,
  dependencies: EmailIntakeDependencies
): Promise<void> {
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      await putEncryptedRawEmail(bucket, objectKey, encrypted, options)
      return
    } catch (error) {
      if (attempt === RETRY_DELAYS_MS.length) {
        emit(dependencies, {
          event: 'email_ingestion_failure',
          correlationId,
          status: 'failed',
          errorClass: 'r2_write_failed',
          attemptCount: attempt + 1
        })
        retryable(correlationId, error)
      }
    }
    await dependencies.sleep(RETRY_DELAYS_MS[attempt]!)
  }
}

async function deleteEncryptedRawEmailWithRetry(
  bucket: R2Bucket,
  objectKey: string,
  correlationId: string,
  dependencies: EmailIntakeDependencies
): Promise<void> {
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      await deleteEncryptedRawEmail(bucket, objectKey)
      return
    } catch {
      if (attempt === RETRY_DELAYS_MS.length) {
        emit(dependencies, {
          event: 'email_ingestion_failure',
          correlationId,
          status: 'failed',
          errorClass: 'r2_delete_failed',
          attemptCount: attempt + 1
        })
        retryable(correlationId)
      }
    }
    await dependencies.sleep(RETRY_DELAYS_MS[attempt]!)
  }
}

function safeEvidence(input: {
  text: string | null
  html: string | null
  attachments: Array<{ filename: string, contentType: string }>
}, fieldKeys: string[]) {
  return {
    hasText: Boolean(input.text),
    hasHtml: Boolean(input.html),
    hasAdf: Boolean(
      input.text?.trimStart().match(/^(?:<\?xml[\s\S]*?)?<adf\b/i)
      || input.attachments.some(item => item.contentType.toLowerCase().includes('xml') || /\.(?:adf|xml)$/i.test(item.filename))
    ),
    fieldKeys: fieldKeys.slice(0, 100)
  }
}

function reject(message: CloudflareEmailMessage, reason: string): EmailIntakeOutcome {
  message.setReject(reason)
  return { status: 'rejected' }
}

export async function handleEmailMessage(
  message: CloudflareEmailMessage,
  env: Env,
  dependencies: EmailIntakeDependencies = defaultDependencies
): Promise<EmailIntakeOutcome> {
  const correlationId = dependencies.randomUUID()
  await validateEmailIntakeConfiguration(env, correlationId)
  const recipientToken = extractRecipientToken(message.to)
  if (!recipientToken) {
    emit(dependencies, {
      event: 'email_ingestion_receipt',
      correlationId,
      status: 'rejected',
      errorClass: 'unknown_recipient'
    })
    return reject(message, 'Unknown lead intake recipient')
  }

  const startedAt = dependencies.nowMs()
  emit(dependencies, {
    event: 'email_ingestion_receipt',
    correlationId,
    status: 'received'
  })
  const receivedAt = new Date(dependencies.nowMs()).toISOString()
  const policyBody = JSON.stringify({ recipientToken })
  const policyResponse = await signedRequest(
    '/api/internal/leads/email-policy',
    policyBody,
    env,
    dependencies,
    correlationId
  )
  if (!policyResponse.ok) {
    if (policyResponse.status === 404 || policyResponse.status === 409) {
      emit(dependencies, {
        event: 'email_ingestion_policy',
        correlationId,
        status: 'denied',
        errorClass: 'policy_denied'
      })
      return reject(message, 'Lead intake policy denied')
    }
    retryable(
      correlationId,
      undefined,
      upstreamErrorClass(policyResponse.status)
    )
  }
  let policyPayload: unknown
  try {
    policyPayload = await readBoundedJson(policyResponse)
  } catch (error) {
    retryable(correlationId, error)
  }
  const policyParsed = EmailEndpointPolicySchema.safeParse(policyPayload)
  if (!policyParsed.success) retryable(correlationId, policyParsed.error)
  const policy = policyParsed.data
  emit(dependencies, {
    event: 'email_ingestion_policy',
    correlationId,
    status: 'allowed'
  })

  const envelopeSenderDomain = mailboxDomain(message.from)
  if (!senderAllowed(envelopeSenderDomain, policy)) return reject(message, 'Lead intake sender denied')
  if (message.rawSize > policy.maxRawBytes) return reject(message, 'Lead intake message exceeds size limit')

  let raw: Uint8Array
  try {
    raw = await readBoundedRawEmail(message.raw, message.rawSize, policy.maxRawBytes)
  } catch {
    return reject(message, 'Lead intake message is invalid')
  }

  let normalized
  try {
    normalized = await normalizeCloudflareEmail(message, raw, receivedAt)
  } catch {
    return reject(message, 'Lead intake message is invalid')
  }
  let extraction: ReturnType<typeof parseEmailLead> = null
  let parserFailed = false
  try {
    extraction = parseEmailLead(normalized, policy)
  } catch {
    parserFailed = true
  }
  emit(dependencies, {
    event: 'email_ingestion_parse',
    correlationId,
    provider: extraction?.provider ?? policy.expectedProvider ?? 'generic',
    parser: extraction?.parser ?? 'none',
    status: extraction ? 'parsed' : 'failed',
    errorClass: parserFailed ? 'parse_failed' : undefined
  })
  const rawContentHash = await sha256HexBytes(raw)
  const messageIdentity = emailMessageIdHashes(normalized.messageId)
  const messageIdHash = messageIdentity?.current ?? null
  const canonicalExternalIdHash = extraction?.externalIdHash
    ?? messageIdHash
    ?? sha256Hex(`raw-fallback:v1:${rawContentHash}`)
  const legacyExternalIdHash = extraction?.legacyExternalIdHash
    ?? messageIdentity?.legacy
    ?? rawContentHash
  if (
    !parserFailed
    && policy.aiExtractionMode === 'fallback'
    && needsAiExtractionFallback(extraction)
  ) {
    extraction = await extractEmailLeadWithAi(
      {
        email: normalized,
        canonicalExternalIdHash
      },
      extraction,
      createWorkerEmailAiRuntime(env.AI)
    )
    emit(dependencies, {
      event: 'email_ingestion_ai',
      correlationId,
      provider: extraction?.provider ?? 'generic',
      parser: extraction?.parser ?? 'none',
      status: extraction ? 'parsed' : 'failed',
      errorClass: extraction ? 'none' : 'ai_schema_rejected'
    })
  }
  const externalIdHash = canonicalExternalIdHash
  const headerFromDomain = mailboxDomain(normalized.headerFrom)
  const evidence = safeEvidence(normalized, Object.keys(extraction?.fields ?? {}))
  const expiresAt = new Date(dependencies.nowMs() + QUARANTINE_RETENTION_MS).toISOString()

  const stage: EmailStageRequest = EmailStageRequestSchema.parse({
    schemaVersion: 1,
    correlationId,
    transport: 'cloudflare_email_routing',
    recipientToken,
    externalIdHash,
    legacyExternalIdHash,
    messageIdHash,
    rawContentHashVersion: 1,
    rawContentHash,
    provider: extraction?.provider ?? policy.expectedProvider ?? 'generic',
    envelopeSenderDomain,
    headerFromDomain,
    receivedAt,
    rawSize: normalized.rawSize,
    safeEvidence: evidence,
    quarantineExpiresAt: expiresAt
  })
  const stageBody = JSON.stringify(stage)
  const stageResponse = await signedRequest(
    '/api/internal/leads/email-stage',
    stageBody,
    env,
    dependencies,
    correlationId
  )
  if (!stageResponse.ok) {
    retryable(
      correlationId,
      undefined,
      upstreamErrorClass(stageResponse.status)
    )
  }
  let stagePayload: unknown
  try {
    stagePayload = await readBoundedJson(stageResponse)
  } catch (error) {
    retryable(correlationId, error)
  }
  const staged = EmailStageResponseSchema.safeParse(stagePayload)
  if (!staged.success) retryable(correlationId, staged.error)
  if (staged.data.outcome === 'denied') {
    emit(dependencies, {
      event: 'email_ingestion_stage_reservation',
      correlationId,
      status: 'denied',
      errorClass: 'policy_denied'
    })
    return reject(message, 'Lead intake stage denied')
  }
  if (staged.data.outcome === 'duplicate') {
    emit(dependencies, {
      event: 'email_ingestion_transport_duplicate',
      correlationId: staged.data.correlationId,
      status: 'duplicate'
    })
    if (staged.data.cleanupObjectKey) {
      await deleteEncryptedRawEmailWithRetry(
        env.EMAIL_QUARANTINE_BUCKET,
        staged.data.cleanupObjectKey,
        staged.data.correlationId,
        dependencies
      )
      emit(dependencies, {
        event: 'email_ingestion_r2_delete',
        correlationId: staged.data.correlationId,
        status: 'deleted'
      })
    }
    return { status: 'duplicate', correlationId: staged.data.correlationId }
  }

  const authoritativeCorrelationId = staged.data.correlationId
  emit(dependencies, {
    event: 'email_ingestion_stage_reservation',
    correlationId: authoritativeCorrelationId,
    status: 'reserved'
  })
  const objectKey = staged.data.encryptedObjectKey
  const canonicalExtraction = extraction?.needsReview ? null : extraction
  const stagedManifest = EmailStagedManifestSchema.parse({
    schemaVersion: 1,
    ingestionId: staged.data.ingestionId,
    encryptedObjectKey: objectKey,
    provider: stage.provider,
    externalIdHash,
    messageIdHash,
    rawContentHashVersion: 1,
    rawContentHash
  })
  const encrypted = await encryptStagedEmail(
    raw,
    normalized.envelopeSender,
    env.EMAIL_QUARANTINE_ENCRYPTION_SECRET,
    stagedManifest
  )
  const putOptions = encryptedRawEmailPutOptions(
    expiresAt,
    authoritativeCorrelationId,
    stagedManifest
  )
  await putEncryptedRawEmailWithRetry(
    env.EMAIL_QUARANTINE_BUCKET,
    objectKey,
    encrypted,
    putOptions,
    authoritativeCorrelationId,
    dependencies
  )
  emit(dependencies, {
    event: 'email_ingestion_r2_write',
    correlationId: authoritativeCorrelationId,
    status: 'written'
  })
  const confirmationBody = JSON.stringify(EmailStageConfirmationSchema.parse({
    schemaVersion: 1,
    ingestionId: staged.data.ingestionId,
    correlationId: authoritativeCorrelationId,
    encryptedObjectKey: objectKey,
    rawContentHashVersion: 1,
    rawContentHash
  }))
  const confirmationResponse = await signedRequest(
    '/api/internal/leads/email-stage-confirm',
    confirmationBody,
    env,
    dependencies,
    authoritativeCorrelationId
  )
  if (!confirmationResponse.ok) {
    retryable(
      authoritativeCorrelationId,
      undefined,
      upstreamErrorClass(confirmationResponse.status)
    )
  }

  const envelope: EmailIngestEnvelope = EmailIngestEnvelopeSchema.parse({
    schemaVersion: 1,
    correlationId: authoritativeCorrelationId,
    ingestionId: staged.data.ingestionId,
    transport: 'cloudflare_email_routing',
    recipientToken,
    recipientAddressHash: sha256Hex(normalized.envelopeRecipient),
    envelopeSenderDomain,
    headerFromDomain,
    messageIdHash,
    externalIdHash,
    rawContentHashVersion: 1,
    rawContentHash,
    receivedAt,
    rawSize: normalized.rawSize,
    attachmentCount: normalized.attachments.length,
    extraction: canonicalExtraction,
    safeEvidence: evidence,
    quarantine: canonicalExtraction
      ? undefined
      : {
          reason: parserFailed ? 'Parser rejected message' : 'Extraction requires review',
          encryptedObjectKey: objectKey,
          expiresAt
        }
  })
  const ingestBody = JSON.stringify(envelope)
  const ingestResponse = await signedRequest(
    '/api/internal/leads/email-ingest',
    ingestBody,
    env,
    dependencies,
    authoritativeCorrelationId
  )
  if (!ingestResponse?.ok) return { status: 'failed', correlationId: authoritativeCorrelationId }
  const ingested = IngestResponseSchema.safeParse(await readBoundedJson(ingestResponse))
  if (!ingested.success) return { status: 'failed', correlationId: authoritativeCorrelationId }
  if (ingested.data.status === 'accepted' || ingested.data.status === 'duplicate') {
    await deleteEncryptedRawEmailWithRetry(
      env.EMAIL_QUARANTINE_BUCKET,
      objectKey,
      authoritativeCorrelationId,
      dependencies
    )
    emit(dependencies, {
      event: 'email_ingestion_r2_delete',
      correlationId: authoritativeCorrelationId,
      status: 'deleted'
    })
  }
  emit(dependencies, {
    event: ingested.data.status === 'quarantined'
      ? 'email_ingestion_quarantine'
      : 'email_ingestion_canonical',
    correlationId: authoritativeCorrelationId,
    provider: extraction?.provider ?? policy.expectedProvider ?? 'generic',
    parser: extraction?.parser ?? 'none',
    status: ingested.data.status,
    durationMs: dependencies.nowMs() - startedAt
  })
  return { status: ingested.data.status, correlationId: authoritativeCorrelationId }
}

export default {
  async email(message: ForwardableEmailMessage, env: Env, ctx: ExecutionContext): Promise<void> {
    const events: Record<string, unknown>[] = []
    const dependencies: EmailIntakeDependencies = {
      ...defaultDependencies,
      emit: (event) => {
        if (events.length < MAX_TELEMETRY_EVENTS) events.push(event)
      }
    }
    try {
      const outcome = await handleEmailMessage(message, env, dependencies)
      emitEmailIngestionEvent({
        event: outcome.status === 'quarantined'
          ? 'email_ingestion_quarantine'
          : 'email_ingestion_canonical',
        status: outcome.status,
        correlationId: 'correlationId' in outcome ? outcome.correlationId : undefined
      }, event => events.push(event))
      const correlationId = 'correlationId' in outcome ? outcome.correlationId : undefined
      const batch = authoritativeTelemetry(events, correlationId)
      console.log(JSON.stringify({ events: batch }))
      if (typeof ctx.waitUntil === 'function') {
        ctx.waitUntil(persistTransportTelemetry(batch, env, dependencies))
      }
    } catch (error) {
      emitEmailIngestionEvent({
        event: 'email_ingestion_failure',
        status: error instanceof RetryableEmailIntakeError ? 'retryable_error' : 'error',
        correlationId: error instanceof RetryableEmailIntakeError
          ? error.correlationId
          : crypto.randomUUID(),
        errorClass: error instanceof RetryableEmailIntakeError
          ? error.errorClass
          : 'unexpected'
      }, event => events.push(event))
      const correlationId = error instanceof RetryableEmailIntakeError
        ? error.correlationId
        : undefined
      const batch = authoritativeTelemetry(events, correlationId)
      console.log(JSON.stringify({ events: batch }))
      if (typeof ctx.waitUntil === 'function') {
        ctx.waitUntil(persistTransportTelemetry(batch, env, dependencies))
      }
      throw error
    }
  }
} satisfies ExportedHandler<Env>
