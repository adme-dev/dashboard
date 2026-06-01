import { describe, it, expect, vi } from 'vitest'
import { computeSlaDueAt, applySlaOnInbound, findBreaches } from '~~/server/utils/socialInbox/sla'

describe('computeSlaDueAt', () => {
  it('adds target_minutes to now', () => {
    const now = new Date('2026-06-02T00:00:00.000Z')
    expect(computeSlaDueAt({ target_minutes: 60 }, now)).toBe('2026-06-02T01:00:00.000Z')
  })
  it('defaults to 240 minutes when target is missing/invalid', () => {
    const now = new Date('2026-06-02T00:00:00.000Z')
    expect(computeSlaDueAt({ target_minutes: 0 }, now)).toBe('2026-06-02T04:00:00.000Z')
    expect(computeSlaDueAt({} as any, now)).toBe('2026-06-02T04:00:00.000Z')
  })
})

describe('applySlaOnInbound', () => {
  function db(policy: any, current: { sla_due_at: string | null }) {
    return {
      queryOne: vi.fn(async (sql: string) => {
        if (/FROM social_sla_policies/.test(sql)) return policy
        if (/sla_due_at FROM social_conversations/.test(sql)) return current
        return null
      }),
      execute: vi.fn(async () => 1),
    }
  }
  it('stamps sla_due_at on a conversation with no due date when a policy exists', async () => {
    const d = db({ target_minutes: 120 }, { sla_due_at: null })
    const r = await applySlaOnInbound(d as any, 'conv1', 'client1', 'comment', new Date('2026-06-02T00:00:00.000Z'))
    expect(r).toBe('2026-06-02T02:00:00.000Z')
    expect(d.execute).toHaveBeenCalledWith(expect.stringMatching(/SET sla_due_at/), expect.arrayContaining(['conv1']))
  })
  it('does not overwrite an existing sla_due_at', async () => {
    const d = db({ target_minutes: 120 }, { sla_due_at: '2026-06-02T05:00:00.000Z' })
    expect(await applySlaOnInbound(d as any, 'conv1', 'client1', 'comment', new Date())).toBeNull()
    expect(d.execute).not.toHaveBeenCalled()
  })
  it('does nothing when no SLA policy applies', async () => {
    const d = db(null, { sla_due_at: null })
    expect(await applySlaOnInbound(d as any, 'conv1', 'client1', 'comment', new Date())).toBeNull()
  })
})

describe('findBreaches', () => {
  it('flags overdue, unanswered, not-yet-breached conversations and returns them', async () => {
    const rows = [{ id: 'c1', client_id: 'cl1', assigned_to: 'u1' }]
    const db = {
      queryRows: vi.fn(async () => rows),
      execute: vi.fn(async () => 1),
    }
    const breached = await findBreaches(db as any)
    expect(breached).toEqual(rows)
    expect(db.execute).toHaveBeenCalledWith(expect.stringMatching(/SET sla_breached = TRUE/), expect.anything())
  })
})
