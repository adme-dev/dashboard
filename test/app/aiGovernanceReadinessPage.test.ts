import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const page = readFileSync('app/pages/admin/ai/governance.vue', 'utf8')
const list = readFileSync('app/components/ai/DepartmentPackReadinessList.vue', 'utf8')
const seedDialog = readFileSync('app/components/ai/DepartmentDraftSeedDialog.vue', 'utf8')
const navigation = readFileSync('app/layouts/agency.vue', 'utf8')

describe('AI governance readiness page', () => {
  it('shows readiness evidence and exposes only an explicit draft-seeding write lane', () => {
    expect(page).toContain('middleware: [\'role-admin\']')
    expect(page).toContain('/api/admin/ai/governance/readiness')
    expect(page).toContain('Department pack readiness')
    expect(page).toContain('Owner confirmation')
    expect(list).toContain('formatReleaseState(item.releaseState)')
    expect(list).toContain('draft_seeded: { label: \'Draft seeded\'')
    expect(page).toContain('label: \'Seeded drafts\'')
    expect(list).toContain('item.blockers')
    expect(list).toContain('item.knownGaps')
    expect(list).toContain('item.ownerCandidates')
    expect(list).toContain('candidate.eligible')
    expect(list).toContain('emit(\'seed\', item, candidate)')
    expect(list).toContain('Membership required')
    expect(page).toContain('source: \'department_member\'')
    expect(page).toContain('method: \'POST\'')
    expect(page).toContain('confirmation: \'SEED_DRAFT\'')
    expect(seedDialog).toContain('Type SEED_DRAFT to confirm')
    expect(seedDialog).toContain('No model is called')
    expect(seedDialog).not.toMatch(/targetState|evaluationRunId|pilotUserId/)
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
