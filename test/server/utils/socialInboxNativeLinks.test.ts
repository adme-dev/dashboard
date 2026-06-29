import { describe, expect, it, vi } from 'vitest'
import {
  SocialInboxNativeLinkError,
  buildSocialInboxNativeLinkUpdate,
  recordSocialInboxNativeLinkEvent,
  updateSocialInboxNativeLinks
} from '~~/server/utils/socialInbox/nativeLinks'

function fakeDb(options: {
  conversationClientId?: string | null
  validTaskIds?: string[]
  validRequestIds?: string[]
} = {}) {
  const execute = vi.fn(async () => 1)
  const queryOne = vi.fn(async (sql: string, params?: unknown[]) => {
    if (/FROM social_conversations WHERE id/.test(sql)) {
      return options.conversationClientId === null
        ? null
        : { client_id: options.conversationClientId ?? 'client-1' }
    }
    if (/FROM tasks t/.test(sql)) {
      return options.validTaskIds?.includes(String(params?.[0])) ? { id: params?.[0] } : null
    }
    if (/FROM client_requests/.test(sql)) {
      return options.validRequestIds?.includes(String(params?.[0])) ? { id: params?.[0] } : null
    }
    if (/UPDATE social_conversations/.test(sql)) {
      return {
        client_id: options.conversationClientId ?? 'client-1',
        linked_task_id: params?.[0] ?? null,
        linked_client_request_id: params?.[1] ?? null
      }
    }
    if (/INSERT INTO social_conversation_events/.test(sql)) {
      return { id: 'event-1' }
    }
    return null
  })
  return { queryOne, execute }
}

describe('buildSocialInboxNativeLinkUpdate', () => {
  it('accepts task and client request links scoped to the conversation client', async () => {
    const db = fakeDb({ validTaskIds: ['task-1'], validRequestIds: ['request-1'] })

    const update = await buildSocialInboxNativeLinkUpdate(db, 'conversation-1', {
      linked_task_id: 'task-1',
      linked_client_request_id: 'request-1'
    })

    expect(update.sets).toEqual(['linked_task_id = $1', 'linked_client_request_id = $2'])
    expect(update.params).toEqual(['task-1', 'request-1'])
    expect(db.queryOne).toHaveBeenCalledWith(expect.stringMatching(/FROM tasks t/), ['task-1', 'client-1'])
    expect(db.queryOne).toHaveBeenCalledWith(expect.stringMatching(/FROM client_requests/), ['request-1', 'client-1'])
  })

  it('rejects a task outside the conversation client', async () => {
    const db = fakeDb({ validTaskIds: [] })

    await expect(buildSocialInboxNativeLinkUpdate(db, 'conversation-1', { linked_task_id: 'task-2' }))
      .rejects.toMatchObject({ statusCode: 400, message: 'Invalid linked task' })
  })

  it('rejects a request outside the conversation client', async () => {
    const db = fakeDb({ validRequestIds: [] })

    await expect(buildSocialInboxNativeLinkUpdate(db, 'conversation-1', { linked_client_request_id: 'request-2' }))
      .rejects.toMatchObject({ statusCode: 400, message: 'Invalid linked client request' })
  })

  it('allows unlinking either native target', async () => {
    const db = fakeDb()

    const update = await buildSocialInboxNativeLinkUpdate(db, 'conversation-1', {
      linked_task_id: '',
      linked_client_request_id: null
    })

    expect(update.sets).toEqual(['linked_task_id = $1', 'linked_client_request_id = $2'])
    expect(update.params).toEqual([null, null])
  })

  it('throws a typed 404 when the conversation is missing', async () => {
    const db = fakeDb({ conversationClientId: null })

    await expect(buildSocialInboxNativeLinkUpdate(db, 'missing', { linked_task_id: 'task-1' }))
      .rejects.toBeInstanceOf(SocialInboxNativeLinkError)
  })
})

describe('recordSocialInboxNativeLinkEvent', () => {
  it('records native link changes as staff-visible case events', async () => {
    const db = fakeDb()

    const row = await recordSocialInboxNativeLinkEvent(db, 'conversation-1', 'client-1', {
      linked_task_id: 'task-1',
      linked_client_request_id: null
    }, 'user-1')

    expect(row).toEqual({ id: 'event-1' })
    expect(db.queryOne).toHaveBeenLastCalledWith(
      expect.stringMatching(/INSERT INTO social_conversation_events/),
      [
        'conversation-1',
        'client-1',
        'user-1',
        'Native workflow updated: task linked, client request unlinked',
        JSON.stringify({ linked_task_id: 'task-1', linked_client_request_id: null })
      ]
    )
  })
})

describe('updateSocialInboxNativeLinks', () => {
  it('updates the conversation native link columns', async () => {
    const db = fakeDb({ validTaskIds: ['task-1'], validRequestIds: ['request-1'] })

    const row = await updateSocialInboxNativeLinks(db, 'conversation-1', {
      linked_task_id: 'task-1',
      linked_client_request_id: 'request-1'
    })

    expect(row).toMatchObject({
      client_id: 'client-1',
      linked_task_id: 'task-1',
      linked_client_request_id: 'request-1'
    })
    expect(db.queryOne).toHaveBeenLastCalledWith(
      expect.stringMatching(/UPDATE social_conversations SET linked_task_id = \$1, linked_client_request_id = \$2, updated_at = NOW\(\)/),
      ['task-1', 'request-1', 'conversation-1']
    )
  })
})
