import { z } from 'zod'

import {
  EmailEndpointPolicySchema,
  EmailIngestEnvelopeSchema,
  EmailStageRequestSchema,
  EmailStageResponseSchema,
  type EmailEndpointPolicy,
  type EmailIngestEnvelope,
  type EmailStageRequest
} from '../../../shared/leads/email/contracts'
import { extractEmailLeadWithAi, needsAiExtractionFallback } from '../../../shared/leads/email/ai'
import { parseEmailLead, sha256Hex } from '../../../shared/leads/email/parser'
import { createWorkerEmailAiRuntime } from './aiRuntime'
import {
  deleteEncryptedRawEmail,
  encryptedRawEmailPutOptions,
  encryptRawEmail,
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
const encoder = new TextEncoder()

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
}

export type EmailIntakeOutcome =
  | { status: 'accepted' | 'duplicate' | 'quarantined' | 'failed' | 'in_progress', correlationId: string }
  | { status: 'rejected' }

export class RetryableEmailIntakeError extends Error {
  override readonly name = 'RetryableEmailIntakeError'

  constructor(
    readonly correlationId: string,
    cause?: unknown
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
  }
  finally {
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
  dependencies: EmailIntakeDependencies
): Promise<Response | null> {
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
    }
    catch {
      if (attempt === RETRY_DELAYS_MS.length) return null
    }
    if (attempt < RETRY_DELAYS_MS.length) await dependencies.sleep(RETRY_DELAYS_MS[attempt]!)
  }
  return null
}

function retryable(correlationId: string, cause?: unknown): never {
  throw new RetryableEmailIntakeError(correlationId, cause)
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
    }
    catch (error) {
      if (attempt === RETRY_DELAYS_MS.length) retryable(correlationId, error)
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
    }
    catch {
      if (attempt === RETRY_DELAYS_MS.length) retryable(correlationId)
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
  const recipientToken = extractRecipientToken(message.to)
  if (!recipientToken) return reject(message, 'Unknown lead intake recipient')
  if (await secretsAreEqual(env.EMAIL_INGEST_HMAC_SECRET, env.EMAIL_QUARANTINE_ENCRYPTION_SECRET)) {
    return { status: 'failed', correlationId: dependencies.randomUUID() }
  }

  const correlationId = dependencies.randomUUID()
  const receivedAt = new Date(dependencies.nowMs()).toISOString()
  const policyBody = JSON.stringify({ recipientToken })
  const policyResponse = await signedRequest(
    '/api/internal/leads/email-policy',
    policyBody,
    env,
    dependencies
  )
  if (!policyResponse) retryable(correlationId)
  if (!policyResponse.ok) {
    if (policyResponse.status === 404 || policyResponse.status === 409) {
      return reject(message, 'Lead intake policy denied')
    }
    retryable(correlationId)
  }
  let policyPayload: unknown
  try {
    policyPayload = await readBoundedJson(policyResponse)
  }
  catch (error) {
    retryable(correlationId, error)
  }
  const policyParsed = EmailEndpointPolicySchema.safeParse(policyPayload)
  if (!policyParsed.success) retryable(correlationId, policyParsed.error)
  const policy = policyParsed.data

  const envelopeSenderDomain = mailboxDomain(message.from)
  if (!senderAllowed(envelopeSenderDomain, policy)) return reject(message, 'Lead intake sender denied')
  if (message.rawSize > policy.maxRawBytes) return reject(message, 'Lead intake message exceeds size limit')

  let raw: Uint8Array
  try {
    raw = await readBoundedRawEmail(message.raw, message.rawSize, policy.maxRawBytes)
  }
  catch {
    return reject(message, 'Lead intake message is invalid')
  }

  let normalized
  try {
    normalized = await normalizeCloudflareEmail(message, raw, receivedAt)
  }
  catch {
    return reject(message, 'Lead intake message is invalid')
  }
  let extraction = parseEmailLead(normalized, policy)
  const messageIdHash = normalized.messageId ? sha256Hex(normalized.messageId) : null
  const canonicalExternalIdHash = extraction?.externalIdHash
    ?? messageIdHash
    ?? await sha256HexBytes(raw)
  if (policy.aiExtractionMode === 'fallback' && needsAiExtractionFallback(extraction)) {
    extraction = await extractEmailLeadWithAi(
      {
        email: normalized,
        canonicalExternalIdHash
      },
      extraction,
      createWorkerEmailAiRuntime(env.AI)
    )
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
    messageIdHash,
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
    dependencies
  )
  if (!stageResponse?.ok) retryable(correlationId)
  let stagePayload: unknown
  try {
    stagePayload = await readBoundedJson(stageResponse)
  }
  catch (error) {
    retryable(correlationId, error)
  }
  const staged = EmailStageResponseSchema.safeParse(stagePayload)
  if (!staged.success) retryable(correlationId, staged.error)
  if (staged.data.outcome === 'denied') {
    return reject(message, 'Lead intake stage denied')
  }
  if (staged.data.outcome === 'duplicate') {
    if (staged.data.cleanupObjectKey) {
      await deleteEncryptedRawEmailWithRetry(
        env.EMAIL_QUARANTINE_BUCKET,
        staged.data.cleanupObjectKey,
        staged.data.correlationId,
        dependencies
      )
    }
    return { status: 'duplicate', correlationId: staged.data.correlationId }
  }

  const authoritativeCorrelationId = staged.data.correlationId
  const objectKey = staged.data.encryptedObjectKey
  const canonicalExtraction = extraction?.needsReview ? null : extraction
  const encrypted = await encryptRawEmail(raw, env.EMAIL_QUARANTINE_ENCRYPTION_SECRET)
  const putOptions = encryptedRawEmailPutOptions(expiresAt, authoritativeCorrelationId)
  await putEncryptedRawEmailWithRetry(
    env.EMAIL_QUARANTINE_BUCKET,
    objectKey,
    encrypted,
    putOptions,
    authoritativeCorrelationId,
    dependencies
  )

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
    receivedAt,
    rawSize: normalized.rawSize,
    attachmentCount: normalized.attachments.length,
    extraction: canonicalExtraction,
    safeEvidence: evidence,
    quarantine: canonicalExtraction ? undefined : {
      reason: 'Extraction requires review',
      encryptedObjectKey: objectKey,
      expiresAt
    }
  })
  const ingestBody = JSON.stringify(envelope)
  const ingestResponse = await signedRequest(
    '/api/internal/leads/email-ingest',
    ingestBody,
    env,
    dependencies
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
  }
  return { status: ingested.data.status, correlationId: authoritativeCorrelationId }
}

export default {
  async email(message: ForwardableEmailMessage, env: Env, _ctx: ExecutionContext): Promise<void> {
    try {
      const outcome = await handleEmailMessage(message, env)
      console.log(JSON.stringify({
        event: 'email_lead_intake_outcome',
        status: outcome.status,
        correlationId: 'correlationId' in outcome ? outcome.correlationId : undefined
      }))
    }
    catch (error) {
      console.log(JSON.stringify({
        event: 'email_lead_intake_outcome',
        status: error instanceof RetryableEmailIntakeError ? 'retryable_error' : 'error',
        correlationId: error instanceof RetryableEmailIntakeError
          ? error.correlationId
          : crypto.randomUUID()
      }))
      throw error
    }
  }
} satisfies ExportedHandler<Env>
