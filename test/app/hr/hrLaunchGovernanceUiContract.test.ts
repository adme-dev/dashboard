import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const page = readFileSync('app/pages/agency/hr/governance.vue', 'utf8')
const hub = readFileSync('app/pages/agency/hr/index.vue', 'utf8')
const layout = readFileSync('app/layouts/agency.vue', 'utf8')

describe('HR launch governance UI contract', () => {
  it('shows every gate, readiness, evidence, history, and expiry', () => {
    expect(page).toContain('/api/agency/hr/governance/launch-readiness')
    expect(page).toContain('/api/agency/hr/governance/launch-attestations')
    expect(page).toContain('/api/agency/hr/governance/pilot-readiness')
    for (const text of ['Launch clearance', 'Evidence reference', 'Limitations', 'Approval history', 'Expiry']) {
      expect(page).toContain(text)
    }
  })

  it('shows pilot blockers with direct remediation routes', () => {
    for (const text of ['Pilot preflight', 'Owner onboarding', 'Published role', 'Eligible participant', 'Email delivery']) expect(page).toContain(text)
    expect(page).toContain("to: '/agency/hr/onboarding'")
    expect(page).toContain("to: '/agency/hr/roles'")
    expect(page).toContain("to: '/agency/hr/reviews'")
  })

  it('keeps long gate and history sections scrollable', () => {
    expect(page.match(/overflow-y-auto/g)?.length).toBeGreaterThanOrEqual(2)
  })

  it('is reachable from both the HR hub and agency navigation', () => {
    expect(hub).toContain('to="/agency/hr/governance"')
    expect(layout).toContain("to: '/agency/hr/governance'")
  })
})
