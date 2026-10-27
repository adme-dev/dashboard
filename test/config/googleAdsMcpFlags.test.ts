import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const nuxtConfig = readFileSync(new URL('../../nuxt.config.ts', import.meta.url), 'utf8')
const envExample = readFileSync(new URL('../../.env.example', import.meta.url), 'utf8')
const devVarsExample = readFileSync(new URL('../../.dev.vars.example', import.meta.url), 'utf8')
const setupGuide = readFileSync(new URL('../../ENV_SETUP_GUIDE.md', import.meta.url), 'utf8')
const toolsEndpoint = readFileSync(new URL('../../server/api/internal/mcp/tools.post.ts', import.meta.url), 'utf8')
const callEndpoint = readFileSync(new URL('../../server/api/internal/mcp/call.post.ts', import.meta.url), 'utf8')
const registry = readFileSync(new URL('../../server/utils/ai/mcp/registry.ts', import.meta.url), 'utf8')
const runtimeConfig = readFileSync(new URL('../../server/utils/ai/mcp/runtimeConfig.ts', import.meta.url), 'utf8')
const staffPolicy = readFileSync(new URL('../../server/utils/ai/mcp/marketingPolicy.ts', import.meta.url), 'utf8')

const flags = [
  'GOOGLE_ADS_MCP_READ_ENABLED',
  'GOOGLE_ADS_MCP_WRITE_ENABLED',
  'GOOGLE_ADS_MCP_AUTOMATION_ENABLED',
  'GOOGLE_ADS_MCP_DESTRUCTIVE_ENABLED'
] as const

describe('Google Ads MCP flags', () => {
  it('documents all flags as false in both environment templates', () => {
    for (const flag of flags) {
      expect(envExample).toContain(`${flag}=false`)
      expect(devVarsExample).toContain(`${flag}=false`)
      expect(setupGuide).toContain(flag)
    }
  })

  it('maps each flag to a false-by-default private runtime value', () => {
    expect(nuxtConfig).toContain('googleAdsMcpReadEnabled: process.env.GOOGLE_ADS_MCP_READ_ENABLED === \'true\'')
    expect(nuxtConfig).toContain('googleAdsMcpWriteEnabled: process.env.GOOGLE_ADS_MCP_WRITE_ENABLED === \'true\'')
    expect(nuxtConfig).toContain('googleAdsMcpAutomationEnabled: process.env.GOOGLE_ADS_MCP_AUTOMATION_ENABLED === \'true\'')
    expect(nuxtConfig).toContain('googleAdsMcpDestructiveEnabled: process.env.GOOGLE_ADS_MCP_DESTRUCTIVE_ENABLED === \'true\'')
  })

  it('projects and routes Google tools through the existing authenticated MCP endpoints', () => {
    // Ordinary staff projection goes through the shared staff policy, which delegates management
    // staff to the registered suites; flags come from the one binding-first runtime resolver.
    expect(toolsEndpoint).toContain('projectMcpToolsForStaff')
    expect(staffPolicy).toContain('projectRegisteredMcpTools')
    expect(registry).toContain('projectGoogleAdsMcpSuite')
    expect(registry).toContain('projectGoogleAdsTools')
    for (const flag of flags) expect(runtimeConfig).toContain(flag)
    expect(toolsEndpoint).toContain('resolveMcpRuntimeConfig')
    expect(callEndpoint).toContain('resolveMcpRuntimeConfig')
    expect(callEndpoint).toContain('executeGoogleAdsTool')
    expect(callEndpoint).toContain('dispatchGoogleAdsConfirm')
    expect(callEndpoint).not.toContain('/api/internal/mcp/google')
  })
})
