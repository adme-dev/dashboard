import { createError, defineEventHandler, readBody } from 'h3'
import { z } from 'zod'
import { requireAuth, requireRole } from '~~/server/utils/auth'
import { getSelectedTenant } from '~~/server/utils/session'
import { getSocialBudgetControlConfig, saveSocialBudgetControlConfig } from '~~/server/utils/socialBudgetControlConfig'

const Body = z.object({
  liveBudgetChangesEnabled: z.boolean().optional(),
  metaBudgetWritesEnabled: z.boolean().optional(),
  googleBudgetWritesEnabled: z.boolean().optional(),
})

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  await requireRole(event, ['owner', 'admin'])
  const tenantId = await getSelectedTenant(event)
  if (!tenantId) throw createError({ statusCode: 400, statusMessage: 'No organization selected' })

  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid budget control settings' })

  const current = await getSocialBudgetControlConfig(tenantId)
  const config = { ...current, ...parsed.data }
  await saveSocialBudgetControlConfig(tenantId, config, user.id)

  return { ok: true, config }
})
