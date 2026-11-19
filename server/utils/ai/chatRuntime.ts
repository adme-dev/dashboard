import type { H3Event } from 'h3'
import { resolveAssistantRuntimeFlag, type AssistantRuntimeSource } from './assistantRuntime'

/**
 * Whether the governed tool loop is on for this request. Delegates to the shared assistant runtime
 * resolver so `AI_TOOLS_ENABLED` and the compact `AI_ASSISTANT_CONFIG` ("tools") follow one precedence.
 */
export function resolveChatRuntime(event?: H3Event, config?: { aiToolsEnabled?: unknown }): {
  toolsEnabled: boolean
  source: AssistantRuntimeSource
} {
  const bindings = (event?.context as { cloudflare?: { env?: Record<string, unknown> } } | undefined)?.cloudflare?.env
  let runtimeConfig = config as Record<string, unknown> | undefined
  if (!runtimeConfig) {
    try {
      runtimeConfig = useRuntimeConfig(event) as unknown as Record<string, unknown>
    } catch { /* Non-Nuxt callers use process below. */ }
  }
  const resolved = resolveAssistantRuntimeFlag('tools', event, {
    bindings,
    runtimeConfig,
    processEnv: process.env as Record<string, unknown>
  })
  return { toolsEnabled: resolved.enabled, source: resolved.source }
}
