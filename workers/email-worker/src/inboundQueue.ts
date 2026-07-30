import {
  CrmEmailInboundProcessingRequestSchema,
  CrmEmailInboundQueueJobSchema
} from '../../../server/utils/crm/emailInboundProcessingContracts'
import type {
  CrmEmailInboundQueueJob
} from '../../../server/utils/crm/emailInboundProcessingContracts'
import type {
  FetchLike,
  InboundEmailWorkerEnv,
  ParsedInboundAddress,
  ParsedInboundEmail
} from './contracts'
import {
  classifyCrmInboundEmail
} from './inboundClassification'
import type {
  CrmInboundEmailSuppressionReason
} from './inboundClassification'
import { parseInboundEmail } from './mime'

const MAX_RAW_MIME_BYTES = 10 * 1024 * 1024

interface InboundQueueDependencies {
  fetch?: FetchLike
  parse?: (raw: ArrayBuffer) => Promise<ParsedInboundEmail>
}

export type ProcessCrmInboundQueueJobResult
  = | { status: 'processed', duplicate: boolean }
    | {
      status: 'suppressed'
      reason: CrmInboundEmailSuppressionReason
    }

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes]
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')
}

function safeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false
  let difference = 0
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index)
  }
  return difference === 0
}

function nullableText(value: string | null | undefined): string | null {
  const normalized = value?.trim()
  return normalized ? normalized : null
}

function normalizeAddress(
  value: ParsedInboundAddress
): { address: string, name: string | null } {
  return {
    address: value.address.trim().toLowerCase(),
    name: nullableText(value.name)
  }
}

function normalizeAddresses(
  values: ParsedInboundAddress[] | undefined
): Array<{ address: string, name: string | null }> {
  return (values ?? []).map(normalizeAddress)
}

function normalizeReferences(value: string | null | undefined): string[] {
  return value?.trim()
    ? value.trim().split(/\s+/).filter(Boolean)
    : []
}

function normalizeMimeEnvelope(email: ParsedInboundEmail) {
  const candidate = {
    from: email.from ? normalizeAddress(email.from) : null,
    to: normalizeAddresses(email.to),
    cc: normalizeAddresses(email.cc),
    replyTo: normalizeAddresses(email.replyTo),
    subject: nullableText(email.subject),
    text: email.text ?? null,
    internetMessageId: nullableText(email.messageId),
    inReplyTo: nullableText(email.inReplyTo),
    references: normalizeReferences(email.references)
  }
  const parsed = CrmEmailInboundProcessingRequestSchema.shape.email.safeParse(
    candidate
  )
  if (!parsed.success) {
    throw new Error('Invalid CRM email MIME envelope')
  }
  return parsed.data
}

export async function processCrmInboundQueueJob(
  rawJob: CrmEmailInboundQueueJob,
  env: InboundEmailWorkerEnv,
  dependencies: InboundQueueDependencies = {}
): Promise<ProcessCrmInboundQueueJobResult> {
  const bucket = env.CRM_EMAIL_BUCKET
  const workerSecret = env.CRM_EMAIL_WORKER_SECRET?.trim()
  const apiUrl = env.API_URL?.trim()
  if (
    env.CRM_EMAIL_INBOUND_ENABLED !== 'true'
    || !workerSecret
    || !apiUrl
    || !bucket
    || typeof bucket.get !== 'function'
  ) {
    throw new Error('CRM email inbound Queue is not configured')
  }

  const jobResult = CrmEmailInboundQueueJobSchema.safeParse(rawJob)
  if (!jobResult.success) {
    throw new Error('Invalid CRM email inbound Queue job')
  }
  const job = jobResult.data

  const object = await bucket.get(job.rawMimeR2Key)
  if (!object) {
    throw new Error('CRM email raw MIME object is unavailable')
  }
  if (object.size < 1 || object.size > MAX_RAW_MIME_BYTES) {
    throw new Error('CRM email raw MIME object has invalid size')
  }

  const raw = await object.arrayBuffer()
  if (raw.byteLength !== object.size) {
    throw new Error('CRM email raw MIME object has invalid size')
  }
  const digest = await crypto.subtle.digest('SHA-256', raw)
  const checksum = bytesToHex(new Uint8Array(digest))
  if (!safeEqual(checksum, job.rawMimeSha256)) {
    throw new Error('CRM email raw MIME checksum mismatch')
  }

  const parse = dependencies.parse ?? parseInboundEmail
  const parsedEmail = await parse(raw)
  const classification = classifyCrmInboundEmail(parsedEmail)
  if (classification.kind === 'suppressed') {
    await bucket.delete([
      job.rawMimeR2Key,
      ...job.attachments.map(attachment => attachment.r2ObjectKey)
    ])
    return {
      status: 'suppressed',
      reason: classification.reason
    }
  }
  const email = normalizeMimeEnvelope(parsedEmail)
  const request = CrmEmailInboundProcessingRequestSchema.parse({ job, email })
  const fetchImpl = dependencies.fetch ?? fetch
  const response = await fetchImpl(
    `${apiUrl.replace(/\/+$/, '')}/api/internal/crm-email/process-inbound`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-crm-email-secret': workerSecret
      },
      body: JSON.stringify(request)
    }
  )
  if (!response.ok) {
    throw new Error(`CRM email inbound processing failed: ${response.status}`)
  }

  const result = await response.json() as {
    accepted?: unknown
    duplicate?: unknown
  }
  if (result.accepted !== true || typeof result.duplicate !== 'boolean') {
    throw new Error('Invalid CRM email inbound processing response')
  }
  return { status: 'processed', duplicate: result.duplicate }
}
