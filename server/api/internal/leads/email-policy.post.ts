import { createError, defineEventHandler, getRequestHeaders, readRawBody } from 'h3'
import { z } from 'zod'
import { resolveEmailEndpointPolicy, verifyEmailIngestSignature } from '~~/server/utils/leads/emailIngestion'

const PolicyRequestSchema = z.object({
  recipientToken: z.string().regex(/^[0123456789abcdefghjkmnpqrstvwxyz]{10}$/)
}).strict()

export default defineEventHandler(async (event) => {
  const rawBody = await readRawBody(event, 'utf8')
  if (typeof rawBody !== 'string') throw createError({ statusCode: 400, statusMessage: 'invalid_email_policy_request' })
  await verifyEmailIngestSignature({ rawBody, headers: getRequestHeaders(event) })
  let body: unknown
  try { body = JSON.parse(rawBody) } catch { throw createError({ statusCode: 400, statusMessage: 'invalid_email_policy_request' }) }
  const parsed = PolicyRequestSchema.safeParse(body)
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'invalid_email_policy_request' })
  // This policy is intentionally minimal: no endpoint, tenant, form, or token is returned.
  return resolveEmailEndpointPolicy(parsed.data)
})
