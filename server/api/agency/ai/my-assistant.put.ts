/**
 * Save the caller's own co-pilot config ("My Assistant", command-center spec §4a Personalize tier).
 * PUT /api/agency/ai/my-assistant
 *
 * NARROWS only: disabledTools is applied by subtraction at run time (toolLoop), so this can never
 * grant a tool the user's role lacks. Self-scoped — a user can only edit their OWN config.
 */
import { requireAuth } from '~~/server/utils/auth'
import { saveAgentConfig, getAgentConfig } from '~~/server/utils/ai/agentConfig'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const body = await readBody<{ personaKey?: string | null, disabledTools?: unknown, memoryEnabled?: boolean }>(event)

  const disabledTools = Array.isArray(body?.disabledTools)
    ? body.disabledTools.filter((x): x is string => typeof x === 'string')
    : []

  await saveAgentConfig({
    userId: user.id,
    personaKey: typeof body?.personaKey === 'string' ? body.personaKey : null,
    disabledTools,
    memoryEnabled: body?.memoryEnabled !== false,
  })

  const config = await getAgentConfig(user.id)
  return {
    personaKey: config?.personaKey ?? null,
    disabledTools: config?.disabledTools ?? [],
    memoryEnabled: config?.memoryEnabled ?? true,
  }
})
