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
import { parseEmailLead, sha256Hex } from '../../../shared/leads/email/parser'
import {
  deleteEncryptedRawEmail,
  secretsAreEqual,
  storeEncryptedRawEmail
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
  if (!policyResponse) return { status: 'failed', correlationId }
  if (!policyResponse.ok) return reject(message, 'Lead intake policy denied')
  const policyParsed = EmailEndpointPolicySchema.safeParse(await readBoundedJson(policyResponse))
  if (!policyParsed.success) return reject(message, 'Lead intake policy denied')
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
  const extraction = parseEmailLead(normalized, policy)
  const messageIdHash = normalized.messageId ? sha256Hex(normalized.messageId) : null
  const externalIdHash = extraction?.externalIdHash ?? messageIdHash ?? await sha256HexBytes(raw)
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
  if (!stageResponse?.ok) return { status: 'failed', correlationId }
  const staged = EmailStageResponseSchema.safeParse(await readBoundedJson(stageResponse))
  if (!staged.success) return { status: 'failed', correlationId }
  if (staged.data.outcome === 'duplicate') return { status: 'duplicate', correlationId }

  const objectKey = staged.data.encryptedObjectKey
  await storeEncryptedRawEmail(
    env.EMAIL_QUARANTINE_BUCKET,
    objectKey,
    raw,
    env.EMAIL_QUARANTINE_ENCRYPTION_SECRET,
    expiresAt
  )

  const envelope: EmailIngestEnvelope = EmailIngestEnvelopeSchema.parse({
    schemaVersion: 1,
    correlationId,
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
    extraction,
    safeEvidence: evidence,
    quarantine: extraction ? undefined : {
      reason: 'No deterministic customer contact extracted',
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
  if (!ingestResponse?.ok) return { status: 'failed', correlationId }
  const ingested = IngestResponseSchema.safeParse(await readBoundedJson(ingestResponse))
  if (!ingested.success) return { status: 'failed', correlationId }
  if (ingested.data.status === 'accepted' || ingested.data.status === 'duplicate') {
    await deleteEncryptedRawEmail(env.EMAIL_QUARANTINE_BUCKET, objectKey)
  }
  return { status: ingested.data.status, correlationId }
}

export default {
  async email(message: ForwardableEmailMessage, env: Env, _ctx: ExecutionContext): Promise<void> {
    let outcome: EmailIntakeOutcome
    try {
      outcome = await handleEmailMessage(message, env)
    }
    catch {
      outcome = { status: 'failed', correlationId: crypto.randomUUID() }
    }
    console.log(JSON.stringify({
      event: 'email_lead_intake_outcome',
      status: outcome.status,
      correlationId: 'correlationId' in outcome ? outcome.correlationId : undefined
    }))
  }
} satisfies ExportedHandler<Env>
