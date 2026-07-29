import { createError, defineEventHandler, getRequestHeaders, readRawBody } from 'h3'
import { EmailIngestEnvelopeSchema } from '~~/shared/leads/email/contracts'
import { acceptEmailEnvelope } from '~~/server/utils/leads/emailIngestion'
import { verifyEmailIngestSignatureWithTelemetry } from '~~/server/utils/leads/emailSignatureTelemetry'
import { emitEmailIngestionEvent } from '~~/shared/leads/email/telemetry'

export default defineEventHandler(async (event) => {
  const rawBody = await readRawBody(event, 'utf8')
  if (typeof rawBody !== 'string') throw createError({ statusCode: 400, statusMessage: 'invalid_email_ingest_envelope' })
  await verifyEmailIngestSignatureWithTelemetry(event, { rawBody, headers: getRequestHeaders(event) })
  let body: unknown
  try {
    body = JSON.parse(rawBody)
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'invalid_email_ingest_envelope' })
  }
  const parsed = EmailIngestEnvelopeSchema.safeParse(body)
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'invalid_email_ingest_envelope' })
  const startedAt = Date.now()
  const result = await acceptEmailEnvelope(event, parsed.data.ingestionId, parsed.data)
  emitEmailIngestionEvent({
    event: result.status === 'quarantined'
      ? 'email_ingestion_quarantine'
      : result.status === 'duplicate'
        ? 'email_ingestion_transport_duplicate'
        : 'email_ingestion_canonical',
    correlationId: parsed.data.correlationId,
    provider: parsed.data.extraction?.provider ?? 'generic',
    parser: parsed.data.extraction?.parser ?? 'none',
    status: result.status,
    durationMs: Date.now() - startedAt
  })
  if (parsed.data.extraction && parsed.data.extraction.needsReview) {
    emitEmailIngestionEvent({
      event: 'email_ingestion_ai',
      correlationId: parsed.data.correlationId,
      provider: parsed.data.extraction.provider,
      parser: parsed.data.extraction.parser,
      status: 'failed',
      errorClass: 'ai_schema_rejected'
    })
  }
  return result
})
