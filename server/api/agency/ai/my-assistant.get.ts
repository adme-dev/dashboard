import { buildNativeSupplementalTools } from '~~/server/utils/ai/nativeChatTools'
import { resolveChatRuntime } from '~~/server/utils/ai/chatRuntime'
import { isActiveGodModeAuthority } from '~~/server/utils/godMode/authority'
import { discoverNativeMarketingTools } from '~~/server/utils/ai/marketing/nativeTools'
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
import {
  resolveServerCatalogRuntimePolicy,
  type CatalogRuntimePolicy
} from '~~/server/utils/ai/governance/catalogComposition'
import { resolveObserveAndLearnRuntimePolicy } from '~~/server/utils/ai/observe/runtimePolicy'

export interface MyAssistantGetDependencies {
  requireAuth: typeof requireAuth
  resolvePersonalAssistantContext: (input: {
    userId: string
    event?: H3Event
    runtimePolicy?: CatalogRuntimePolicy
    observedMemoryEnabled?: boolean
  }) => Promise<PersonalAssistantContext>
  buildMyAssistantExplainability: (
    context: PersonalAssistantContext,
    tools: ExplainableAssistantTool[]
  ) => ReturnType<typeof buildMyAssistantExplainability>
  getRuntimePolicy(event: H3Event): CatalogRuntimePolicy
  getObservedMemoryEnabled(event: H3Event): boolean
  tools: ExplainableAssistantTool[]
  discoverMarketingTools: typeof discoverNativeMarketingTools
  resolveChatRuntime: typeof resolveChatRuntime
  discoverSupplementalTools: typeof buildNativeSupplementalTools
}

const defaultDependencies: MyAssistantGetDependencies = {
  requireAuth,
  resolvePersonalAssistantContext,
  buildMyAssistantExplainability,
  getRuntimePolicy(event) {
    return resolveServerCatalogRuntimePolicy(event, useRuntimeConfig(event))
  },
  getObservedMemoryEnabled(event) {
    return resolveObserveAndLearnRuntimePolicy(event).enabled
  },
  tools: registry,
  discoverMarketingTools: discoverNativeMarketingTools,
  resolveChatRuntime,
  discoverSupplementalTools: buildNativeSupplementalTools
}

export function createMyAssistantGetHandler(
  overrides: Partial<MyAssistantGetDependencies> = {}
) {
  const dependencies: MyAssistantGetDependencies = { ...defaultDependencies, ...overrides }
  return async (event: H3Event) => {
    const user = await dependencies.requireAuth(event)
    const context = await dependencies.resolvePersonalAssistantContext({
      userId: user.id,
      event,
      runtimePolicy: dependencies.getRuntimePolicy(event),
      observedMemoryEnabled: dependencies.getObservedMemoryEnabled(event)
    })
    const marketingTools = isActiveGodModeAuthority(context.godModeAuthority, user.id)
      ? []
      : await dependencies.discoverMarketingTools({
          userId: user.id, userRole: context.identity.role, source: 'chat', event
        })
    const supplemental = await dependencies.discoverSupplementalTools({ userId: user.id, userRole: context.identity.role, source: 'chat', event })
    return { ...dependencies.buildMyAssistantExplainability(context, [...dependencies.tools, ...marketingTools, ...supplemental]),
      chatRuntime: dependencies.resolveChatRuntime(event) }
  }
}

export default eventHandler(createMyAssistantGetHandler())
