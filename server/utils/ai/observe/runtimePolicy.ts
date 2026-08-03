import type { H3Event } from 'h3'

export interface ObserveAndLearnRuntimePolicy {
  enabled: boolean
}

export interface ObserveAndLearnRuntimePolicySources {
  runtimeConfig?: { aiObserveEnabled?: unknown }
  processEnv?: { AI_OBSERVE_ENABLED?: unknown }
}

function validatedBoolean(value: unknown): boolean | null {
  if (value === true || value === 'true') return true
  if (value === false || value === 'false') return false
  return null
}

function configuredPolicy(value: unknown): ObserveAndLearnRuntimePolicy {
  return { enabled: validatedBoolean(value) ?? false }
}

/**
 * Resolve the observe-and-learn gate once at request time. Cloudflare request bindings are the
 * deployed authority, followed by Nuxt private runtime config and then the process environment.
 * An explicitly present malformed value fails closed instead of falling through to a lower source.
 */
export function resolveObserveAndLearnRuntimePolicy(
  event?: H3Event,
  sources: ObserveAndLearnRuntimePolicySources = {}
): ObserveAndLearnRuntimePolicy {
  const cloudflareEnv = (event?.context as any)?.cloudflare?.env
  if (cloudflareEnv && Object.prototype.hasOwnProperty.call(cloudflareEnv, 'AI_OBSERVE_ENABLED')) {
    return configuredPolicy(cloudflareEnv.AI_OBSERVE_ENABLED)
  }

  let runtimeConfig = sources.runtimeConfig
  if (runtimeConfig === undefined) {
    try {
      runtimeConfig = useRuntimeConfig(event) as { aiObserveEnabled?: unknown }
    } catch {
      // Unit/non-Nuxt callers continue to the process fallback.
    }
  }
  if (runtimeConfig && Object.prototype.hasOwnProperty.call(runtimeConfig, 'aiObserveEnabled')) {
    return configuredPolicy(runtimeConfig.aiObserveEnabled)
  }

  const processEnv = sources.processEnv ?? process.env
  if (Object.prototype.hasOwnProperty.call(processEnv, 'AI_OBSERVE_ENABLED')) {
    return configuredPolicy(processEnv.AI_OBSERVE_ENABLED)
  }
  return { enabled: false }
}
