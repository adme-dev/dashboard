import type { H3Event } from 'h3'
import type {
  CrmEmailInboundQueueJob
} from '~~/server/utils/crm/emailInboundProcessingContracts'

const textEncoder = new TextEncoder()

interface QueueProducer {
  send(
    message: CrmEmailInboundQueueJob,
    options: { contentType: 'json' }
  ): Promise<void>
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes]
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')
}

export async function createCrmEmailInboundIdempotencyKey(
  routeTokenHash: string,
  providerMessageId: string
): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    textEncoder.encode(`${routeTokenHash}\n${providerMessageId}`)
  )
  return `crm-inbound:${bytesToHex(new Uint8Array(digest))}`
}

export async function enqueueCrmInboundEmail(
  event: H3Event,
  job: CrmEmailInboundQueueJob
): Promise<void> {
  const queue = (event.context as {
    cloudflare?: { env?: { CRM_EMAIL_INBOUND_QUEUE?: QueueProducer } }
  }).cloudflare?.env?.CRM_EMAIL_INBOUND_QUEUE

  if (!queue || typeof queue.send !== 'function') {
    throw new Error('CRM_EMAIL_INBOUND_QUEUE binding unavailable')
  }

  await queue.send(job, { contentType: 'json' })
}
