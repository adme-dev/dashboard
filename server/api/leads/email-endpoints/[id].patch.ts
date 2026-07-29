import { z } from 'zod'
import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { toSafeEmailEndpoint, updateEmailEndpoint } from '~~/server/utils/leads/emailEndpoint'

const Body = z.object({
  label: z.string().min(1).max(128).optional(),
  address_prefix: z.string().min(1).max(128).optional(),
  expected_provider: z.string().max(64).nullable().optional(),
  parser_mode: z.enum(['auto', 'adf', 'generic']).optional(),
  ai_extraction_mode: z.enum(['disabled', 'fallback']).optional(),
  allowed_sender_domains: z.array(z.string()).max(100).optional(),
  expected_max_silence_hours: z.number().int().nullable().optional(),
  first_response_sla_minutes: z.number().int().nullable().optional(),
  form_name: z.string().min(1).max(255).optional(),
  enabled: z.boolean().optional(),
  retire: z.literal(true).optional()
}).strict()

export default defineEventHandler(async (event) => {
  if ((event.context as { clientPortalUser?: unknown }).clientPortalUser) throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  const actor = await requireRole(event, PERMISSIONS.MEDIA_BUYING)
  const id = z.string().uuid().parse(getRouterParam(event, 'id'))
  const body = Body.parse(await readBody(event))
  const endpoint = await updateEmailEndpoint(id, {
    label: body.label, addressPrefix: body.address_prefix, expectedProvider: body.expected_provider,
    parserMode: body.parser_mode, aiExtractionMode: body.ai_extraction_mode,
    allowedSenderDomains: body.allowed_sender_domains,
    expectedMaxSilenceHours: body.expected_max_silence_hours,
    firstResponseSlaMinutes: body.first_response_sla_minutes, formName: body.form_name,
    enabled: body.enabled, retire: body.retire
  }, actor.id)
  return { endpoint: toSafeEmailEndpoint(endpoint) }
})
