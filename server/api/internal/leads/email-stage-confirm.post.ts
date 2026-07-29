import { createError, defineEventHandler, getRequestHeaders, readRawBody } from 'h3'
import { EmailStageConfirmationSchema } from '~~/shared/leads/email/contracts'
import {
  confirmEmailIngestionStage,
  verifyEmailIngestSignature
} from '~~/server/utils/leads/emailIngestion'

export default defineEventHandler(async (event) => {
  const rawBody = await readRawBody(event, 'utf8')
  if (typeof rawBody !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'invalid_email_stage_confirmation' })
  }
  await verifyEmailIngestSignature({ rawBody, headers: getRequestHeaders(event) })
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
  return confirmEmailIngestionStage(parsed.data)
})
