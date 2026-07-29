import { createError, defineEventHandler, getRequestHeaders, readRawBody } from 'h3'
import { EmailStageConfirmationSchema } from '~~/shared/leads/email/contracts'
import {
  confirmEmailIngestionStage
} from '~~/server/utils/leads/emailIngestion'
import { verifyEmailIngestSignatureWithTelemetry } from '~~/server/utils/leads/emailSignatureTelemetry'
import { emitEmailIngestionEvent } from '~~/shared/leads/email/telemetry'

export default defineEventHandler(async (event) => {
  const rawBody = await readRawBody(event, 'utf8')
  if (typeof rawBody !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'invalid_email_stage_confirmation' })
  }
  await verifyEmailIngestSignatureWithTelemetry(event, { rawBody, headers: getRequestHeaders(event) })
  let body: unknown
  try {
    body = JSON.parse(rawBody)
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'invalid_email_stage_confirmation' })
  }
  const parsed = EmailStageConfirmationSchema.safeParse(body)
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'invalid_email_stage_confirmation' })
  }
  const result = await confirmEmailIngestionStage(parsed.data)
  emitEmailIngestionEvent({
    event: 'email_ingestion_r2_write',
    correlationId: parsed.data.correlationId,
    status: 'written'
  })
  return result
})
