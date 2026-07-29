import { createHash } from 'node:crypto'
import type { H3Event } from 'h3'

import { runAfterResponse } from '~~/server/utils/asyncBackground'
import { recordEmailTransportEventBatch } from '~~/server/utils/leads/emailHealth'
import {
  rateCheck,
  type RateLimiterNamespace
} from '~~/server/utils/tracking/rate-limit'
import {
  verifyEmailIngestSignature,
  type EmailSignatureRequest
} from '~~/server/utils/leads/emailIngestion'

function failureBucketId(request: EmailSignatureRequest): string {
  const minute = Math.floor((request.nowMs ?? Date.now()) / 60_000)
  const hex = createHash('sha256').update(`email-signature:${minute}`).digest('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`
}

let scheduledFailureBucket: string | null = null

function withRuntimeSigningSecret(
  event: H3Event,
  request: EmailSignatureRequest
): EmailSignatureRequest {
  if (request.secret !== undefined) return request
  const runtimeSecret = (event.context as {
    cloudflare?: { env?: Record<string, unknown> }
  }).cloudflare?.env?.EMAIL_INGEST_HMAC_SECRET
  const secret = typeof runtimeSecret === 'string'
    ? runtimeSecret
    : process.env.EMAIL_INGEST_HMAC_SECRET
  return secret === undefined ? request : { ...request, secret }
}

async function shouldScheduleFailure(event: H3Event, batchId: string): Promise<boolean> {
  const limiter = (event.context as {
    cloudflare?: { env?: { RATE_LIMITER?: RateLimiterNamespace } }
  }).cloudflare?.env?.RATE_LIMITER
  if (limiter) {
    try {
      const verdict = await rateCheck(limiter, {
        writeKey: 'email-signature-telemetry',
        ipHash: null,
        keyLimit: 1,
        ipLimit: 1,
        windowMs: 60_000
      })
      return verdict.allowed
    } catch {
      // Fail closed for telemetry writes when the production gate is present.
      return false
    }
  }
  if (scheduledFailureBucket === batchId) return false
  scheduledFailureBucket = batchId
  return true
}

/**
 * Preserves the original authentication error while scheduling a bounded,
 * idempotent security counter after the response. All untrusted failures
 * collapse into one write per minute, regardless of attacker-controlled nonce.
 */
export async function verifyEmailIngestSignatureWithTelemetry(
  event: H3Event,
  request: EmailSignatureRequest
): Promise<void> {
  try {
    await verifyEmailIngestSignature(withRuntimeSigningSecret(event, request))
  } catch (error) {
    const statusCode = (error as { statusCode?: number }).statusCode
    if (statusCode === 401 || statusCode === 409) {
      const batchId = failureBucketId(request)
      // RATE_LIMITER DO is the production gate. One write per minute per
      // isolate plus the deterministic DB key is only the local/dev fallback.
      if (await shouldScheduleFailure(event, batchId)) {
        runAfterResponse(event, recordEmailTransportEventBatch({
          batchId,
          events: [{ eventClass: 'signature_failure' }]
        }), 'email-signature-telemetry')
      }
    }
    throw error
  }
}
