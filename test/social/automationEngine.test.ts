import { describe, it, expect, vi } from 'vitest'
import { selectRule, resolveEffectiveMode, runAutomationForConversation } from '~~/server/utils/socialInbox/automation'
import type { AutomationRule, AutomationContext, ReplyDraft } from '~~/server/utils/socialInbox/automationTypes'

const rule = (over: Partial<AutomationRule> = {}): AutomationRule => ({
  id: 'r1', client_id: 'cl1', name: 'r', platform: null, channel_type: null, mode: 'autopilot',
  conditions: {}, action: {}, approval_by: 'staff', rate_limit: 0, confidence_floor: 0.7,
  business_hours: null, priority: 100, enabled: true, ...over,
})
const ctx = (over: Partial<AutomationContext> = {}): AutomationContext => ({
  conversationId: 'c1', clientId: 'cl1', platform: 'facebook', channelType: 'comment',
  rating: null, inboundMessageId: 'm1', inboundContent: 'how much is shipping?',
  participantName: 'Sam', now: new Date('2026-06-01T03:00:00Z'), ...over,
})

describe('selectRule — priority + match', () => {
  it('picks the lowest-priority enabled rule that matches platform+channel', () => {
    const rules = [
      rule({ id: 'a', priority: 200, platform: null, channel_type: null }),
      rule({ id: 'b', priority: 50, platform: 'facebook', channel_type: 'comment' }),
      rule({ id: 'c', priority: 10, platform: 'instagram', channel_type: 'comment' }), // wrong platform
    ]
    expect(selectRule(rules, ctx())?.id).toBe('b')
  })
  it('ignores disabled rules and condition mismatches', () => {
    const rules = [
      rule({ id: 'a', priority: 10, enabled: false }),
      rule({ id: 'b', priority: 20, conditions: { keywordsAny: ['refund'] } }), // no match
      rule({ id: 'c', priority: 30 }),
    ]
    expect(selectRule(rules, ctx())?.id).toBe('c')
  })
  it('returns null when nothing matches', () => {
    expect(selectRule([rule({ platform: 'tiktok' })], ctx())).toBeNull()
  })
})

describe('resolveEffectiveMode — guardrails', () => {
  const goodDraft: ReplyDraft = { reply: 'Sure, $9 flat.', confidence: 0.95, risk: false }
  it('autopilot stays autopilot when all guardrails pass', () => {
    const r = resolveEffectiveMode(rule({ mode: 'autopilot' }), ctx(), goodDraft, { recentCount: 0 })
    expect(r.mode).toBe('autopilot')
  })
  it('HARD rule: risky inbound forces approval even for autopilot', () => {
    const r = resolveEffectiveMode(rule({ mode: 'autopilot' }), ctx({ inboundContent: 'this is a scam, refund me' }), goodDraft, { recentCount: 0 })
    expect(r.mode).toBe('approval')
    expect(r.notes).toMatch(/risk/i)
  })
  it('model self-risk forces approval', () => {
    const r = resolveEffectiveMode(rule({ mode: 'autopilot' }), ctx(), { ...goodDraft, risk: true }, { recentCount: 0 })
    expect(r.mode).toBe('approval')
  })
  it('confidence below floor downgrades autopilot to approval', () => {
    const r = resolveEffectiveMode(rule({ mode: 'autopilot', confidence_floor: 0.8 }), ctx(), { ...goodDraft, confidence: 0.5 }, { recentCount: 0 })
    expect(r.mode).toBe('approval')
    expect(r.notes).toMatch(/confidence/i)
  })
  it('rate limit exceeded → skip', () => {
    const r = resolveEffectiveMode(rule({ mode: 'autopilot', rate_limit: 5 }), ctx(), goodDraft, { recentCount: 5 })
    expect(r.mode).toBe('skip')
    expect(r.notes).toMatch(/rate/i)
  })
  it('outside business hours downgrades autopilot to approval', () => {
    const bh = { tz: 'UTC', days: [1, 2, 3, 4, 5], start: '09:00', end: '17:00' }
    const r = resolveEffectiveMode(rule({ mode: 'autopilot', business_hours: bh, conditions: { businessHoursOnly: true } }),
      ctx({ now: new Date('2026-06-01T02:00:00Z') }), goodDraft, { recentCount: 0 }) // 02:00 UTC, before open
    expect(r.mode).toBe('approval')
    expect(r.notes).toMatch(/hours/i)
  })
  it('approval mode is never upgraded', () => {
    const r = resolveEffectiveMode(rule({ mode: 'approval' }), ctx(), goodDraft, { recentCount: 0 })
    expect(r.mode).toBe('approval')
  })
})

