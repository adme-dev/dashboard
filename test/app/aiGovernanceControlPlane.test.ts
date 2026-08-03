import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

function source(path: string) {
  return existsSync(path) ? readFileSync(path, 'utf8') : ''
}

const page = source('app/pages/admin/ai/governance.vue')
const evaluation = source('app/components/ai/governance/EvaluationRunPanel.vue')
const release = source('app/components/ai/governance/CatalogReleasePanel.vue')
const pilot = source('app/components/ai/governance/PilotMembershipDialog.vue')
const rollout = source('app/components/ai/governance/RolloutReadinessPanel.vue')

describe('AI governance command centre', () => {
  it('shows evaluation identity, gate, cost, and latest result for a seeded draft', () => {
    expect(evaluation).toContain('Evaluation identity')
    expect(evaluation).toContain('Gate result')
    expect(evaluation).toContain('Estimated upper bound')
    expect(evaluation).toContain('Latest result')
    expect(evaluation).toContain('Preflight evaluation')
    expect(evaluation).toContain('/api/admin/ai/governance/evaluations')
    expect(evaluation).toContain('approvalId.value = approval.approvalId')
  })

  it('requires an audit reason and explicit acknowledgement for pilot or active promotion', () => {
    expect(release).toContain('Audit reason')
    expect(release).toContain('I confirm this release transition')
    expect(release).toContain("reason.value.trim().length >= 10")
    expect(release).toContain("targetState === 'pilot' || targetState === 'active'")
    expect(release).toContain('expectedUpdatedAt')
  })

  it('keeps suspend available when the latest evaluation is stale', () => {
    expect(release).toContain("target === 'suspended'")
    expect(release).toContain('Evidence is stale')
    expect(release).toContain('Suspend release')
  })

  it('lists eligible department pilot members and excludes inactive/non-members', () => {
    expect(pilot).toContain('Active department members only')
    expect(pilot).toContain('member.eligible')
    expect(pilot).toContain('No eligible pilot members')
    expect(pilot).toContain('/pilots')
  })

  it('shows uncovered employees without exposing email or activity content', () => {
    expect(rollout).toContain('Uncovered employees')
    expect(rollout).toContain('employee.name')
    expect(rollout).not.toMatch(/employee\.(email|activity|score|usage)/)
    expect(page).toContain('Runtime access changes only after exact-version evidence and explicit confirmation.')
  })
})
