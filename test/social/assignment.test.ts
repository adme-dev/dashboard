import { describe, it, expect, vi } from 'vitest'
import { pickRoundRobin, autoAssignConversation } from '~~/server/utils/socialInbox/assignment'

describe('pickRoundRobin', () => {
  it('picks the first member when there is no prior assignee', () => {
    expect(pickRoundRobin(['a', 'b', 'c'], null)).toBe('a')
  })
  it('picks the member after the last assignee', () => {
    expect(pickRoundRobin(['a', 'b', 'c'], 'a')).toBe('b')
    expect(pickRoundRobin(['a', 'b', 'c'], 'b')).toBe('c')
  })
  it('wraps around', () => {
    expect(pickRoundRobin(['a', 'b', 'c'], 'c')).toBe('a')
  })
  it('handles a last assignee no longer in the list', () => {
    expect(pickRoundRobin(['a', 'b'], 'zzz')).toBe('a')
  })
  it('returns null for an empty member list', () => {
    expect(pickRoundRobin([], 'a')).toBeNull()
  })
})

describe('autoAssignConversation', () => {
  function fakeDb(members: string[], lastAssignee: string | null, alreadyAssigned: string | null) {
    return {
      queryOne: vi.fn(async (sql: string) => {
        if (/assigned_to FROM social_conversations WHERE id/.test(sql)) return { assigned_to: alreadyAssigned }
        if (/MAX\(assigned_at\)/.test(sql)) return lastAssignee ? { assigned_to: lastAssignee } : null
        return null
      }),
      queryRows: vi.fn(async (sql: string) => {
        if (/FROM client_team_assignments/.test(sql)) return members.map(team_member_id => ({ team_member_id }))
        return []
      }),
      execute: vi.fn(async () => 1),
    }
  }
  it('assigns the next round-robin member to an unassigned conversation', async () => {
    const db = fakeDb(['u1', 'u2', 'u3'], 'u1', null)
    const r = await autoAssignConversation(db as any, 'conv1', 'client1')
    expect(r).toBe('u2')
    expect(db.execute).toHaveBeenCalledWith(expect.stringMatching(/UPDATE social_conversations SET assigned_to/), expect.arrayContaining(['u2', 'conv1']))
  })
  it('does nothing when the conversation is already assigned', async () => {
    const db = fakeDb(['u1', 'u2'], 'u1', 'u9')
    const r = await autoAssignConversation(db as any, 'conv1', 'client1')
    expect(r).toBeNull()
    expect(db.execute).not.toHaveBeenCalled()
  })
  it('does nothing when the client has no team members', async () => {
    const db = fakeDb([], null, null)
    expect(await autoAssignConversation(db as any, 'conv1', 'client1')).toBeNull()
  })
})