describe('runAutomationForConversation — orchestration with fakes', () => {
  function fakeDb(rows: Record<string, any[]>) {
    return {
      queryOne: vi.fn(async (sql: string) => {
        if (/FROM social_conversations/.test(sql)) return rows.conv?.[0] ?? null
        if (/FROM social_messages/.test(sql)) return rows.inbound?.[0] ?? null
        if (/FROM social_response_queue WHERE message_id/.test(sql)) return rows.existing?.[0] ?? null
        if (/COUNT/.test(sql)) return { n: rows.recentCount?.[0]?.n ?? 0 }
        if (/INSERT INTO social_response_queue/.test(sql)) return { id: 'q1' }
        return null
      }),
      queryRows: vi.fn(async (sql: string) => {
        if (/FROM social_automation_rules/.test(sql)) return rows.rules ?? []
        return []
      }),
      execute: vi.fn(async () => 1),
    }
  }
  const convRow = { id: 'c1', client_id: 'cl1', platform: 'facebook', channel_type: 'comment', rating: null }
  const inboundRow = { id: 'm1', content: 'how much is shipping?', author_name: 'Sam' }

  it('no matching rule → clears pending, no queue row, no dispatch', async () => {
    const db = fakeDb({ conv: [convRow], inbound: [inboundRow], rules: [] })
    const deps = { generateDraft: vi.fn(), dispatch: vi.fn() }
    await runAutomationForConversation(db as any, deps as any, 'c1')
    expect(deps.generateDraft).not.toHaveBeenCalled()
    expect(deps.dispatch).not.toHaveBeenCalled()
    expect(db.execute).toHaveBeenCalledWith(expect.stringMatching(/automation_state\s*=\s*NULL/), expect.anything())
  })

  it('off/suggest rule → no draft, no queue', async () => {
    const db = fakeDb({ conv: [convRow], inbound: [inboundRow], rules: [rule({ mode: 'suggest' })] })
    const deps = { generateDraft: vi.fn(), dispatch: vi.fn() }
    await runAutomationForConversation(db as any, deps as any, 'c1')
    expect(deps.generateDraft).not.toHaveBeenCalled()
  })

  it('autopilot + clean draft → dispatch called', async () => {
    const db = fakeDb({ conv: [convRow], inbound: [inboundRow], rules: [rule({ mode: 'autopilot' })] })
    const deps = {
      generateDraft: vi.fn(async (): Promise<ReplyDraft> => ({ reply: '$9 flat', confidence: 0.95, risk: false })),
      dispatch: vi.fn(async () => ({ ok: true, platformMessageId: 'pm1' })),
    }
    await runAutomationForConversation(db as any, deps as any, 'c1')
    expect(deps.generateDraft).toHaveBeenCalledOnce()
    expect(deps.dispatch).toHaveBeenCalledOnce()
  })

  it('autopilot + risky inbound → queue row, NO dispatch', async () => {
    const db = fakeDb({ conv: [convRow], inbound: [{ ...inboundRow, content: 'refund me you scam' }], rules: [rule({ mode: 'autopilot' })] })
    const deps = {
      generateDraft: vi.fn(async (): Promise<ReplyDraft> => ({ reply: 'x', confidence: 0.95, risk: false })),
      dispatch: vi.fn(),
    }
    await runAutomationForConversation(db as any, deps as any, 'c1')
    expect(deps.dispatch).not.toHaveBeenCalled()
    expect(db.queryOne).toHaveBeenCalledWith(expect.stringMatching(/INSERT INTO social_response_queue/), expect.anything())
  })

  it('idempotent: existing queue row for the inbound → no draft, no dispatch', async () => {
    const db = fakeDb({ conv: [convRow], inbound: [inboundRow], existing: [{ id: 'q-old' }], rules: [rule({ mode: 'autopilot' })] })
    const deps = { generateDraft: vi.fn(), dispatch: vi.fn() }
    await runAutomationForConversation(db as any, deps as any, 'c1')
    expect(deps.generateDraft).not.toHaveBeenCalled()
    expect(deps.dispatch).not.toHaveBeenCalled()
  })
})
