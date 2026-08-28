import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const component = readFileSync(
  resolve(process.cwd(), 'app/components/tracking/GtmManager.vue'),
  'utf8',
)

describe('TrackingGtmManager', () => {
  it('uses Nuxt UI controls and explicit publish/rollback modals', () => {
    expect(component).toContain('<UFormField label="Google account"')
    expect(component).toContain('<USelectMenu')
    expect(component).toContain('<UModal v-model:open="confirmationOpen">')
    expect(component).toContain('Publish and verify')
    expect(component).toContain('Restore version')
    expect(component).not.toContain('<select')
    expect(component).not.toContain('confirm(')
  })

  it('supports connect, bind, draft, publish, live check and rollback', () => {
    expect(component).toContain('/api/agency/tracking/gtm/connect')
    expect(component).toContain('/binding')
    expect(component).toContain('publish: false')
    expect(component).toContain('publish: true')
    expect(component).toContain('/publish')
    expect(component).toContain('/rollback')
  })
})
