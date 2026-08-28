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

  it('protects admin health and recoverable disconnect controls', () => {
    const overview = source('server/api/admin/integrations/google-tag-manager/index.get.ts')
    const disconnect = source('server/api/admin/integrations/google-tag-manager/connections/[connectionId].delete.ts')
    expect(overview).toContain("requireRole(event, ['admin', 'owner'])")
    expect(disconnect).toContain("requireRole(event, ['admin', 'owner'])")
    expect(disconnect).toContain('body?.confirmed !== true')
    expect(disconnect).toContain('Explicit confirmation is required')
    expect(source('server/utils/googleTagManagerAdmin.ts')).toContain("status = 'disconnected'")
    expect(source('server/utils/googleTagManagerAdmin.ts')).not.toContain('DELETE FROM gtm_container_bindings')
  })

  it('records quota and credential failures instead of leaving executing change sets behind', () => {
    const installer = source('server/utils/googleTagManagerInstaller.ts')
    const draftTry = installer.indexOf('try {\n    // Remaining calls: workspace')
    const draftQuota = installer.indexOf('await reserveGtmApiQuota(input.publish ? 8 : 6)')
    expect(draftTry).toBeGreaterThan(-1)
    expect(draftQuota).toBeGreaterThan(draftTry)

    for (const operation of ['publishGtmChangeSet', 'rollbackGtmChangeSet']) {
      const start = installer.indexOf(`export async function ${operation}`)
      const end = installer.indexOf('\nexport async function ', start + 1)
      const block = installer.slice(start, end === -1 ? undefined : end)
      expect(block.indexOf('try {')).toBeLessThan(block.indexOf('resolveGtmAccessToken'))
      expect(block).toContain('await failChangeSet')
    }
  })
})
