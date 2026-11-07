import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'
import { createRoleSkillAdminHandlers } from '~~/server/utils/ai/roleSkills/admin'

export default defineEventHandler(async (event) => {
  const key = getRouterParam(event, 'key')
  if (!key) throw createError({ statusCode: 400, statusMessage: 'Workflow key required' })
  return createRoleSkillAdminHandlers().saveDraft(event, key, await readBody(event))
})
