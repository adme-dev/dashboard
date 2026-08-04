import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '../..')
const wrangler = readFileSync(resolve(root, 'workers/mcp-server/wrangler.toml'), 'utf8')
const pagesWrangler = readFileSync(resolve(root, 'wrangler.toml'), 'utf8')
const deployment = readFileSync(resolve(root, 'workers/mcp-server/DEPLOYMENT.md'), 'utf8')
const operatorGuide = readFileSync(resolve(root, 'docs/mcp-server-guide.md'), 'utf8')

describe('MCP exact-request signing deployment contract', () => {
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
})
