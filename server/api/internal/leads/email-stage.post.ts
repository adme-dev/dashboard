import { createError, defineEventHandler, getRequestHeaders, readRawBody } from 'h3'
import { EmailStageRequestSchema } from '~~/shared/leads/email/contracts'
import {
  markEmailEndpointReceipt,
  reserveEmailIngestionStage
} from '~~/server/utils/leads/emailIngestion'
import { verifyEmailIngestSignatureWithTelemetry } from '~~/server/utils/leads/emailSignatureTelemetry'
import { emitEmailIngestionEvent } from '~~/shared/leads/email/telemetry'

export default defineEventHandler(async (event) => {
  const rawBody = await readRawBody(event, 'utf8')
  if (typeof rawBody !== 'string') throw createError({ statusCode: 400, statusMessage: 'invalid_email_stage_request' })
  await verifyEmailIngestSignatureWithTelemetry(event, { rawBody, headers: getRequestHeaders(event) })
  let body: unknown
  try {
    body = JSON.parse(rawBody)
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'invalid_email_stage_request' })
  }
  const parsed = EmailStageRequestSchema.safeParse(body)
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'invalid_email_stage_request' })
  const result = await reserveEmailIngestionStage(parsed.data)
  if (result.outcome !== 'denied') await markEmailEndpointReceipt(result.ingestionId)
  emitEmailIngestionEvent({
    event: result.outcome === 'duplicate'
      ? 'email_ingestion_transport_duplicate'
      : 'email_ingestion_stage_reservation',
    correlationId: result.outcome === 'denied' ? parsed.data.correlationId : result.correlationId,
    provider: parsed.data.provider,
    status: result.outcome,
    errorClass: result.outcome === 'denied' ? 'policy_denied' : 'none'
  })
  return result
})
