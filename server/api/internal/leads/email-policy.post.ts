import { createError, defineEventHandler, getRequestHeaders } from 'h3'
import { z } from 'zod'
import { resolveEmailEndpointPolicy } from '~~/server/utils/leads/emailIngestion'
import {
  EMAIL_INTERNAL_JSON_LIMITS,
  readBoundedEmailInternalJson
} from '~~/server/utils/leads/emailInternalBody'
import { verifyEmailIngestSignatureWithTelemetry } from '~~/server/utils/leads/emailSignatureTelemetry'
import { emitEmailIngestionEvent } from '~~/shared/leads/email/telemetry'

const PolicyRequestSchema = z.object({
  recipientToken: z.string().regex(/^[0123456789abcdefghjkmnpqrstvwxyz]{10}$/)
}).strict()

export default defineEventHandler(async (event) => {
  const rawBody = await readBoundedEmailInternalJson(
    event,
    EMAIL_INTERNAL_JSON_LIMITS.policy,
    'invalid_email_policy_request'
  )
  await verifyEmailIngestSignatureWithTelemetry(event, { rawBody, headers: getRequestHeaders(event) })
  let body: unknown
  try {
    body = JSON.parse(rawBody)
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'invalid_email_policy_request' })
  }
  const parsed = PolicyRequestSchema.safeParse(body)
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'invalid_email_policy_request' })
  // This policy is intentionally minimal: no endpoint, tenant, form, or token is returned.
  const policy = await resolveEmailEndpointPolicy(parsed.data)
  emitEmailIngestionEvent({ event: 'email_ingestion_policy', status: 'allowed' })
  return policy
})
