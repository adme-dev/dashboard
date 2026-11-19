import type { H3Event } from 'h3'

/**
 * Employee AI assistant runtime switches, resolved per request.
 *
 * Production Pages is at its 150 text-binding ceiling, so — like `MCP_SUITE_CONFIG` — these switches
 * can be supplied as ONE compact JSON variable, `AI_ASSISTANT_CONFIG`, e.g.
 *   AI_ASSISTANT_CONFIG = '{"tools":true,"observe":true,"memoryDistill":true}'
 *
 * Precedence for each field (first present source wins, mirroring the existing per-flag readers):
 *   1. the individual legacy variable on the Cloudflare request bindings (only exact `true` enables;
 *      any other present value — `false`, empty, malformed — disables),
 *   2. the compact `AI_ASSISTANT_CONFIG` on the request bindings (a present request value never falls
 *      back to a process value),
 *   3. Nuxt private runtime config (build-time `process.env` snapshot),
 *   4. the individual legacy variable in `process.env`, then compact JSON in `process.env`.
 * Invalid JSON, a non-object, an unknown key or a non-boolean value rejects the WHOLE compact source
 * (fail closed); independent legacy variables keep working.
 */
export const ASSISTANT_RUNTIME_FIELDS = ['tools', 'observe', 'observeProactive', 'memoryDistill', 'controllerL2'] as const
export type AssistantRuntimeField = typeof ASSISTANT_RUNTIME_FIELDS[number]

const LEGACY_VARIABLE: Record<AssistantRuntimeField, string> = {
  tools: 'AI_TOOLS_ENABLED',
  observe: 'AI_OBSERVE_ENABLED',
  observeProactive: 'AI_OBSERVE_PROACTIVE_ENABLED',
  memoryDistill: 'AI_MEMORY_DISTILL_ENABLED',
  controllerL2: 'AI_CONTROLLER_L2_ENABLED'
}
const RUNTIME_CONFIG_KEY: Record<AssistantRuntimeField, string> = {
  tools: 'aiToolsEnabled',
  observe: 'aiObserveEnabled',
  observeProactive: 'aiObserveProactiveEnabled',
  memoryDistill: 'aiMemoryDistillEnabled',
  controllerL2: 'aiControllerL2Enabled'
}
export const ASSISTANT_COMPACT_VARIABLE = 'AI_ASSISTANT_CONFIG'

export type AssistantRuntimeSource = 'binding' | 'compact_binding' | 'runtime_config' | 'process' | 'compact_process' | 'default'

export interface AssistantRuntimeSources {
  bindings?: Record<string, unknown>
  runtimeConfig?: Record<string, unknown>
  processEnv?: Record<string, unknown>
}

const has = (record: Record<string, unknown> | undefined, key: string): record is Record<string, unknown> =>
  !!record && Object.prototype.hasOwnProperty.call(record, key)

/** Only exact `true` (boolean or string) enables a legacy/runtime value; anything else present disables. */
const enabledValue = (value: unknown): boolean => value === true || value === 'true'

/** Parse the compact JSON; any invalid shape rejects the whole source (all fields absent). */
export function parseAssistantCompactConfig(raw: unknown): Partial<Record<AssistantRuntimeField, boolean>> {
  if (typeof raw !== 'string' || !raw.trim()) return {}
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return {}
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const out: Partial<Record<AssistantRuntimeField, boolean>> = {}
  for (const [key, field] of Object.entries(value as Record<string, unknown>)) {
    if (!(ASSISTANT_RUNTIME_FIELDS as readonly string[]).includes(key) || typeof field !== 'boolean') return {}
    out[key as AssistantRuntimeField] = field
  }
  return out
}

function defaultSources(event?: H3Event): AssistantRuntimeSources {
  const bindings = (event?.context as { cloudflare?: { env?: Record<string, unknown> } } | undefined)?.cloudflare?.env
  let runtimeConfig: Record<string, unknown> | undefined
  try {
    runtimeConfig = useRuntimeConfig(event) as unknown as Record<string, unknown>
  } catch { /* Unit/non-Nuxt callers fall through to process. */ }
  return { bindings, runtimeConfig, processEnv: process.env as Record<string, unknown> }
}

export function resolveAssistantRuntimeFlag(
  field: AssistantRuntimeField,
  event?: H3Event,
  sources: AssistantRuntimeSources = defaultSources(event)
): { enabled: boolean, source: AssistantRuntimeSource } {
  const legacy = LEGACY_VARIABLE[field]
  const { bindings, runtimeConfig, processEnv } = sources
  if (has(bindings, legacy)) return { enabled: enabledValue(bindings[legacy]), source: 'binding' }
  if (has(bindings, ASSISTANT_COMPACT_VARIABLE)) {
    const compact = parseAssistantCompactConfig(bindings[ASSISTANT_COMPACT_VARIABLE])
    if (compact[field] !== undefined) return { enabled: compact[field] === true, source: 'compact_binding' }
  }
  const configKey = RUNTIME_CONFIG_KEY[field]
  // Build-time snapshot: consulted only when the deployed request bindings say nothing about the field.
  if (has(runtimeConfig, configKey) && runtimeConfig[configKey] !== undefined) {
    return { enabled: enabledValue(runtimeConfig[configKey]), source: 'runtime_config' }
  }
  if (has(processEnv, legacy)) return { enabled: enabledValue(processEnv[legacy]), source: 'process' }
  if (!has(bindings, ASSISTANT_COMPACT_VARIABLE) && has(processEnv, ASSISTANT_COMPACT_VARIABLE)) {
    const compact = parseAssistantCompactConfig(processEnv[ASSISTANT_COMPACT_VARIABLE])
    if (compact[field] !== undefined) return { enabled: compact[field] === true, source: 'compact_process' }
  }
  return { enabled: false, source: 'default' }
}

export function assistantRuntimeEnabled(field: AssistantRuntimeField, event?: H3Event): boolean {
  return resolveAssistantRuntimeFlag(field, event).enabled
}
