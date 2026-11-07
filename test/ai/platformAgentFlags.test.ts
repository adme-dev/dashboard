import { afterEach, describe, expect, it, vi } from 'vitest'
import { platformAgentEnabled } from '~~/server/utils/ai/platformAgentFlags'

afterEach(() => vi.unstubAllEnvs())
describe('native specialist flag authority', () => {
  it('uses the request binding over stale process configuration and fails closed', () => {
    vi.stubEnv('SPEND_CONTROLLER_AGENT_ENABLED', 'true')
    for (const value of ['false', false, 'invalid', null]) expect(platformAgentEnabled({ context: { cloudflare: { env: { SPEND_CONTROLLER_AGENT_ENABLED: value } } } } as Parameters<typeof platformAgentEnabled>[0], 'SPEND_CONTROLLER_AGENT_ENABLED')).toBe(false)
    expect(platformAgentEnabled(undefined, 'SPEND_CONTROLLER_AGENT_ENABLED')).toBe(true)
  })
})
