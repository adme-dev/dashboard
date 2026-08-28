import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8')
}

describe('Google Tag Manager management endpoints', () => {
  it('requires owner/admin for connect and all live mutations', () => {
    const files = [
      'server/api/agency/tracking/gtm/connect.get.ts',
      'server/api/agency/tracking/gtm/sites/[siteId]/binding.put.ts',
      'server/api/agency/tracking/gtm/sites/[siteId]/install.post.ts',
      'server/api/agency/tracking/gtm/sites/[siteId]/changes/[changeSetId]/publish.post.ts',
      'server/api/agency/tracking/gtm/sites/[siteId]/changes/[changeSetId]/rollback.post.ts',
    ]
    for (const file of files) expect(source(file)).toContain("requireRole(event, ['owner', 'admin'])")
  })

  it('rechecks site access and explicit confirmation at mutation boundaries', () => {
    for (const file of [
      'server/api/agency/tracking/gtm/sites/[siteId]/install.post.ts',
      'server/api/agency/tracking/gtm/sites/[siteId]/changes/[changeSetId]/publish.post.ts',
      'server/api/agency/tracking/gtm/sites/[siteId]/changes/[changeSetId]/rollback.post.ts',
    ]) {
      const text = source(file)
      expect(text).toContain('requireSiteTrackingAccess(event, siteId)')
      expect(text).toContain('confirmed')
      expect(text).toContain('Explicit confirmation is required')
    }
  })

  it('keeps direct GTM publishing independent from generic MCP coordination', () => {
    const installer = source('server/utils/googleTagManagerInstaller.ts')
    expect(installer).toContain('publishGtmVersion')
    expect(installer).not.toContain('God mode')
    expect(installer).not.toContain('/internal/mcp')
    expect(installer).not.toContain('executeWriteConfirm')
  })
})
