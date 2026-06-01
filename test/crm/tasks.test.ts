import { describe, it, expect } from 'vitest'
import {
  deriveStatus,
  buildTaskFilter,
  TaskCreateInput,
  TaskUpdateInput,
} from '~~/server/utils/crm/tasks'

const NOW = new Date('2026-06-01T12:00:00.000Z')

describe('deriveStatus', () => {
  it('returns "overdue" for a pending task past its due_at', () => {
    expect(deriveStatus({ status: 'pending', due_at: '2026-05-30T00:00:00Z' }, NOW)).toBe('overdue')
  })

  it('keeps "pending" for a pending task due in the future', () => {
    expect(deriveStatus({ status: 'pending', due_at: '2026-06-10T00:00:00Z' }, NOW)).toBe('pending')
  })

  it('keeps "pending" for a pending task with no due date', () => {
    expect(deriveStatus({ status: 'pending', due_at: null }, NOW)).toBe('pending')
  })

  it('never marks completed/cancelled/in_progress as overdue even if past due', () => {
    expect(deriveStatus({ status: 'completed', due_at: '2026-05-01T00:00:00Z' }, NOW)).toBe('completed')
    expect(deriveStatus({ status: 'cancelled', due_at: '2026-05-01T00:00:00Z' }, NOW)).toBe('cancelled')
    expect(deriveStatus({ status: 'in_progress', due_at: '2026-05-01T00:00:00Z' }, NOW)).toBe('in_progress')
  })
})

describe('buildTaskFilter', () => {
  it('returns an empty list when no filters are supplied', () => {
    expect(buildTaskFilter({}, NOW)).toEqual([])
  })

  it('maps simple equality filters to single-placeholder conditions', () => {
    const conds = buildTaskFilter(
      { priority: 'high', task_type: 'call', assigned_to: 'u1', target_type: 'opportunity', target_id: 'o1' },
      NOW,
    )
    expect(conds).toEqual([
      { sql: 'priority = ?', params: ['high'] },
      { sql: 'task_type = ?', params: ['call'] },
      { sql: 'assigned_to = ?', params: ['u1'] },
      { sql: 'target_type = ?', params: ['opportunity'] },
      { sql: 'target_id = ?', params: ['o1'] },
    ])
  })

  it('maps a concrete status to an equality condition', () => {
    expect(buildTaskFilter({ status: 'completed' }, NOW)).toEqual([
      { sql: 'status = ?', params: ['completed'] },
    ])
  })

  it('expands the derived "overdue" status into pending + past-due conditions', () => {
    expect(buildTaskFilter({ status: 'overdue' }, NOW)).toEqual([
      { sql: "status = 'pending'", params: [] },
      { sql: 'due_at < ?', params: [NOW.toISOString()] },
    ])
  })
})

describe('TaskCreateInput', () => {
  it('accepts a valid task with defaults applied', () => {
    const parsed = TaskCreateInput.parse({
      client_id: '11111111-1111-4111-8111-111111111111',
      target_type: 'person',
      target_id: '22222222-2222-4222-8222-222222222222',
      title: 'Call back',
    })
    expect(parsed.task_type).toBe('follow_up')
    expect(parsed.priority).toBe('medium')
  })

  it('rejects an empty title', () => {
    expect(() =>
      TaskCreateInput.parse({
        client_id: '11111111-1111-4111-8111-111111111111',
        target_type: 'person',
        target_id: '22222222-2222-4222-8222-222222222222',
        title: '',
      }),
    ).toThrow()
  })

  it('rejects an unknown priority', () => {
    expect(() =>
      TaskCreateInput.parse({
        client_id: '11111111-1111-4111-8111-111111111111',
        target_type: 'person',
        target_id: '22222222-2222-4222-8222-222222222222',
        title: 'x',
        priority: 'whenever',
      }),
    ).toThrow()
  })
})

describe('TaskUpdateInput', () => {
  it('allows a partial update (just status + outcome)', () => {
    const parsed = TaskUpdateInput.parse({ status: 'completed', outcome: 'converted' })
    expect(parsed.status).toBe('completed')
    expect(parsed.outcome).toBe('converted')
  })

  it('rejects an unknown outcome', () => {
    expect(() => TaskUpdateInput.parse({ outcome: 'maybe' })).toThrow()
  })
})
