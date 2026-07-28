import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync('app/pages/portal/settings.vue', 'utf8')

describe('portal settings composition', () => {
  it('renders agency access as a read-only preview without its proxy email', () => {
    const agencyIdentity = source.slice(
      source.indexOf('<!-- Agency preview identity -->'),
      source.indexOf('<!-- Client profile form -->')
    )

    expect(source).toContain('user?.agencyAccess')
    expect(source).toContain('Agency preview')
    expect(source).toContain('You are viewing')
    expect(source).toContain('Profile editing is unavailable while previewing a client portal.')
    expect(source).toMatch(/v-if="user\?\.agencyAccess"[\s\S]*Read-only preview/)
    expect(agencyIdentity).not.toContain('user?.email')
  })

  it('keeps the real-client profile editable with Nuxt UI form fields', () => {
    expect(source).toMatch(/<form\s+v-else[\s\S]*@submit\.prevent="saveProfile"/)
    expect(source.match(/<UFormField/g)?.length).toBeGreaterThanOrEqual(5)
    expect(source).not.toContain('<label')
    expect(source).toContain('grid grid-cols-1 gap-4 sm:grid-cols-2')
    expect(source).toContain('Save Changes')
  })

  it('keeps enabled portal modules connected to their destinations', () => {
    expect(source).toContain("to: '/portal/projects?view=upcoming'")
    expect(source).toContain("to: '/portal/invoices?view=current'")
    expect(source).toContain("to: '/portal/analytics?metric=leads'")
    expect(source).toContain("to: '/portal/approvals?status=pending'")
    expect(source).toContain("to: '/portal/requests?type=job_request'")
    expect(source).toContain('v-if="module.enabled && module.to"')
  })
})
