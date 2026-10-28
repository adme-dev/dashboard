/* eslint-disable @typescript-eslint/no-explicit-any -- Partial database and H3 dependency doubles exercise runtime authority boundaries. */
import { readFileSync } from 'node:fs'
import { parse } from 'smol-toml'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveMarketingProviderConfig } from '~~/server/utils/marketingProviderConfig'
import { resolveMcpRuntimeConfig } from '~~/server/utils/ai/mcp/runtimeConfig'

const config = parse(readFileSync('wrangler.toml', 'utf8')) as any
const intended = {
  generation: true, writes: true, financial: false, video: true, videoGeneration: false,
  banners: true, feeds: true, googleAdsRead: true, googleAdsWrite: true,
  googleAdsAutomation: false, googleAdsDestructive: false
}

describe('marketing management MCP production configuration', () => {
  beforeEach(() => {
    // Model deployed bindings without an ambient developer MCP override.
    for (const key of Object.keys(process.env)) {
      if (key.startsWith('MCP_') || key.startsWith('GOOGLE_ADS_MCP_')) vi.stubEnv(key, undefined)
    }
  })
  afterEach(() => vi.unstubAllEnvs())

  it('replaces three production suite variables with one exact compact configuration', () => {
    const vars = config.env.production.vars
    expect(JSON.parse(vars.MCP_SUITE_CONFIG)).toEqual(intended)
    for (const name of ['MCP_GEN_TOOLS_ENABLED', 'MCP_VIDEO_TOOLS_ENABLED', 'MCP_BANNER_TOOLS_ENABLED']) {
      expect(vars).not.toHaveProperty(name)
    }
    expect(Object.keys(vars).filter(key => key.startsWith('MCP_')).sort())
      .toEqual(['MCP_SERVER_ENABLED', 'MCP_SUITE_CONFIG', 'MCP_WORKER_ORIGIN'])
    const effective = resolveMcpRuntimeConfig({ context: { cloudflare: { env: vars } } } as any)
    expect(effective.serverEnabled).toBe(true)
    expect(effective.suiteFlags).toEqual(intended)
    expect(effective.workerOrigin).toBe('https://mcp-server.adme-dev.workers.dev')
  })

  it('keeps preview disabled without inheriting production compact activation', () => {
    const vars = config.env.preview.vars
    expect(vars.MCP_SERVER_ENABLED).toBe('false')
    expect(vars).not.toHaveProperty('MCP_SUITE_CONFIG')
    const effective = resolveMcpRuntimeConfig({ context: { cloudflare: { env: vars } } } as any)
    expect(effective.serverEnabled).toBe(false)
    expect(Object.values(effective.suiteFlags).every(value => value === false)).toBe(true)
  })
})

it('packs reviewed provider write switches into one production binding and leaves preview off', () => {
  const expected = { pmaxProviderWrites: true, pmaxActivation: true, metaAdPublish: true, emailSending: true }
  expect(resolveMarketingProviderConfig(config.env.production.vars)).toEqual(expected)
  expect(JSON.parse(config.env.production.vars.MARKETING_PROVIDER_CONFIG)).toEqual(expected)
  expect(config.env.preview.vars).not.toHaveProperty('MARKETING_PROVIDER_CONFIG')
  expect(resolveMarketingProviderConfig(config.env.preview.vars)).toEqual({ pmaxProviderWrites: false, pmaxActivation: false, metaAdPublish: false, emailSending: false })
  for (const key of ['GOOGLE_PMAX_PROVIDER_WRITES_ENABLED', 'GOOGLE_PMAX_ACTIVATION_ENABLED', 'META_AD_PUBLISH_ENABLED', 'EMAIL_SENDING_ENABLED']) expect(config.env.production.vars).not.toHaveProperty(key)
})
