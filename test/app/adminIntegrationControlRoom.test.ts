import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

function source(path: string): string {
  return readFileSync(path, 'utf8')
}

describe('admin integration control room', () => {
  it('makes integration and MCP operations discoverable from both admin navigation surfaces', () => {
    for (const path of ['app/layouts/admin.vue', 'app/layouts/agency.vue', 'app/pages/admin/index.vue']) {
      const text = source(path)
      expect(text).toContain('/admin/connections/integrations')
      expect(text).toContain('/admin/ai/mcp')
    }
  })

  it('shows GTM health and provides an exact tracking-site recovery link', () => {
    const page = source('app/pages/admin/connections/google-tag-manager.vue')
    expect(page).toContain('/api/admin/integrations/google-tag-manager')
    expect(page).toContain('/api/agency/tracking/gtm/connect')
    expect(page).toContain('Manage GTM')
    expect(page).toContain('clientId=${bindingRow(row).clientId}&siteId=${bindingRow(row).trackingSiteId}')
    expect(page).toContain('<UModal')
    expect(page).not.toMatch(/\b(confirm|alert|prompt)\s*\(/)
  })

  it('keeps MCP secret values server-side while exposing health and immutable audit evidence', () => {
    const page = source('app/pages/admin/ai/mcp.vue')
    const endpoint = source('server/api/admin/ai/mcp/status.get.ts')
    expect(page).toContain('/api/admin/ai/mcp/status')
    expect(page).toContain('Recent owner MCP audit')
    expect(endpoint).toContain('WHERE channel = \'mcp\'')
    expect(endpoint).toContain('internalSecretConfigured')
    expect(endpoint).not.toMatch(/internalSecret:\s*process\.env/)
    expect(endpoint).not.toMatch(/requestSigningSecret:\s*process\.env/)
  })

  it('deep-links the tracking manager without making browser GTM depend on God-mode coordination', () => {
    const tracking = source('app/pages/agency/tracking/index.vue')
    const connectors = source('app/pages/agency/ai/connectors.vue')
    expect(tracking).toContain('route.query.clientId')
    expect(tracking).toContain('route.query.siteId')
    expect(tracking).toContain('Install / GTM')
    expect(connectors).toContain('ordinary browser GTM controls do not depend on this MCP path')
  })
})
