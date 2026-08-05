import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '../..')
const wrangler = readFileSync(resolve(root, 'workers/mcp-server/wrangler.toml'), 'utf8')
const pagesWrangler = readFileSync(resolve(root, 'wrangler.toml'), 'utf8')
const deployment = readFileSync(resolve(root, 'workers/mcp-server/DEPLOYMENT.md'), 'utf8')
const operatorGuide = readFileSync(resolve(root, 'docs/mcp-server-guide.md'), 'utf8')

describe('MCP exact-request signing deployment contract', () => {
  it('returns OAuth to the canonical authenticated production origin', () => {
    expect(wrangler).toMatch(/^APP_BASE_URL = "https:\/\/app\.xeroflow\.io"$/m)
    expect(wrangler).not.toContain('agency-dashboard-6cm.pages.dev')
  })

  it('requires the shared request-signing secret on Worker and Pages without embedding a value', () => {
    expect(wrangler).toContain('MCP_REQUEST_SIGNING_SECRET')
    expect(wrangler).not.toMatch(/^\s*MCP_REQUEST_SIGNING_SECRET\s*=/m)
    expect(pagesWrangler).toContain('MCP_REQUEST_SIGNING_SECRET')
    expect(pagesWrangler).not.toMatch(/^\s*MCP_REQUEST_SIGNING_SECRET\s*=/m)

    expect(deployment).toMatch(/Worker[\s\S]*MCP_REQUEST_SIGNING_SECRET/i)
    expect(deployment).toMatch(/Pages[\s\S]*MCP_REQUEST_SIGNING_SECRET/i)
    expect(operatorGuide).toContain('MCP_REQUEST_SIGNING_SECRET')

    for (const document of [wrangler, pagesWrangler, deployment, operatorGuide]) {
      expect(document).not.toMatch(/MCP_REQUEST_SIGNING_SECRET\s*=\s*["'][^"']+["']/)
    }
  })

  it('keeps internal execution delegation Pages-only and makes initial connector migration an explicit outage', () => {
    expect(pagesWrangler).toContain('GOD_MODE_INTERNAL_EXECUTION_SECRET')
    expect(pagesWrangler).not.toMatch(/^\s*GOD_MODE_INTERNAL_EXECUTION_SECRET\s*=/m)
    expect(wrangler).not.toContain('GOD_MODE_INTERNAL_EXECUTION_SECRET')

    for (const document of [deployment, operatorGuide]) {
      expect(document).toMatch(/initial activation[\s\S]*maintenance window/i)
      expect(document).toMatch(/all existing (?:OAuth )?connectors[\s\S]*reconnect[\s\S]*(?:before|at) Worker activation[\s\S]*before traffic reopens/i)
      expect(document).toMatch(/oauthSessionId[\s\S]*(?:fail closed|reject)/i)
      expect(document).toMatch(/initial activation[\s\S]*(?:not availability-safe|never describe[\s\S]*availability-safe)/i)
      expect(document).not.toMatch(/initial activation is (?:zero[- ]downtime|availability-safe)/i)
    }
  })
})
