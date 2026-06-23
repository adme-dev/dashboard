import { describe, it, expect, vi } from 'vitest'
import { getSocialInbox, socialInboxTool, type SocialInboxDeps, type InboxOverview, type InboxConversation } from '~~/server/utils/ai/tools/socialInbox'
import type { ToolContext } from '~~/server/utils/ai/toolContext'

const ctx: ToolContext = { userId: 'u1', userRole: 'owner', event: {} as any }
const resolveClient = vi.fn().mockResolvedValue({ id: 'c1', name: 'Acme' })
const ov = (): InboxOverview => ({ total: 50, open: 8, responded: 42, avgFirstResponseMinutes: 30, slaTracked: 40, breaches: 3, withinSlaPct: 92, automationRatePct: 25 })
const convo = (i: number, breached: boolean, due: string): InboxConversation => ({ platform: 'facebook', channel_type: 'comment', participant_name: `User ${i}`, last_message_preview: `msg ${i}`, sla_due_at: due, sla_breached: breached })

describe('get_social_inbox', () => {
  it('returns SLA health metrics and breached-first, soonest-due urgent convos', async () => {
    const open = [convo(1, false, '2026-06-25T00:00:00Z'), convo(2, true, '2026-06-24T00:00:00Z'), convo(3, false, '2026-06-23T00:00:00Z')]
    const deps: SocialInboxDeps = { resolveClient, overview: vi.fn().mockResolvedValue(ov()), openConversations: vi.fn().mockResolvedValue(open) }
    const res = await getSocialInbox({ clientName: 'Acme', period: '30d', includeUrgent: true }, ctx, deps)
    expect(res.ok).toBe(true)
    const data = (res as any).data
    expect(data.open).toBe(8); expect(data.slaBreaches).toBe(3)
    expect(data.urgent[0].participant).toBe('User 2') // breached first
    expect(data.urgent).toHaveLength(3)
  })

  it('omits the urgent list when includeUrgent is false (no convo fetch)', async () => {
    const openFn = vi.fn()
    const deps: SocialInboxDeps = { resolveClient, overview: vi.fn().mockResolvedValue(ov()), openConversations: openFn }
    const res = await getSocialInbox({ clientName: 'Acme', period: '30d', includeUrgent: false }, ctx, deps)
    expect(res.ok).toBe(true)
    expect((res as any).data.urgent).toEqual([])
    expect(openFn).not.toHaveBeenCalled()
  })

  it('fails (no fetch) on unknown client; is read-only/untrusted/CLIENTS', async () => {
    const overviewFn = vi.fn()
    const deps: SocialInboxDeps = { resolveClient: vi.fn().mockResolvedValue(null), overview: overviewFn, openConversations: vi.fn() }
    const res = await getSocialInbox({ clientName: 'Nope', period: '30d', includeUrgent: true }, ctx, deps)
    expect(res.ok).toBe(false)
    expect(overviewFn).not.toHaveBeenCalled()
    expect(socialInboxTool.mutates).toBeUndefined()
    expect(socialInboxTool.returnsUntrusted).toBe(true)
    expect(socialInboxTool.requiredPermission).toBe('CLIENTS')
  })
})
