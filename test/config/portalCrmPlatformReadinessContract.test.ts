import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const root = new URL('../../', import.meta.url)
const source = (path: string) => readFileSync(new URL(path, root), 'utf8')

describe('portal CRM enterprise readiness surface', () => {
  it('exposes the platform surface from the client CRM without agency mutation APIs', () => {
    const crm = source('app/pages/portal/crm.vue')
    const platform = source('app/components/crm/PlatformReadiness.vue')

    expect(crm).toContain(`{ label: 'Platform', value: 'platform'`)
    expect(crm).toContain('<CrmPlatformReadiness')
    expect(platform).toContain(`'/api/portal/entitlements'`)
    expect(platform).toContain(`'/api/portal/crm/platform-readiness'`)
    expect(platform).not.toContain('/api/agency/')
  })

  it('keeps audience consent and lifecycle evidence on their governed portal routes', () => {
    const platform = source('app/components/crm/PlatformReadiness.vue')

    expect(platform).toContain('to="/portal/analytics/audiences"')
    expect(platform).toContain('to="/portal/measurement"')
    expect(platform).toContain('Client authorization, person-level consent, provider delivery and CRM outcome measurement remain independent')
  })

  it('shows all independently entitled enterprise capabilities', () => {
    const platform = source('app/components/crm/PlatformReadiness.vue')
    for (const feature of [
      'crm.core',
      'crm.external',
      'catalog.sync',
      'mobile.crm',
      'persona.identity',
      'audience.google',
      'audience.meta',
      'communications.sms',
      'communications.voice',
      'ai.receptionist',
      'mcp.crm'
    ]) {
      expect(platform).toContain(`key: '${feature}'`)
    }
  })

  it('keeps the portal audience export lookup unambiguous', () => {
    const endpoint = source('server/api/portal/analytics/audiences.get.ts')

    expect(endpoint).toContain('FROM crm_persona_audience_exports export')
    expect(endpoint).toContain('ORDER BY export.queued_at DESC')
    expect(endpoint).not.toContain('ORDER BY created_at DESC')
  })
})
