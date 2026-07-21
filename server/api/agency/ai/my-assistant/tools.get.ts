/**
 * The caller's RBAC-available co-pilot tools, for the "My Assistant" disable toggles.
 * GET /api/agency/ai/my-assistant/tools
 *
 * Returns only tools allowed by the same fresh role, custom permissions, read-only state, and
 * governed catalog used at turn admission. The Personalize tier can narrow this set, never grant.
 */
import { eventHandler } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { registry } from '~~/server/utils/ai/tools/index'
import { buildMyAssistantExplainability } from '~~/server/utils/ai/assistantExplainability'
import { resolvePersonalAssistantContext } from '~~/server/utils/ai/personalAssistantContext'

export default eventHandler(async (event) => {
  const user = await requireAuth(event)
  const context = await resolvePersonalAssistantContext({ userId: user.id, event })
  const view = buildMyAssistantExplainability(context, registry)
  return {
    tools: view.tools,
    restrictions: view.restrictions,
    catalogMode: view.authority.catalogMode
  }
})
