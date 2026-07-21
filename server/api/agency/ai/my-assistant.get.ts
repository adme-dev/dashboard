/**
 * Read the caller's own co-pilot config ("My Assistant", command-center spec §4a Personalize tier).
 * GET /api/agency/ai/my-assistant
 */
import { eventHandler, type H3Event } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { registry } from '~~/server/utils/ai/tools/index'
import {
  buildMyAssistantExplainability,
  type ExplainableAssistantTool
} from '~~/server/utils/ai/assistantExplainability'
import {
  resolvePersonalAssistantContext,
  type PersonalAssistantContext
} from '~~/server/utils/ai/personalAssistantContext'

interface MyAssistantGetDependencies {
  requireAuth: typeof requireAuth
  resolvePersonalAssistantContext: (input: {
    userId: string
    event?: H3Event
  }) => Promise<PersonalAssistantContext>
  buildMyAssistantExplainability: (
    context: PersonalAssistantContext,
    tools: ExplainableAssistantTool[]
  ) => ReturnType<typeof buildMyAssistantExplainability>
  tools: ExplainableAssistantTool[]
}

const defaultDependencies: MyAssistantGetDependencies = {
  requireAuth,
  resolvePersonalAssistantContext,
  buildMyAssistantExplainability,
  tools: registry
}

export function createMyAssistantGetHandler(
  dependencies: MyAssistantGetDependencies = defaultDependencies
) {
  return async (event: H3Event) => {
    const user = await dependencies.requireAuth(event)
    const context = await dependencies.resolvePersonalAssistantContext({ userId: user.id, event })
    return dependencies.buildMyAssistantExplainability(context, dependencies.tools)
  }
}

export default eventHandler(createMyAssistantGetHandler())
