import type { H3Event } from 'h3'
import { resolveAssistantRuntimeFlag } from '../assistantRuntime'

export interface ObserveAndLearnRuntimePolicy {
  enabled: boolean
}

export interface ObserveAndLearnRuntimePolicySources {
  runtimeConfig?: { aiObserveEnabled?: unknown }
  processEnv?: { AI_OBSERVE_ENABLED?: unknown }
}

/**
 * Resolve the observe-and-learn gate once at request time through the shared assistant runtime
 * resolver: request binding `AI_OBSERVE_ENABLED`, then compact `AI_ASSISTANT_CONFIG` ("observe"),
 * then Nuxt private runtime config, then the process environment. A present malformed value fails
 * closed instead of falling through to a lower source.
 */
export function resolveObserveAndLearnRuntimePolicy(
  event?: H3Event,
  sources: ObserveAndLearnRuntimePolicySources = {}
): ObserveAndLearnRuntimePolicy {
  const bindings = (event?.context as { cloudflare?: { env?: Record<string, unknown> } } | undefined)?.cloudflare?.env
  let runtimeConfig = sources.runtimeConfig as Record<string, unknown> | undefined
  if (runtimeConfig === undefined) {
    try {
      runtimeConfig = useRuntimeConfig(event) as unknown as Record<string, unknown>
    } catch {
      // Unit/non-Nuxt callers continue to the process fallback.
    }
  }
  const processEnv = (sources.processEnv ?? process.env) as Record<string, unknown>
  return { enabled: resolveAssistantRuntimeFlag('observe', event, { bindings, runtimeConfig, processEnv }).enabled }
}
