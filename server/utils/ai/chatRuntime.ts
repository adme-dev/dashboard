import type { H3Event } from 'h3'

export function resolveChatRuntime(event?: H3Event, config?: { aiToolsEnabled?: unknown }): {
  toolsEnabled: boolean
  source: 'binding' | 'runtime_config' | 'process' | 'default'
} {
  const bindings = (event?.context as { cloudflare?: { env?: Record<string, unknown> } } | undefined)?.cloudflare?.env
  let value: unknown
  let source: 'binding' | 'runtime_config' | 'process' | 'default' = 'default'
  if (bindings && Object.prototype.hasOwnProperty.call(bindings, 'AI_TOOLS_ENABLED')) {
    value = bindings.AI_TOOLS_ENABLED
    source = 'binding'
  } else {
    if (!config) {
      try {
        config = useRuntimeConfig(event) as { aiToolsEnabled?: unknown }
      } catch { /* Non-Nuxt callers use process below. */ }
    }
    if (config?.aiToolsEnabled !== undefined) {
      value = config.aiToolsEnabled
      source = 'runtime_config'
    } else if (process.env.AI_TOOLS_ENABLED !== undefined) {
      value = process.env.AI_TOOLS_ENABLED
      source = 'process'
    }
  }
  return { toolsEnabled: value === true || value === 'true', source }
}
