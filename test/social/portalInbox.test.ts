import { describe, it, expect, vi } from 'vitest'
import {
  listPortalConversations,
  getPortalConversation,
  listPortalApprovals,
  loadClientApprovable,
  type PortalConversationFilters,
  type PortalDb
} from '~~/server/utils/socialInbox/portal'

/**
 * The portal data layer is the client-facing read+approve surface. Its single most important
 * property is TENANT ISOLATION: every query must be scoped to the authenticated client's id
 * (never a caller-supplied id), and clients must NEVER see staff internal notes. These tests
 * assert that scoping is present in the generated SQL + params, using an injected fake runner.
 */

function recorder() {
  const calls: { sql: string, params: unknown[] }[] = []
  const db = {
    calls,
    queryOne: vi.fn(async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params })
      return null
    }),
    queryRows: vi.fn(async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params })
      return []
    }),
    execute: vi.fn(async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params })
      return 1
    })
  }
  return db
}

describe('listPortalConversations', () => {
  it('scopes every list to the session client_id as $1 (ignores any caller id)', async () => {
    const db = recorder()
    await listPortalConversations(db, 'client-7', {})
    const { sql, params } = db.calls[0]
    expect(sql).toMatch(/FROM social_conversations/i)
    expect(sql).toMatch(/client_id = \$1/i)
    expect(params[0]).toBe('client-7')
  })

  it('whitelists channel/platform/status filters and never interpolates raw values', async () => {
    const db = recorder()
    await listPortalConversations(db, 'c1', { channel: 'review', platform: 'facebook', status: 'open' })
    const { sql, params } = db.calls[0]
    expect(sql).toMatch(/channel_type = \$/)
    expect(sql).toMatch(/platform = \$/)
    expect(sql).toMatch(/status = \$/)
    expect(params).toContain('review')
    expect(params).toContain('facebook')
    expect(params).toContain('open')
  })

  it('ignores unknown filter keys (no SQL injection surface via filter names)', async () => {
    const db = recorder()
    const filters = { assigned_to: 'staff-1', evil: '; DROP TABLE' } as PortalConversationFilters
    await listPortalConversations(db, 'c1', filters)
    const { sql, params } = db.calls[0]
    expect(sql).not.toMatch(/assigned_to/i)
    expect(params).not.toContain('staff-1')
    expect(params).not.toContain('; DROP TABLE')
  })

  it('caps the LIMIT', async () => {
    const db = recorder()
    await listPortalConversations(db, 'c1', { limit: '99999' })
    const { params } = db.calls[0]
    expect(params[params.length - 1]).toBeLessThanOrEqual(200)
  })
})

describe('getPortalConversation', () => {
  it('returns null when the conversation is not owned by the client (no IDOR)', async () => {
    const db = recorder() // queryOne returns null → not found / not owned
    const res = await getPortalConversation(db, 'client-7', 'conv-1')
    expect(res).toBeNull()
    // the conversation lookup must be scoped by client_id
    const convCall = db.calls.find(c => /FROM social_conversations/i.test(c.sql))!
    expect(convCall.sql).toMatch(/client_id = \$2/)
    expect(convCall.params).toEqual(['conv-1', 'client-7'])
  })

  it('EXCLUDES internal notes from the messages a client can see', async () => {
    const db = recorder()
    db.queryOne = vi.fn(async (sql: string, params: unknown[] = []) => {
      db.calls.push({ sql, params })
      return { id: 'conv-1', client_id: 'client-7' }
    })
    await getPortalConversation(db as PortalDb, 'client-7', 'conv-1')
    const msgCall = db.calls.find(c => /FROM social_messages/i.test(c.sql))!
    expect(msgCall.sql).toMatch(/is_internal_note\s*=\s*FALSE/i)
    expect(msgCall.params).toContain('conv-1')
  })
})

describe('listPortalApprovals', () => {
  it('only surfaces pending items routed to the CLIENT for this client_id', async () => {
    const db = recorder()
    await listPortalApprovals(db, 'client-9')
    const { sql, params } = db.calls[0]
    expect(sql).toMatch(/social_response_queue/i)
    expect(sql).toMatch(/approver_type\s*=\s*'client'/i)
    expect(sql).toMatch(/status\s*=\s*'pending'/i)
    expect(sql).toMatch(/jsonb_agg/i)
    expect(sql).toMatch(/is_internal_note\s*=\s*FALSE/i)
    expect(sql).toMatch(/client_id = \$1/i)
    expect(params[0]).toBe('client-9')
  })
})

describe('loadClientApprovable', () => {
  it('scopes the queue row by client_id AND approver_type=client', async () => {
    const db = recorder()
    await loadClientApprovable(db, 'client-3', 'q-1')
    const { sql, params } = db.calls[0]
    expect(sql).toMatch(/approver_type\s*=\s*'client'/i)
    expect(sql).toMatch(/client_id = \$2/)
    expect(params).toEqual(['q-1', 'client-3'])
  })

  it('returns the row when found', async () => {
    const db = recorder()
    db.queryOne = vi.fn(async () => ({ id: 'q-1', status: 'pending', conversation_id: 'c1', draft_content: 'hi' }))
    const row = await loadClientApprovable(db as PortalDb, 'client-3', 'q-1')
    expect(row?.id).toBe('q-1')
  })
})
