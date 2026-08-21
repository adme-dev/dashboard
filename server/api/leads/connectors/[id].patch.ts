import { z } from 'zod'
import { requireRole, requireWriteAccess } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { leadConnectorService } from '~~/server/utils/leads/connectorService'

const Body = z.strictObject({
  clientId: z.string().uuid(),
  expectedVersion: z.number().int().positive(),
  status: z.enum(['active', 'test', 'stale', 'error', 'disabled']).optional(),
  authority: z.enum(['canonical', 'candidate_only']).optional(),
  capabilities: z.array(z.enum(['push', 'poll', 'browser_correlation', 'backfill'])).max(4).optional(),
  approvedOrigins: z.array(z.string().url()).max(50).optional(),
  formReferences: z.array(z.string().trim().min(1).max(255)).max(500).optional(),
  reason: z.string().trim().min(1).max(1000)
})

export default defineEventHandler(async (event) => {
  await requireRole(event, PERMISSIONS.MEDIA_BUYING)
  await requireWriteAccess(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Connector ID required' })
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid connector update' })
  const { clientId, ...update } = parsed.data
  return { connector: await leadConnectorService.update(id, clientId, update) }
})
