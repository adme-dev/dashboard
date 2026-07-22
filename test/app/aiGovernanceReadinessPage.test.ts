import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const page = readFileSync('app/pages/admin/ai/governance.vue', 'utf8')
const list = readFileSync('app/components/ai/DepartmentPackReadinessList.vue', 'utf8')
const navigation = readFileSync('app/layouts/agency.vue', 'utf8')

describe('AI governance readiness page', () => {
  it('shows all department and owner readiness evidence without activating packs', () => {
    expect(page).toContain('middleware: [\'role-admin\']')
    expect(page).toContain('/api/admin/ai/governance/readiness')
    expect(page).toContain('Department pack readiness')
    expect(page).toContain('Owner confirmation')
    expect(list).toContain('Not seeded')
    expect(list).toContain('item.blockers')
    expect(list).toContain('item.knownGaps')
    expect(page).not.toMatch(/method:\s*['"]POST['"]/)
  })

  it('includes accessible loading and error recovery states and an admin navigation entry', () => {
    expect(page).toContain('aria-busy="true"')
    expect(page).toContain('role="status"')
    expect(page).toContain('Couldn’t load AI governance readiness')
    expect(page).toContain('@click="refresh()"')
    expect(navigation).toContain('label: \'AI Governance\'')
    expect(navigation).toContain('to: \'/admin/ai/governance\'')
  })
})
