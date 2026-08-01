import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const modal = readFileSync(
  new URL('../../app/components/tracking/ProviderSettingsModal.vue', import.meta.url),
  'utf8'
)
const page = readFileSync(new URL('../../app/pages/agency/tracking/index.vue', import.meta.url), 'utf8')

describe('tracking provider connection UI', () => {
  it('owns a viewport-bounded vertical scroll container inside the agency shell', () => {
    expect(page).toMatch(/<div class="[^"]*h-full[^"]*min-h-0[^"]*overflow-y-auto[^"]*"/)
  })

  it('shows Podium connection status, identity allowlisting, and one-time credentials', () => {
    expect(modal).toContain('/api/leads/endpoints/podium/')
    expect(modal).toContain('organizationUid')
    expect(modal).toContain('locationUids')
    expect(modal).toContain('Shown once')
    expect(modal).toContain('Connect Podium webhook')
    expect(modal).toContain('Rotate secret')
  })

  it('keeps interaction controls independent for sites without Podium or Xtime', () => {
    expect(modal).toContain('Track widget interactions')
    expect(modal).toContain('Track scheduler interactions')
    expect(modal).toContain('requires an Xtime partner feed')
  })

  it('uses the focused provider modal from the tracking site list', () => {
    expect(page).toContain('<TrackingProviderSettingsModal')
  })
})
