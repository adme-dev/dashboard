import { z } from 'zod'

import { recordEmailTransportEventBatch } from '~~/server/utils/leads/emailHealth'
import { verifyEmailIngestSignatureWithTelemetry } from '~~/server/utils/leads/emailSignatureTelemetry'

const EventSchema = z.object({
  eventClass: z.enum([
    'pre_policy',
    'unknown_recipient',
    'signature_failure',
    'policy_denied',
    'r2_write_failure',
    'r2_delete_failure',
    'ai_schema_rejection'
  ]),
  correlationId: z.string().uuid().nullable().optional()
}).strict()

const BatchSchema = z.object({
  schemaVersion: z.literal(1),
  batchId: z.string().uuid(),
  events: z.array(EventSchema).min(1).max(32)
}).strict()

export default defineEventHandler(async (event) => {
  const rawBody = await readRawBody(event, false)
  if (typeof rawBody !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'invalid_email_telemetry_batch' })
  }
  await verifyEmailIngestSignatureWithTelemetry(event, { rawBody, headers: getRequestHeaders(event) })
  let body: unknown
  try {
    body = JSON.parse(rawBody)
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'invalid_email_telemetry_batch' })
  }
  const parsed = BatchSchema.safeParse(body)
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'invalid_email_telemetry_batch' })
  }
  const inserted = await recordEmailTransportEventBatch({
    batchId: parsed.data.batchId,
    events: parsed.data.events
  })
  return { schemaVersion: 1, status: 'recorded', inserted }
})
