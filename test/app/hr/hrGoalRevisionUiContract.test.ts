import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const page = readFileSync(new URL('../../../app/pages/agency/hr/goals.vue', import.meta.url), 'utf8')

describe('HR department goal revision UI', () => {
  it('opens an existing goal as a version-locked revision', () => {
    expect(page).toContain('function reviseGoal(goal: Goal)')
    expect(page).toContain('editingGoalId')
    expect(page).toContain('expectedVersion')
    expect(page).toContain('Revise goal')
  })

  it('posts revisions to the version subresource while preserving new-goal creation', () => {
    expect(page).toContain('`/api/agency/hr/goals/${editingGoalId.value}/versions`')
    expect(page).toContain("'/api/agency/hr/goals'")
  })
})
