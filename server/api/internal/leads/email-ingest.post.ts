import { createError, defineEventHandler, getRequestHeaders, readRawBody } from 'h3'
import { EmailIngestEnvelopeSchema } from '~~/shared/leads/email/contracts'
import { acceptEmailEnvelope, verifyEmailIngestSignature } from '~~/server/utils/leads/emailIngestion'

export default defineEventHandler(async (event) => {
  const rawBody = await readRawBody(event, 'utf8')
  if (typeof rawBody !== 'string') throw createError({ statusCode: 400, statusMessage: 'invalid_email_ingest_envelope' })
  await verifyEmailIngestSignature({ rawBody, headers: getRequestHeaders(event) })
  let body: unknown
  try { body = JSON.parse(rawBody) } catch { throw createError({ statusCode: 400, statusMessage: 'invalid_email_ingest_envelope' }) }
  const parsed = EmailIngestEnvelopeSchema.safeParse(body)
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'invalid_email_ingest_envelope' })
  return acceptEmailEnvelope(event, parsed.data.ingestionId, parsed.data)
})
