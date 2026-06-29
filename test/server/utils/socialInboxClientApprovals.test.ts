import { describe, expect, it, vi } from 'vitest'
import {
  recordSocialInboxApprovalEvent,
  requestSocialReplyClientApproval
} from '~~/server/utils/socialInbox/clientApprovals'

function recorder() {
  const calls: { sql: string, params: unknown[] }[] = []
  const db = {
    calls,
    queryOne: vi.fn(async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params })
      if (/FROM social_conversations c/.test(sql)) {
        return { id: 'conversation-1', client_id: 'client-1', latest_message_id: 'message-1' }
      }
      if (/FROM social_response_queue/.test(sql)) return null
      if (/INSERT INTO social_response_queue/.test(sql)) {
        return {
          id: 'queue-1',
          client_id: 'client-1',
          conversation_id: 'conversation-1',
          message_id: 'message-1',
          draft_content: params[3],
          status: 'pending',
          approver_type: 'client'
        }
      }
      if (/INSERT INTO social_conversation_events/.test(sql)) return { id: 'event-1' }
      return null
    }),
    execute: vi.fn(async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params })
      return 1
    })
  }
  return db
}

describe('requestSocialReplyClientApproval', () => {
  it('creates a client-routed pending response queue item for the latest inbound message', async () => {
    const db = recorder()
    const row = await requestSocialReplyClientApproval(
      db,
      'conversation-1',
      { content: 'Thanks for the feedback. We will follow this up.' },
      'staff-1'
    )

    expect(row).toMatchObject({ id: 'queue-1', status: 'pending', approver_type: 'client' })
    expect(db.queryOne).toHaveBeenCalledWith(expect.stringMatching(/INSERT INTO social_response_queue/), [
      'client-1',
      'conversation-1',
      'message-1',
      'Thanks for the feedback. We will follow this up.'
    ])
    expect(db.execute).toHaveBeenCalledWith(expect.stringMatching(/awaiting_client_approval/), ['conversation-1'])
    expect(db.calls).toContainEqual(expect.objectContaining({
      params: expect.arrayContaining(['client_approval_requested'])
    }))
  })

  it('updates an existing pending client approval instead of creating a duplicate', async () => {
    const db = recorder()
    db.queryOne = vi.fn(async (sql: string, params: unknown[] = []) => {
      db.calls.push({ sql, params })
      if (/FROM social_conversations c/.test(sql)) {
        return { id: 'conversation-1', client_id: 'client-1', latest_message_id: 'message-1' }
      }
      if (/FROM social_response_queue/.test(sql)) {
        return {
          id: 'queue-1',
          client_id: 'client-1',
          conversation_id: 'conversation-1',
          message_id: 'message-1',
          draft_content: 'old',
          status: 'pending',
          approver_type: 'client'
        }
      }
      if (/UPDATE social_response_queue/.test(sql)) {
        return {
          id: 'queue-1',
          client_id: 'client-1',
          conversation_id: 'conversation-1',
          message_id: 'message-1',
          draft_content: params[2],
          status: 'pending',
          approver_type: 'client'
        }
      }
      if (/INSERT INTO social_conversation_events/.test(sql)) return { id: 'event-1' }
      return null
    })

    const row = await requestSocialReplyClientApproval(db, 'conversation-1', { content: 'updated draft' }, 'staff-1')

    expect(row.draft_content).toBe('updated draft')
    expect(db.queryOne).toHaveBeenCalledWith(expect.stringMatching(/UPDATE social_response_queue/), [
      'queue-1',
      'client-1',
      'updated draft'
    ])
    expect(db.queryOne).not.toHaveBeenCalledWith(expect.stringMatching(/INSERT INTO social_response_queue/), expect.any(Array))
    expect(db.calls).toContainEqual(expect.objectContaining({
      params: expect.arrayContaining(['client_approval_updated'])
    }))
  })

  it('rejects empty drafts and conversations without inbound messages', async () => {
    await expect(requestSocialReplyClientApproval(recorder(), 'conversation-1', { content: '  ' }, 'staff-1'))
      .rejects.toMatchObject({ statusCode: 400, message: 'Draft content required' })

    const db = recorder()
    db.queryOne = vi.fn(async (sql: string, params: unknown[] = []) => {
      db.calls.push({ sql, params })
      if (/FROM social_conversations c/.test(sql)) {
        return { id: 'conversation-1', client_id: 'client-1', latest_message_id: null }
      }
      return null
    })

    await expect(requestSocialReplyClientApproval(db, 'conversation-1', { content: 'draft' }, 'staff-1'))
      .rejects.toMatchObject({ statusCode: 400, message: 'Conversation has no inbound message to approve' })
  })
})

describe('recordSocialInboxApprovalEvent', () => {
  it('writes approval lifecycle events to the case timeline table', async () => {
    const db = recorder()
    await recordSocialInboxApprovalEvent(db, {
      conversationId: 'conversation-1',
      clientId: 'client-1',
      actorId: 'staff-1',
      eventType: 'client_approval_requested',
      content: 'Reply draft sent to client approval.',
      metadata: { response_queue_id: 'queue-1' }
    })

    expect(db.queryOne).toHaveBeenCalledWith(expect.stringMatching(/INSERT INTO social_conversation_events/), [
      'conversation-1',
      'client-1',
      'staff-1',
      'client_approval_requested',
      'Reply draft sent to client approval.',
      JSON.stringify({ response_queue_id: 'queue-1' })
    ])
  })
})
