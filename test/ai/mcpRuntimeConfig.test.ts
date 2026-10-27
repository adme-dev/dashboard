import { afterEach, describe, expect, it, vi } from 'vitest'
import { readMcpRuntimeValue, resolveMcpRuntimeConfig } from '~~/server/utils/ai/mcp/runtimeConfig'

const USER_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

function eventWith(env: Record<string, unknown> | undefined) {
  return { context: env ? { cloudflare: { env } } : {} } as any
}

describe('MCP runtime configuration', () => {
  afterEach(() => vi.unstubAllEnvs())

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
