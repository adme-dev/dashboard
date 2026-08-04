import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMyAssistantGetHandler } from '~~/server/api/agency/ai/my-assistant.get'
import { createObserveAndLearnHandler } from '~~/server/api/cron/observe-and-learn.post'
import {
  resolveObserveAndLearnRuntimePolicy
} from '~~/server/utils/ai/observe/runtimePolicy'

const USER_ID = '50000000-0000-4000-8000-000000000001'

interface TestEvent {
  context: {
    cloudflare?: { env?: Record<string, unknown> }
  }
  headers?: Record<string, string>
  node?: { req: { headers: Record<string, string> } }
}

afterEach(() => {
  vi.unstubAllGlobals()
  delete process.env.AI_OBSERVE_ENABLED
  delete process.env.CRON_SECRET
})

describe('observe-and-learn request policy', () => {
  it('prefers a true Cloudflare request binding over a false process value', () => {
    const event = {
      context: { cloudflare: { env: { AI_OBSERVE_ENABLED: 'true' } } }
    } as TestEvent

    expect(resolveObserveAndLearnRuntimePolicy(event as never, {
      runtimeConfig: { aiObserveEnabled: false },
      processEnv: { AI_OBSERVE_ENABLED: 'false' }
    })).toEqual({ enabled: true })
  })

  it('prefers a false Cloudflare request binding over a true process value', () => {
    const event = {
      context: { cloudflare: { env: { AI_OBSERVE_ENABLED: 'false' } } }
    } as TestEvent

    expect(resolveObserveAndLearnRuntimePolicy(event as never, {
      runtimeConfig: { aiObserveEnabled: true },
      processEnv: { AI_OBSERVE_ENABLED: 'true' }
    })).toEqual({ enabled: false })
  })

  it.each([
    [true, true],
    [false, false],
    ['true', true],
    ['false', false]
  ])('accepts only validated runtime-config booleans (%j)', (configured, enabled) => {
    expect(resolveObserveAndLearnRuntimePolicy({ context: {} } as never, {
      runtimeConfig: { aiObserveEnabled: configured },
      processEnv: { AI_OBSERVE_ENABLED: enabled ? 'false' : 'true' }
    })).toEqual({ enabled })
  })

  it.each([
    [undefined, undefined],
    ['invalid', 'true'],
    [1, 'true']
  ])('fails safely for a missing or invalid request binding (%j)', (binding, processValue) => {
    const env = binding === undefined ? {} : { AI_OBSERVE_ENABLED: binding }
    const event = { context: { cloudflare: { env } } } as TestEvent

    expect(resolveObserveAndLearnRuntimePolicy(event as never, {
      runtimeConfig: {},
      processEnv: { AI_OBSERVE_ENABLED: processValue }
    })).toEqual({ enabled: false })
  })

  it.each([
    { binding: 'true', processValue: 'false', enabled: true },
    { binding: 'false', processValue: 'true', enabled: false }
  ])('reports exactly the cron execution decision for binding=$binding', async ({
    binding,
    processValue,
    enabled
  }) => {
    process.env.AI_OBSERVE_ENABLED = processValue
    process.env.CRON_SECRET = 'test'
    vi.stubGlobal('useRuntimeConfig', () => ({ aiObserveEnabled: processValue === 'true' }))
    const event = {
      context: { cloudflare: { env: { AI_OBSERVE_ENABLED: binding } } },
      headers: { 'x-cron-secret': 'test' },
      node: { req: { headers: { 'x-cron-secret': 'test' } } }
    } as TestEvent
    let displayedStatus: boolean | undefined
    const assistantHandler = createMyAssistantGetHandler({
      requireAuth: vi.fn().mockResolvedValue({ id: USER_ID }),
      resolvePersonalAssistantContext: vi.fn(async input => {
        displayedStatus = input.observedMemoryEnabled
        return { preferences: { personaKey: null } } as never
      }),
      buildMyAssistantExplainability: vi.fn().mockReturnValue({ ok: true }),
      getRuntimePolicy: vi.fn().mockReturnValue({
        mode: 'legacy',
        authenticatedCoreTools: ['search_knowledge', 'get_tasks']
      }),
      tools: []
    })
    const runObservePass = vi.fn().mockResolvedValue({ users: 0, events: 0, routines: 0, memories: 0 })
    const cronHandler = createObserveAndLearnHandler({
      runObservePass
    })

    await assistantHandler(event as never)
    const cronResult = await cronHandler(event as never)

    expect(displayedStatus).toBe(enabled)
    expect(runObservePass).toHaveBeenCalledTimes(enabled ? 1 : 0)
    expect(cronResult).toEqual(enabled
      ? { ok: true, users: 0, events: 0, routines: 0, memories: 0 }
      : { ok: true, skipped: 'disabled' })
  })
})
