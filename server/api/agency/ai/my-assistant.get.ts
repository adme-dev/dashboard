/**
 * Read the caller's own co-pilot config ("My Assistant", command-center spec §4a Personalize tier).
 * GET /api/agency/ai/my-assistant
 */
import { requireAuth } from '~~/server/utils/auth'
import { getAgentConfig } from '~~/server/utils/ai/agentConfig'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const config = await getAgentConfig(user.id)
  return {
    personaKey: config?.personaKey ?? null,
    disabledTools: config?.disabledTools ?? [],
    memoryEnabled: config?.memoryEnabled ?? true,
  }
})
