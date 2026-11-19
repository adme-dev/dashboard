import { describe, expect, it } from 'vitest'
import { parseAssistantCompactConfig, resolveAssistantRuntimeFlag } from '~~/server/utils/ai/assistantRuntime'

const event = (env: Record<string, unknown>) => ({ context: { cloudflare: { env } } }) as never

describe('assistant runtime switches', () => {
  it('enables a field from the compact AI_ASSISTANT_CONFIG binding (binding-cap friendly)', () => {
    const env = { AI_ASSISTANT_CONFIG: '{"tools":true,"memoryDistill":true}' }
    const sources = { bindings: env, runtimeConfig: { aiToolsEnabled: false, aiMemoryDistillEnabled: false }, processEnv: {} }
    expect(resolveAssistantRuntimeFlag('tools', event(env), sources)).toEqual({ enabled: true, source: 'compact_binding' })
    expect(resolveAssistantRuntimeFlag('memoryDistill', event(env), sources)).toEqual({ enabled: true, source: 'compact_binding' })
    // A field the compact JSON omits falls through to the build-time snapshot (closed).
    expect(resolveAssistantRuntimeFlag('observe', event(env), { ...sources, runtimeConfig: { aiObserveEnabled: false } }))
      .toEqual({ enabled: false, source: 'runtime_config' })
  })

  it('an individual request-binding flag overrides the compact JSON, including an explicit false', () => {
    const env = { AI_ASSISTANT_CONFIG: '{"tools":true}', AI_TOOLS_ENABLED: 'false' }
    expect(resolveAssistantRuntimeFlag('tools', event(env), { bindings: env, runtimeConfig: {}, processEnv: {} }))
      .toEqual({ enabled: false, source: 'binding' })
    const malformed = { AI_TOOLS_ENABLED: 'yes', AI_ASSISTANT_CONFIG: '{"tools":true}' }
    expect(resolveAssistantRuntimeFlag('tools', event(malformed), { bindings: malformed, runtimeConfig: {}, processEnv: {} }).enabled).toBe(false)
  })

  it('rejects the whole compact source on any invalid shape (fail closed)', () => {
    for (const raw of ['not json', '[]', 'null', '{"tools":"true"}', '{"tools":true,"unknownKey":true}', '{"__proto__":true}']) {
      expect(parseAssistantCompactConfig(raw)).toEqual({})
      const env = { AI_ASSISTANT_CONFIG: raw }
      expect(resolveAssistantRuntimeFlag('tools', event(env), { bindings: env, runtimeConfig: { aiToolsEnabled: false }, processEnv: {} }).enabled).toBe(false)
    }
    expect(parseAssistantCompactConfig('{"tools":true,"observe":false,"observeProactive":false,"memoryDistill":true,"controllerL2":false}'))
      .toEqual({ tools: true, observe: false, observeProactive: false, memoryDistill: true, controllerL2: false })
  })

  it('keeps the existing precedence: build-time config before process, process for non-Nuxt callers', () => {
    expect(resolveAssistantRuntimeFlag('tools', undefined, { runtimeConfig: { aiToolsEnabled: true }, processEnv: { AI_TOOLS_ENABLED: 'false' } }))
      .toEqual({ enabled: true, source: 'runtime_config' })
    expect(resolveAssistantRuntimeFlag('tools', undefined, { processEnv: { AI_TOOLS_ENABLED: 'true' } }))
      .toEqual({ enabled: true, source: 'process' })
    expect(resolveAssistantRuntimeFlag('tools', undefined, { processEnv: { AI_ASSISTANT_CONFIG: '{"tools":true}' } }))
      .toEqual({ enabled: true, source: 'compact_process' })
    expect(resolveAssistantRuntimeFlag('tools', undefined, { processEnv: {} })).toEqual({ enabled: false, source: 'default' })
  })

  it('a present request compact value never falls back to a process compact value', () => {
    const env = { AI_ASSISTANT_CONFIG: '{"observe":true}' }
    expect(resolveAssistantRuntimeFlag('tools', event(env), { bindings: env, processEnv: { AI_ASSISTANT_CONFIG: '{"tools":true}' } }))
      .toEqual({ enabled: false, source: 'default' })
  })
})

describe('self-learning respects the personal memory switch', () => {
  it('ships distillation + observe on by default, and both honour My Assistant "memory off"', async () => {
    const { readFileSync } = await import('node:fs')
    const { AI_ASSISTANT_DEFAULTS } = await import('~~/shared/aiAssistantDefaults')
    expect(AI_ASSISTANT_DEFAULTS).toMatchObject({ tools: true, memoryDistill: true, observe: true, observeProactive: false })
    expect(readFileSync('server/utils/aiChatEngine.ts', 'utf8'))
      .toContain("agentConfig.memoryEnabled !== false && assistantRuntimeEnabled('memoryDistill', event)")
    expect(readFileSync('server/api/cron/observe-and-learn.post.ts', 'utf8'))
      .toMatch(/ai_agent_configs c[\s\S]*c\.scope = 'personal' AND c\.memory_enabled = FALSE/)
  })
})
