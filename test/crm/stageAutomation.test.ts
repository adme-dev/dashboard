import { describe, it, expect } from 'vitest'
import { buildAutomationTasks, type StageAutomationRule } from '~~/server/utils/crm/stageAutomation'

const NOW = new Date('2026-06-01T00:00:00.000Z')
const opp = { id: 'opp-1', owner_id: 'owner-9' }

function rule(partial: Partial<StageAutomationRule>): StageAutomationRule {
  return {
    id: 'r1', client_id: 'c1', stage_id: 's1', object_type: 'opportunity',
    action: 'create_task', is_active: true, task_template: {}, ...partial,
  }
}

describe('buildAutomationTasks', () => {
  it('maps an active create_task rule to a task due now + offset days', () => {
    const tasks = buildAutomationTasks(
      [rule({ task_template: { title: 'Call', task_type: 'call', priority: 'high', due_offset_days: 2 } })],
      opp, NOW,
    )
    expect(tasks).toHaveLength(1)
    expect(tasks[0]).toMatchObject({ title: 'Call', task_type: 'call', priority: 'high', assigned_to: 'owner-9' })
    expect(tasks[0].due_at).toBe('2026-06-03T00:00:00.000Z')
  })

  it('uses template.assigned_to when present, else falls back to the opportunity owner', () => {
    const withAssignee = buildAutomationTasks([rule({ task_template: { title: 'X', assigned_to: 'rep-2' } })], opp, NOW)
    expect(withAssignee[0].assigned_to).toBe('rep-2')
    const fallback = buildAutomationTasks([rule({ task_template: { title: 'X' } })], opp, NOW)
    expect(fallback[0].assigned_to).toBe('owner-9')
  })

  it('applies sensible defaults when template fields are missing', () => {
    const tasks = buildAutomationTasks([rule({ task_template: {} })], opp, NOW)
    expect(tasks[0]).toMatchObject({ title: 'Follow up', task_type: 'follow_up', priority: 'medium', due_at: null })
  })

  it('skips inactive rules and non-create_task actions', () => {
    const tasks = buildAutomationTasks(
      [
        rule({ is_active: false, task_template: { title: 'inactive' } }),
        rule({ action: 'other' as 'create_task', task_template: { title: 'wrong-action' } }),
        rule({ task_template: { title: 'keep' } }),
      ],
      opp, NOW,
    )
    expect(tasks.map(t => t.title)).toEqual(['keep'])
  })
})
