import { defineEventHandler, setHeader } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { resolvePersonalAssistantContext } from '~~/server/utils/ai/personalAssistantContext'
import { buildNativeChatTools } from '~~/server/utils/ai/nativeChatTools'
import { listRoleSkills, resolveRoleSkillActor } from '~~/server/utils/ai/roleSkills/eligibility'

const defaults = { auth: requireAuth, context: resolvePersonalAssistantContext, tools: buildNativeChatTools, list: listRoleSkills, actor: resolveRoleSkillActor, header: setHeader }
export function createRoleSkillsGetHandler(dependencies: Partial<typeof defaults> = {}) {
  const deps = { ...defaults, ...dependencies }
  return defineEventHandler(async (event) => {
    const user = await deps.auth(event)
    const context = await deps.context({ userId: user.id, event })
    const tools = await deps.tools({ userId: user.id, userRole: context.identity.role, event, source: 'chat' }, { authority: context.godModeAuthority, discovery: true })
    const actor = await deps.actor(event, user.id)
    deps.header(event, 'Cache-Control', 'private, no-store')
    return { skills: await deps.list({ context, tools, event }), canManage: !actor.readOnly && actor.permissionGroups.includes('ADMIN') }
  })
}
export default createRoleSkillsGetHandler()
