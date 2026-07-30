import {
  CrmEmailInboundProcessingRequestSchema,
  CrmEmailInboundQueueJobSchema,
  CrmEmailRetainedArtifactJobSchema
} from '../../../server/utils/crm/emailInboundProcessingContracts'
import type {
  CrmEmailInboundProcessingRequest,
  CrmEmailInboundQueueJob,
  CrmEmailRetainedArtifactJob
} from '../../../server/utils/crm/emailInboundProcessingContracts'
import type {
  CrmInboundEmailProcessorStage,
  ProcessCrmInboundEmailResult
} from '../../../server/utils/crm/emailInboundProcessor'
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

export type CrmInboundQueueProcessingStage
  = | 'configuration'
    | 'validate_job'
    | 'resolve_route'
    | 'read_artifact'
    | 'verify_artifact'
    | 'parse_mime'
    | 'classify_automation'
    | 'canonical_process'
    | `canonical_${CrmInboundEmailProcessorStage}`
    | 'cleanup_artifacts'

interface InboundQueueDependencies {
  fetch?: FetchLike
  parse?: (raw: ArrayBuffer) => Promise<ParsedInboundEmail>
  process?: (
    request: CrmEmailInboundProcessingRequest
  ) => Promise<ProcessCrmInboundEmailResult>
  resolveRoute?: (input: {
    routeKind: CrmEmailRetainedArtifactJob['routeKind']
    routeToken: string
    recipientDomain: string
  }) => Promise<{
    id: string
    clientId: string
    conversationId: string | null
    routeKind: CrmEmailInboundQueueJob['routeKind']
    routeTokenHash: string
  } | null>
  createIdempotencyKey?: (
    routeTokenHash: string,
    providerMessageId: string
  ) => Promise<string>
  onStage?: (stage: CrmInboundQueueProcessingStage) => void
}

export type ProcessCrmInboundQueueJobResult
  = | { status: 'processed', duplicate: boolean }
    | { status: 'route_unavailable' }
    | {
      status: 'suppressed'
      reason: CrmInboundEmailSuppressionReason
    }

function retainedArtifactKeys(
  job: Pick<CrmEmailRetainedArtifactJob, 'rawMimeR2Key' | 'attachments'>
): string[] {
  return [
    job.rawMimeR2Key,
    ...job.attachments.map(attachment => attachment.r2ObjectKey)
  ]
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
  rawJob: CrmEmailInboundQueueJob | CrmEmailRetainedArtifactJob,
  env: InboundEmailWorkerEnv,
  dependencies: InboundQueueDependencies = {}
): Promise<ProcessCrmInboundQueueJobResult> {
  dependencies.onStage?.('configuration')
  const bucket = env.CRM_EMAIL_BUCKET
  if (
    env.CRM_EMAIL_INBOUND_ENABLED !== 'true'
    || !bucket
    || typeof bucket.get !== 'function'
    || (!dependencies.process && (!env.API_URL || !env.CRM_EMAIL_WORKER_SECRET))
  ) {
    throw new Error('CRM email inbound Queue is not configured')
  }

  dependencies.onStage?.('validate_job')
  const resolvedJob = CrmEmailInboundQueueJobSchema.safeParse(rawJob)
  let job: CrmEmailInboundQueueJob
  if (resolvedJob.success) {
    job = resolvedJob.data
  } else {
    const retainedJob = CrmEmailRetainedArtifactJobSchema.safeParse(rawJob)
    if (
      !retainedJob.success
      || !dependencies.resolveRoute
      || !dependencies.createIdempotencyKey
    ) {
      throw new Error('Invalid CRM email inbound Queue job')
    }
    const retained = retainedJob.data
    dependencies.onStage?.('resolve_route')
    const route = await dependencies.resolveRoute({
      routeKind: retained.routeKind,
      routeToken: retained.routeToken,
      recipientDomain: retained.recipientDomain
    })
    if (!route || route.routeKind !== retained.routeKind) {
      dependencies.onStage?.('cleanup_artifacts')
      await bucket.delete(retainedArtifactKeys(retained))
      return { status: 'route_unavailable' }
    }
    job = CrmEmailInboundQueueJobSchema.parse({
      version: 1,
      type: 'crm.email.inbound',
      idempotencyKey: await dependencies.createIdempotencyKey(
        route.routeTokenHash,
        retained.providerMessageId
      ),
      routeId: route.id,
      clientId: route.clientId,
      conversationId: route.conversationId,
      routeKind: route.routeKind,
      provider: retained.provider,
      providerMessageId: retained.providerMessageId,
      rawMimeR2Key: retained.rawMimeR2Key,
      rawMimeSha256: retained.rawMimeSha256,
      rawMimeExpiresAt: retained.rawMimeExpiresAt,
      attachments: retained.attachments,
      receivedAt: retained.receivedAt
    })
  }

  dependencies.onStage?.('read_artifact')
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
  dependencies.onStage?.('verify_artifact')
  const digest = await crypto.subtle.digest('SHA-256', raw)
  const checksum = bytesToHex(new Uint8Array(digest))
  if (!safeEqual(checksum, job.rawMimeSha256)) {
    throw new Error('CRM email raw MIME checksum mismatch')
  }

  dependencies.onStage?.('parse_mime')
  const parse = dependencies.parse ?? parseInboundEmail
  const parsedEmail = await parse(raw)
  dependencies.onStage?.('classify_automation')
  const classification = classifyCrmInboundEmail(parsedEmail)
  if (classification.kind === 'suppressed') {
    dependencies.onStage?.('cleanup_artifacts')
    await bucket.delete(retainedArtifactKeys(job))
    return {
      status: 'suppressed',
      reason: classification.reason
    }
  }
  const email = normalizeMimeEnvelope(parsedEmail)
  const request = CrmEmailInboundProcessingRequestSchema.parse({ job, email })
  dependencies.onStage?.('canonical_process')
  let result: ProcessCrmInboundEmailResult
  if (dependencies.process) {
    result = await dependencies.process(request)
  } else {
    // Kept as a compatibility seam for existing unit tests and local callers.
    // The deployed Worker always supplies `process`, so production never uses
    // the Worker-to-Pages handoff that the direct Queue design replaces.
    if (!dependencies.fetch || !env.API_URL || !env.CRM_EMAIL_WORKER_SECRET) {
      throw new Error('CRM email inbound processing is not configured')
    }
    const response = await dependencies.fetch(
      `${env.API_URL.replace(/\/$/, '')}/api/internal/crm-email/inbound`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-crm-email-secret': env.CRM_EMAIL_WORKER_SECRET
        },
        body: JSON.stringify(request)
      }
    )
    if (!response.ok) {
      throw new Error(`CRM email inbound processing failed: ${response.status}`)
    }
    const body = await response.json() as { duplicate?: boolean }
    result = { status: body.duplicate ? 'duplicate' : 'created' }
  }
  if (result.status === 'route_unavailable') {
    dependencies.onStage?.('cleanup_artifacts')
    await bucket.delete(retainedArtifactKeys(job))
    return { status: 'route_unavailable' }
  }
  if (result.status === 'duplicate') {
    dependencies.onStage?.('cleanup_artifacts')
    await bucket.delete(retainedArtifactKeys(job))
  }
  return { status: 'processed', duplicate: result.status === 'duplicate' }
}
