import { describe, it, expect } from 'vitest'
import { parseInboxEntity } from '../../app/utils/inboxEntity'

describe('parseInboxEntity', () => {
  it('resolves a task link to its fetch path', () => {
    expect(parseInboxEntity('/agency/tasks/task-789')).toEqual({
      kind: 'task',
      id: 'task-789',
      apiPath: '/api/agency/tasks/task-789',
      label: 'Task'
    })
  })

  it('resolves a brief link to its fetch path', () => {
    const e = parseInboxEntity('/agency/briefs/b-1')
    expect(e?.kind).toBe('brief')
    expect(e?.apiPath).toBe('/api/agency/briefs/b-1')
  })

  it('strips query and hash from the id', () => {
    expect(parseInboxEntity('/agency/tasks/t1?ref=inbox#comments')?.id).toBe('t1')
  })

  it('returns null for null/empty/unknown links (fallback to plain view)', () => {
    expect(parseInboxEntity(null)).toBeNull()
    expect(parseInboxEntity('')).toBeNull()
    expect(parseInboxEntity('/agency/boards/b1')).toBeNull()
    expect(parseInboxEntity('/agency/automation/escalations')).toBeNull()
    expect(parseInboxEntity('/agency/tasks/')).toBeNull()
  })
})
