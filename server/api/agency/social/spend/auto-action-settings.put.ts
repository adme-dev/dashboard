import { createError, defineEventHandler, readBody } from 'h3'
import { z } from 'zod'
import { requireAuth, requireRole } from '~~/server/utils/auth'
import { getSelectedTenant } from '~~/server/utils/session'
import { getSpendAutoActionPolicy, saveSpendAutoActionPolicy } from '~~/server/utils/spendAutoActionConfig'

const Mode = z.enum(['off', 'notify', 'propose'])
const Body = z.object({
  enabled: z.boolean().optional(),
  perSeverity: z.object({ critical: Mode.optional(), warning: Mode.optional(), info: Mode.optional() }).optional(),
})

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  await requireRole(event, ['owner', 'admin'])
  const tenantId = await getSelectedTenant(event)
  if (!tenantId) throw createError({ statusCode: 400, statusMessage: 'No organization selected' })
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid auto-action settings' })
  const current = await getSpendAutoActionPolicy(tenantId)
  const config = {
    ...current,
    ...parsed.data,
    perSeverity: { ...current.perSeverity, ...(parsed.data.perSeverity ?? {}) },
  }
  await saveSpendAutoActionPolicy(tenantId, config, user.id)
  return { ok: true, config }
})
