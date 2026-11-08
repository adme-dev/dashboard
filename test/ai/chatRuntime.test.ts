import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveChatRuntime } from '~~/server/utils/ai/chatRuntime'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})
describe('chat runtime and diagnostics share private flag authority', () => {
  it.each([[false, false], ['false', false], ['true', true], [true, true], ['garbage', false], ['', false]])('binding %s overrides a compiled true default', (binding, enabled) => {
    vi.stubEnv('AI_TOOLS_ENABLED', 'true')
    expect(resolveChatRuntime({ context: { cloudflare: { env: { AI_TOOLS_ENABLED: binding } } } } as Parameters<typeof resolveChatRuntime>[0], { aiToolsEnabled: true })).toEqual({ toolsEnabled: enabled, source: 'binding' })
  })
  it('uses compiled private config when process env is absent', () => {
    vi.stubEnv('AI_TOOLS_ENABLED', undefined)
    vi.stubGlobal('useRuntimeConfig', () => ({ aiToolsEnabled: true }))
    expect(resolveChatRuntime({ context: {} } as Parameters<typeof resolveChatRuntime>[0])).toEqual({ toolsEnabled: true, source: 'runtime_config' })
  })
  it('supports server process fallback and defaults closed', () => {
    vi.stubGlobal('useRuntimeConfig', () => {
      throw new Error('outside Nuxt')
    })
    vi.stubEnv('AI_TOOLS_ENABLED', 'true')
    expect(resolveChatRuntime()).toEqual({ toolsEnabled: true, source: 'process' })
    vi.stubEnv('AI_TOOLS_ENABLED', undefined)
    expect(resolveChatRuntime()).toEqual({ toolsEnabled: false, source: 'default' })
  })
})
