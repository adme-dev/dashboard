import { z } from 'zod'
import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { createEmailEndpoint, toSafeEmailEndpoint } from '~~/server/utils/leads/emailEndpoint'

const Body = z.object({
  client_id: z.string().uuid(),
  label: z.string().min(1).max(128),
  address_prefix: z.string().min(1).max(128).optional(),
  expected_provider: z.string().max(64).nullable().optional(),
  parser_mode: z.enum(['auto', 'adf', 'generic']).optional(),
  ai_extraction_mode: z.enum(['disabled', 'fallback']).optional(),
  allowed_sender_domains: z.array(z.string()).max(100).optional(),
  expected_max_silence_hours: z.number().int().nullable().optional(),
  first_response_sla_minutes: z.number().int().nullable().optional(),
  form_name: z.string().min(1).max(255),
  routing_preset: z.enum(['portal', 'portal_notification', 'assign_user']).nullable().optional(),
  notification_email: z.string().email().optional(),
  assigned_user_id: z.string().uuid().optional()
}).strict()

export default defineEventHandler(async (event) => {
  if ((event.context as { clientPortalUser?: unknown }).clientPortalUser) throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  const actor = await requireRole(event, PERMISSIONS.MEDIA_BUYING)
  const body = Body.parse(await readBody(event))
  const endpoint = await createEmailEndpoint({
    clientId: body.client_id, label: body.label, addressPrefix: body.address_prefix,
    expectedProvider: body.expected_provider, parserMode: body.parser_mode,
    aiExtractionMode: body.ai_extraction_mode, allowedSenderDomains: body.allowed_sender_domains,
    expectedMaxSilenceHours: body.expected_max_silence_hours,
    firstResponseSlaMinutes: body.first_response_sla_minutes, formName: body.form_name,
    routingPreset: body.routing_preset, notificationEmail: body.notification_email,
    assignedUserId: body.assigned_user_id
  }, actor.id)
  return { endpoint: toSafeEmailEndpoint(endpoint) }
})
