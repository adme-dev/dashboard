import { describe, it, expect } from 'vitest'
import { pickDepartmentId, resolveTaskAssignee } from '~~/server/utils/briefConversion/assignment'

describe('pickDepartmentId', () => {
  it('returns the first non-empty candidate', () => {
    expect(pickDepartmentId([null, undefined, '', 'dept-2', 'dept-3'])).toBe('dept-2')
  })
  it('trims and skips whitespace-only', () => {
    expect(pickDepartmentId(['  ', 'dept-x'])).toBe('dept-x')
  })
  it('returns null when nothing usable', () => {
    expect(pickDepartmentId([null, undefined, '', '   '])).toBeNull()
  })
})

describe('resolveTaskAssignee', () => {
  it('prefers an explicit default assignee', () => {
    expect(resolveTaskAssignee({ defaultAssigneeId: 'person-1', defaultRole: 'manager', projectManagerId: 'pm-9' }))
      .toEqual({ assigneeId: 'person-1', source: 'explicit' })
  })
  it('maps a manager-ish role to the project manager', () => {
    for (const role of ['Project Manager', 'manager', 'PM', 'account lead', 'Lead']) {
      expect(resolveTaskAssignee({ defaultRole: role, projectManagerId: 'pm-9' }))
        .toEqual({ assigneeId: 'pm-9', source: 'manager' })
    }
  })
  it('leaves non-manager roles unassigned (manual fallback — never guesses a person)', () => {
    expect(resolveTaskAssignee({ defaultRole: 'Designer', projectManagerId: 'pm-9' }))
      .toEqual({ assigneeId: null, source: 'unassigned' })
    expect(resolveTaskAssignee({ defaultRole: null, projectManagerId: 'pm-9' }))
      .toEqual({ assigneeId: null, source: 'unassigned' })
  })
  it('does not invent a PM when none exists', () => {
    expect(resolveTaskAssignee({ defaultRole: 'manager', projectManagerId: null }))
      .toEqual({ assigneeId: null, source: 'unassigned' })
  })
})
