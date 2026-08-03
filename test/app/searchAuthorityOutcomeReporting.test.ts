import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('Search Authority outcome reporting UI', () => {
  it('shows measured, assisted and unavailable states without promising paid-media changes', () => {
    const source = readFileSync('app/components/search-authority/OutcomeReporting.vue', 'utf8')
    expect(source).toContain('Measured guide views')
    expect(source).toContain('CTA handoffs')
    expect(source).toContain('Directly attributed leads')
    expect(source).toContain('Assisted leads')
    expect(source).toContain('Unavailable')
    expect(source).toContain('Review-only PMax brief')
    expect(source).not.toMatch(/Quality Score|automatically update/i)
  })

  it('mounts agency reporting and adds client-safe outcomes to the portal', () => {
    const workspace = readFileSync('app/components/search-authority/Workspace.vue', 'utf8')
    const portal = readFileSync('app/components/search-authority/PortalSummary.vue', 'utf8')
    expect(workspace).toContain('<SearchAuthorityOutcomeReporting')
    expect(portal).toContain('data.outcomes')
    expect(portal).not.toContain('sourceEvidence.query')
  })
})
