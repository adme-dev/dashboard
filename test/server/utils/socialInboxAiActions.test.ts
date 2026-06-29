import { describe, expect, it, vi } from 'vitest'
import { proposeSocialInboxAiAction } from '~~/server/utils/socialInbox/aiActions'

function recorder() {
  const calls: { sql: string, params: unknown[] }[] = []
  const db = {
    calls,
    queryOne: vi.fn(async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params })
      if (/FROM social_conversations/.test(sql)) {
        return { id: 'conversation-1', client_id: 'client-1' }
      }
      if (/FROM tasks/.test(sql)) {
        return { id: 'task-1', title: 'Complaint follow-up', project_name: 'Retainer' }
      }
      if (/FROM departments/.test(sql)) {
        return { id: 'department-1', name: 'Social Care' }
      }
      if (/FROM projects/.test(sql)) {
        return { id: 'project-1', name: 'Retainer' }
      }
      if (/INSERT INTO ai_pending_actions/.test(sql)) {
        return { id: 'proposal-1' }
      }
      return null
    })
  }
  return db
}

describe('proposeSocialInboxAiAction', () => {
  it('creates a link-task pending action only after validating task client scope', async () => {
    const db = recorder()

    const proposal = await proposeSocialInboxAiAction(db, 'conversation-1', {
      type: 'link_task',
      taskId: 'task-1',
      reason: 'Existing follow-up task matches this comment.'
    }, 'staff-1')

    expect(proposal).toMatchObject({
      proposalId: 'proposal-1',
      toolName: 'link_social_conversation_task'
    })
    expect(db.queryOne).toHaveBeenCalledWith(expect.stringMatching(/JOIN projects p ON p\.id = t\.project_id/), ['task-1', 'client-1'])
    expect(db.queryOne).toHaveBeenCalledWith(expect.stringMatching(/INSERT INTO ai_pending_actions/), [
      null,
      'staff-1',
      'link_social_conversation_task',
      expect.stringContaining('"socialConversationId":"conversation-1"'),
      'social_inbox'
    ])
  })

  it('creates a social case pending action only after validating project client scope', async () => {
    const db = recorder()

    const proposal = await proposeSocialInboxAiAction(db, 'conversation-1', {
      type: 'create_social_case',
      departmentId: 'department-1',
      projectId: 'project-1',
      title: 'Follow up Facebook complaint',
      description: 'Customer needs a staff response.',
      reason: 'No matching task exists.'
    }, 'staff-1')

    expect(proposal).toMatchObject({
      proposalId: 'proposal-1',
      toolName: 'create_social_case_task'
    })
    expect(db.queryOne).toHaveBeenCalledWith(expect.stringMatching(/FROM departments/), ['department-1'])
    expect(db.queryOne).toHaveBeenCalledWith(expect.stringMatching(/FROM projects/), ['project-1', 'client-1'])
    expect(db.queryOne).toHaveBeenCalledWith(expect.stringMatching(/INSERT INTO ai_pending_actions/), [
      null,
      'staff-1',
      'create_social_case_task',
      expect.stringContaining('"projectId":"project-1"'),
      'social_inbox'
    ])
  })

  it('rejects invalid cross-client links before writing a proposal', async () => {
    const db = recorder()
    db.queryOne.mockImplementation(async (sql: string, params: unknown[] = []) => {
      db.calls.push({ sql, params })
      if (/FROM social_conversations/.test(sql)) return { id: 'conversation-1', client_id: 'client-1' }
      if (/FROM tasks/.test(sql)) return null
      return null
    })

    await expect(proposeSocialInboxAiAction(db, 'conversation-1', {
      type: 'link_task',
      taskId: 'wrong-client-task'
    }, 'staff-1')).rejects.toMatchObject({ statusCode: 400, message: 'Invalid task for this conversation' })

    expect(db.queryOne).not.toHaveBeenCalledWith(expect.stringMatching(/INSERT INTO ai_pending_actions/), expect.any(Array))
  })
})
