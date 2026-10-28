import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readMcpRuntimeValue, resolveMcpRuntimeConfig } from '~~/server/utils/ai/mcp/runtimeConfig'

const SUITE_BINDINGS = {
  generation: 'MCP_GEN_TOOLS_ENABLED',
  writes: 'MCP_WRITE_TOOLS_ENABLED',
  financial: 'MCP_FINANCIAL_TOOLS_ENABLED',
  video: 'MCP_VIDEO_TOOLS_ENABLED',
  videoGeneration: 'MCP_VIDEO_GEN_ENABLED',
  banners: 'MCP_BANNER_TOOLS_ENABLED',
  feeds: 'MCP_FEED_TOOLS_ENABLED',
  googleAdsRead: 'GOOGLE_ADS_MCP_READ_ENABLED',
  googleAdsWrite: 'GOOGLE_ADS_MCP_WRITE_ENABLED',
  googleAdsAutomation: 'GOOGLE_ADS_MCP_AUTOMATION_ENABLED',
  googleAdsDestructive: 'GOOGLE_ADS_MCP_DESTRUCTIVE_ENABLED'
} as const
const ALL_OFF = Object.fromEntries(Object.keys(SUITE_BINDINGS).map(key => [key, false]))
const ALL_ON = Object.fromEntries(Object.keys(SUITE_BINDINGS).map(key => [key, true]))

const USER_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

function eventWith(env: Record<string, unknown> | undefined) {
  return { context: env ? { cloudflare: { env } } : {} } as any
}

