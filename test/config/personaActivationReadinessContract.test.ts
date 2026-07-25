import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const root = new URL('../../', import.meta.url)
const source = (path: string) => readFileSync(new URL(path, root), 'utf8')

describe('persona provider activation readiness', () => {
  it('reports every independent activation prerequisite without credentials', () => {
    const endpoint = source('server/api/agency/analytics/personas/activations.get.ts')
    for (const requirement of [
      'identityEntitlement',
      'audienceEntitlement',
      'clientAuthorization',
      'connectionReady',
      'providerConfigured',
      'termsAccepted',
      'emergencyStopped',
      'globalWritesEnabled',
      'requestReady',
      'dispatchReady'
    ]) {
      expect(endpoint).toContain(requirement)
    }
    expect(endpoint).not.toContain('access_token')
    expect(endpoint).not.toContain('refresh_token')
  })

  it('keeps provider readiness visible and disables premature requests', () => {
    const panel = source('app/components/analytics/PersonaActivationPanel.vue')
    expect(panel).toContain('Google Ads readiness')
    expect(panel).toContain('Meta readiness')
    expect(panel).toContain('!selectedReadiness?.requestReady')
    expect(panel).toContain('Activation prerequisites remain.')
  })
})
