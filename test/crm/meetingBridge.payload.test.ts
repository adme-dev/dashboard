import { describe, it, expect } from 'vitest'
import { buildCrmTaskPayload } from '~~/server/utils/crm/meetingBridge'
import type { ActionItemForBridge, TargetRef } from '~~/server/utils/crm/meetingBridge'

const actionItem: ActionItemForBridge = {
  id: 'ai1',
  meeting_session_id: 'm1',
  meeting_title: 'Acme Q3 review',
  source_artifact_id: 'art1',
  content: 'Send the renewal proposal to Jane by Friday',
  due_at: '2026-06-05T09:00:00.000Z',
}
const target: TargetRef = { client_id: 'c1', target_type: 'opportunity', target_id: 'o1', label: 'Acme renewal' }

describe('buildCrmTaskPayload', () => {
  it('maps content, target, due_at and task_type=meeting', () => {
    const p = buildCrmTaskPayload(actionItem, target)
    expect(p.client_id).toBe('c1')
    expect(p.target_type).toBe('opportunity')
    expect(p.target_id).toBe('o1')
    expect(p.title).toBe('Send the renewal proposal to Jane by Friday')
    expect(p.task_type).toBe('meeting')
    expect(p.priority).toBe('medium')
    expect(p.due_at).toBe('2026-06-05T09:00:00.000Z')
    expect(p.description).toContain('Acme Q3 review')
    expect(p.description).toContain('ai1')
  })

  it('truncates title to 255 chars and honours an explicit priority', () => {
    const long = { ...actionItem, content: 'x'.repeat(300) }
    const p = buildCrmTaskPayload(long, target, { priority: 'high' })
    expect(p.title).toHaveLength(255)
    expect(p.priority).toBe('high')
  })

  it('null due_at passes through as null', () => {
    const p = buildCrmTaskPayload({ ...actionItem, due_at: null }, target)
    expect(p.due_at).toBeNull()
  })
})