describe('MCP runtime configuration', () => {
  beforeEach(() => {
    for (const key of [...Object.values(SUITE_BINDINGS), 'MCP_SUITE_CONFIG']) vi.stubEnv(key, undefined)
  })
  afterEach(() => vi.unstubAllEnvs())

  it('accepts every exact known compact boolean and keeps missing flags disabled', () => {
    expect(resolveMcpRuntimeConfig(eventWith({ MCP_SUITE_CONFIG: JSON.stringify(ALL_ON) })).suiteFlags).toEqual(ALL_ON)
    expect(resolveMcpRuntimeConfig(eventWith({ MCP_SUITE_CONFIG: JSON.stringify(ALL_OFF) })).suiteFlags).toEqual(ALL_OFF)
    expect(resolveMcpRuntimeConfig(eventWith({ MCP_SUITE_CONFIG: '{"writes":true}' })).suiteFlags)
      .toEqual({ ...ALL_OFF, writes: true })
  })

  it.each(Object.entries(SUITE_BINDINGS))('preserves legacy precedence for %s', (field, binding) => {
    for (const value of ['false', '', 'TRUE', 'malformed', null, undefined, true, {}, 1]) {
      vi.stubEnv(binding, 'true')
      const config = resolveMcpRuntimeConfig(eventWith({
        MCP_SUITE_CONFIG: JSON.stringify(ALL_ON), [binding]: value
      }))
      expect(config.suiteFlags).toEqual({ ...ALL_ON, [field]: false })
    }
    expect(resolveMcpRuntimeConfig(eventWith({
      MCP_SUITE_CONFIG: JSON.stringify(ALL_OFF), [binding]: 'true'
    })).suiteFlags).toEqual({ ...ALL_OFF, [field]: true })
  })

  it('uses process compact fallback only when its request binding is absent', () => {
    vi.stubEnv('MCP_SUITE_CONFIG', JSON.stringify(ALL_ON))
    expect(resolveMcpRuntimeConfig().suiteFlags).toEqual(ALL_ON)
    expect(resolveMcpRuntimeConfig(eventWith({})).suiteFlags).toEqual(ALL_ON)
    expect(resolveMcpRuntimeConfig(eventWith({ MCP_SUITE_CONFIG: '{"writes":false}' })).suiteFlags).toEqual(ALL_OFF)
  })

  it('preserves a present process legacy override when its request legacy binding is absent', () => {
    vi.stubEnv('MCP_WRITE_TOOLS_ENABLED', 'false')
    expect(resolveMcpRuntimeConfig(eventWith({ MCP_SUITE_CONFIG: '{"writes":true}' })).suiteFlags.writes).toBe(false)
    vi.stubEnv('MCP_WRITE_TOOLS_ENABLED', 'true')
    expect(resolveMcpRuntimeConfig(eventWith({ MCP_SUITE_CONFIG: '{"writes":false}' })).suiteFlags.writes).toBe(true)
    expect(resolveMcpRuntimeConfig(eventWith({ MCP_WRITE_TOOLS_ENABLED: 'false', MCP_SUITE_CONFIG: '{"writes":true}' })).suiteFlags.writes).toBe(false)
  })

  it.each([
    undefined, null, true, 1, {}, [], '', '{', 'null', '[]', 'true', '1', '"text"',
    '{"writes":true,"feeds":"true"}', '{"writes":true,"feeds":null}',
    '{"writes":true,"feeds":1}', '{"writes":true,"feeds":{}}',
    '{"writes":true,"unknown":false}', '{"writes":true,"__proto__":true}',
    '{"writes":true,"constructor":true}', '{"writes":true,"toString":true}',
    '{"writes":true,"serverEnabled":true}'
  ])('rejects the entire invalid compact source without falling back: %j', (value) => {
    vi.stubEnv('MCP_SUITE_CONFIG', JSON.stringify(ALL_ON))
    expect(resolveMcpRuntimeConfig(eventWith({ MCP_SUITE_CONFIG: value })).suiteFlags).toEqual(ALL_OFF)
    expect(resolveMcpRuntimeConfig(eventWith({ MCP_SUITE_CONFIG: value, MCP_VIDEO_TOOLS_ENABLED: 'true' })).suiteFlags)
      .toEqual({ ...ALL_OFF, video: true })
  })

  it('does not enable the master switch or change independent config through suite JSON', () => {
    vi.stubEnv('MCP_SERVER_ENABLED', 'false')
    vi.stubEnv('MCP_REQUIRE_WRITE_SCOPE', 'true')
    const config = resolveMcpRuntimeConfig(eventWith({ MCP_SUITE_CONFIG: JSON.stringify(ALL_ON), MCP_WORKER_ORIGIN: 'https://mcp.example.test' }))
    expect(config.serverEnabled).toBe(false)
    expect(config.legacyRequireWriteScope).toBe(true)
    expect(config.workerOrigin).toBe('https://mcp.example.test')
    expect(config.suiteFlags).toEqual(ALL_ON)
  })

  it('prefers the request Cloudflare binding over the local process environment', () => {
    vi.stubEnv('MCP_SERVER_ENABLED', 'false')
    vi.stubEnv('MCP_WRITE_TOOLS_ENABLED', 'true')
    vi.stubEnv('MCP_WORKER_ORIGIN', 'https://local.example.test')
    const config = resolveMcpRuntimeConfig(eventWith({
      MCP_SERVER_ENABLED: 'true',
      MCP_WRITE_TOOLS_ENABLED: 'false',
      MCP_WORKER_ORIGIN: 'https://binding.example.test',
      GOOGLE_ADS_MCP_READ_ENABLED: 'true'
    }))
    expect(config.serverEnabled).toBe(true)
    expect(config.workerOrigin).toBe('https://binding.example.test')
    expect(config.suiteFlags.writes).toBe(false)
    expect(config.suiteFlags.googleAdsRead).toBe(true)
  })

  it('falls back to the process environment when no binding is present', () => {
    vi.stubEnv('MCP_SERVER_ENABLED', 'true')
    vi.stubEnv('MCP_BANNER_TOOLS_ENABLED', 'true')
    vi.stubEnv('MCP_REQUIRE_WRITE_SCOPE', 'true')
    const config = resolveMcpRuntimeConfig(eventWith(undefined))
    expect(config.serverEnabled).toBe(true)
    expect(config.suiteFlags.banners).toBe(true)
    expect(config.legacyRequireWriteScope).toBe(true)
    expect(resolveMcpRuntimeConfig(undefined).serverEnabled).toBe(true)
  })

  it('treats a present but non-string binding as authoritative and invalid, not as a fallback', () => {
    vi.stubEnv('MCP_SERVER_ENABLED', 'true')
    vi.stubEnv('MCP_MARKETING_STAFF_GRANTS', JSON.stringify({ [USER_A]: ['reporting'] }))
    const event = eventWith({ MCP_SERVER_ENABLED: { enabled: true }, MCP_MARKETING_STAFF_GRANTS: { [USER_A]: ['reporting'] } })
    expect(readMcpRuntimeValue(event, 'MCP_SERVER_ENABLED')).toBeUndefined()
    const config = resolveMcpRuntimeConfig(event)
    expect(config.serverEnabled).toBe(false)
    expect(config.marketingStaffGrants).toMatchObject({ status: 'invalid' })
    expect(config.marketingStaffGrants.grants.size).toBe(0)
  })

  it('reads marketing grants from the binding first and revokes them when the binding changes', () => {
    vi.stubEnv('MCP_MARKETING_STAFF_GRANTS', JSON.stringify({ [USER_A]: ['reporting'] }))
    expect(resolveMcpRuntimeConfig(eventWith({})).marketingStaffGrants.grants.get(USER_A)).toEqual(['reporting'])
    expect(resolveMcpRuntimeConfig(eventWith({ MCP_MARKETING_STAFF_GRANTS: '{}' })).marketingStaffGrants.grants.size).toBe(0)
  })

  it('defaults every suite and grant to off', () => {
    for (const key of [
      'MCP_SERVER_ENABLED', 'MCP_GEN_TOOLS_ENABLED', 'MCP_WRITE_TOOLS_ENABLED', 'MCP_FINANCIAL_TOOLS_ENABLED',
      'MCP_VIDEO_TOOLS_ENABLED', 'MCP_VIDEO_GEN_ENABLED', 'MCP_BANNER_TOOLS_ENABLED', 'MCP_FEED_TOOLS_ENABLED',
      'GOOGLE_ADS_MCP_READ_ENABLED', 'GOOGLE_ADS_MCP_WRITE_ENABLED', 'GOOGLE_ADS_MCP_AUTOMATION_ENABLED',
      'GOOGLE_ADS_MCP_DESTRUCTIVE_ENABLED', 'MCP_REQUIRE_WRITE_SCOPE', 'MCP_MARKETING_STAFF_GRANTS', 'MCP_WORKER_ORIGIN'
    ]) vi.stubEnv(key, '')
    const config = resolveMcpRuntimeConfig(eventWith({}))
    expect(config.serverEnabled).toBe(false)
    expect(Object.values(config.suiteFlags).every(flag => flag === false)).toBe(true)
    expect(config.marketingStaffGrants).toMatchObject({ status: 'unset' })
    expect(config.workerOrigin).toBe('')
  })
})
